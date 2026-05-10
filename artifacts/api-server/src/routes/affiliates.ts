import { Router } from "express";
import { db } from "@workspace/db";
import {
  referralsTable, payoutRequestsTable, usersTable, platformSettingsTable,
  affiliateApplicationsTable, affiliateClicksTable, affiliateKycTable,
  affiliateBankDetailsTable, affiliateCreativesTable, affiliatePixelTable,
  coursesTable, paymentsTable, bundlesTable, commissionGroupsTable, enrollmentsTable,
  paymentGatewaysTable,
} from "@workspace/db";
import { eq, and, sum, count, sql, desc, gte, lt, lte, ne, isNotNull, isNull, or } from "drizzle-orm";
import { requireAuth, requireAdmin, type JwtPayload } from "../middlewares/auth";
import type { Request } from "express";
import crypto from "crypto";
import { sendFbEvent, sendFbTestEvent } from "../lib/facebook-pixel";
import { triggerAutomation, triggerFunnel, getPublicBaseUrl } from "./crm";
import { gatewayFetch } from "./payments";

const PaytmChecksum = require("paytmchecksum");

const router = Router();
type AuthedRequest = Request & { user: JwtPayload };

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").substring(0, 16);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

/** Returns a Date representing midnight IST, N days ago, expressed as UTC */
function dayStart(daysAgo: number): Date {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const midnightIST = new Date(Date.UTC(
    nowIST.getUTCFullYear(),
    nowIST.getUTCMonth(),
    nowIST.getUTCDate() - daysAgo,
    0, 0, 0, 0
  ));
  return new Date(midnightIST.getTime() - IST_OFFSET_MS);
}

/** Returns YYYY-MM-DD in IST for grouping/display */
function istDateKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().substring(0, 10);
}

/* ── Affiliate Fee ── */
router.get("/fee", async (_req, res): Promise<void> => {
  const [settings] = await db.select({
    affiliateFeeEnabled: platformSettingsTable.affiliateFeeEnabled,
    affiliateFeeAmount: platformSettingsTable.affiliateFeeAmount,
    currency: platformSettingsTable.currency,
  }).from(platformSettingsTable).limit(1);
  res.json({
    enabled: settings?.affiliateFeeEnabled ?? false,
    amount: settings?.affiliateFeeAmount ?? 99,
    currency: settings?.currency ?? "INR",
  });
});

router.get("/fee/status", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const [user] = await db.select({ affiliateFeePaidAt: usersTable.affiliateFeePaidAt })
    .from(usersTable).where(eq(usersTable.id, authedReq.user.userId)).limit(1);
  res.json({ paid: !!user?.affiliateFeePaidAt });
});

router.post("/fee/create-order", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { gateway: requestedGateway } = req.body;

  const [settings] = await db.select({
    affiliateFeeEnabled: platformSettingsTable.affiliateFeeEnabled,
    affiliateFeeAmount: platformSettingsTable.affiliateFeeAmount,
  }).from(platformSettingsTable).limit(1);
  if (!settings?.affiliateFeeEnabled) {
    res.status(400).json({ error: "Affiliate fee is not enabled" }); return;
  }
  const amount = settings.affiliateFeeAmount;
  const [user] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, authedReq.user.userId)).limit(1);

  // Cashfree
  if (!requestedGateway || requestedGateway === "cashfree") {
    const [cfGw] = await db.select().from(paymentGatewaysTable)
      .where(and(eq(paymentGatewaysTable.name, "cashfree"), eq(paymentGatewaysTable.isActive, true))).limit(1);
    if (cfGw?.apiKey && cfGw?.secretKey) {
      const host = cfGw.isTestMode ? "https://sandbox.cashfree.com" : "https://api.cashfree.com";
      const orderId = `AFFFEE${authedReq.user.userId}T${Date.now()}`;
      let cfResp: { payment_session_id?: string; message?: string };
      try {
        const r = await fetch(`${host}/pg/orders`, {
          method: "POST",
          headers: { "x-api-version": "2023-08-01", "x-client-id": cfGw.apiKey, "x-client-secret": cfGw.secretKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: orderId, order_amount: amount, order_currency: "INR",
            customer_details: {
              customer_id: `uid_${authedReq.user.userId}`,
              customer_email: user?.email ?? "user@example.com",
              customer_name: user?.name ?? "User",
              customer_phone: "9999999999",
            },
            order_meta: { notify_url: null },
          }),
        });
        cfResp = await r.json();
        if (!r.ok) throw new Error(cfResp.message ?? "Cashfree order failed");
      } catch (e) {
        res.status(500).json({ error: (e as Error).message }); return;
      }
      res.json({ gateway: "cashfree", orderId, paymentSessionId: cfResp.payment_session_id, isTestMode: cfGw.isTestMode });
      return;
    }
    if (requestedGateway === "cashfree") {
      res.status(400).json({ error: "Cashfree is not configured or inactive" }); return;
    }
  }

  // Razorpay
  if (!requestedGateway || requestedGateway === "razorpay") {
    const [rzpGw] = await db.select().from(paymentGatewaysTable)
      .where(and(eq(paymentGatewaysTable.name, "razorpay"), eq(paymentGatewaysTable.isActive, true))).limit(1);
    if (rzpGw?.apiKey && rzpGw?.secretKey) {
      const creds = Buffer.from(`${rzpGw.apiKey}:${rzpGw.secretKey}`).toString("base64");
      let rzpData: { id?: string; error?: { description?: string } };
      try {
        const r = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amount * 100, currency: "INR", receipt: `AFFFEE_${authedReq.user.userId}` }),
        });
        rzpData = await r.json();
        if (!r.ok) throw new Error(rzpData.error?.description ?? "Razorpay order failed");
      } catch (e) {
        res.status(500).json({ error: (e as Error).message }); return;
      }
      res.json({ gateway: "razorpay", orderId: rzpData.id, keyId: rzpGw.apiKey, amount, user: { name: user?.name, email: user?.email } });
      return;
    }
    if (requestedGateway === "razorpay") {
      res.status(400).json({ error: "Razorpay is not configured or inactive" }); return;
    }
  }

  // Paytm
  if (!requestedGateway || requestedGateway === "paytm") {
    const [ptGw] = await db.select().from(paymentGatewaysTable)
      .where(and(eq(paymentGatewaysTable.name, "paytm"), eq(paymentGatewaysTable.isActive, true))).limit(1);
    if (ptGw?.apiKey && ptGw?.secretKey) {
      const mid = ptGw.apiKey;
      const merchantKey = ptGw.secretKey;
      const orderId = `PTFEE${authedReq.user.userId}T${Date.now()}`;
      const host = ptGw.isTestMode ? "https://securestage.paytmpayments.com" : "https://secure.paytmpayments.com";

      const forwardedProto = req.get("x-forwarded-proto") || req.protocol;
      const origin = `${forwardedProto}://${req.get("host")}`;
      const wsOverride = ptGw.webhookSecret?.startsWith("WS:") ? ptGw.webhookSecret.slice(3).trim() : "";
      const websiteName = wsOverride || (ptGw.isTestMode ? "WEBSTAGING" : "DEFAULT");
      const callbackUrl = `${origin}/api/affiliate/fee/paytm/callback`;

      const initBody = {
        requestType: "Payment",
        mid,
        websiteName,
        orderId,
        txnAmount: { value: amount.toFixed(2), currency: "INR" },
        userInfo: {
          custId: `uid_${authedReq.user.userId}`,
          email: user?.email ?? "user@example.com",
          firstName: user?.name ?? "User",
        },
        callbackUrl,
      };

      let txnToken: string;
      try {
        const sig = await PaytmChecksum.generateSignature(JSON.stringify(initBody), merchantKey);
        const head = { version: "v1", channelId: "WEB", requestTimestamp: Date.now().toString(), signature: sig };
        const initUrl = `${host}/theia/api/v1/initiateTransaction?mid=${mid}&orderId=${encodeURIComponent(orderId)}`;
        const r = await gatewayFetch(initUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: initBody, head }),
        });
        const data = await r.json() as { body?: { txnToken?: string; resultInfo?: { resultCode?: string; resultMsg?: string } } };
        const token = data?.body?.txnToken;
        if (!token) {
          const info = data?.body?.resultInfo;
          res.status(502).json({ error: "Paytm initiate failed", message: info?.resultMsg ?? "Unknown error" }); return;
        }
        txnToken = token;
      } catch (e) {
        res.status(500).json({ error: (e as Error).message }); return;
      }

      res.json({
        gateway: "paytm",
        paytmParams: { mid, orderId, txnToken },
        actionUrl: `${host}/theia/api/v1/showPaymentPage?mid=${mid}&orderId=${encodeURIComponent(orderId)}`,
        orderId,
        isTestMode: ptGw.isTestMode,
      });
      return;
    }
    if (requestedGateway === "paytm") {
      res.status(400).json({ error: "Paytm is not configured or inactive" }); return;
    }
  }

  res.status(400).json({ error: "No active payment gateway configured. Please contact support." });
});

// ── Affiliate Fee: Paytm Callback (Paytm redirects here after payment) ────────
router.post("/fee/paytm/callback", async (req, res): Promise<void> => {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    params[k] = String(v ?? "");
  }
  const receivedChecksum = params.CHECKSUMHASH || "";
  delete params.CHECKSUMHASH;

  const orderId = params.ORDERID || "";
  const status = params.STATUS || "";
  const txnId = params.TXNID || "";

  const forwardedProto = req.get("x-forwarded-proto") || req.protocol;
  const origin = `${forwardedProto}://${req.get("host")}`;

  // Determine the base path for the affiliate page (from any registered origin)
  const publicBase = await getPublicBaseUrl().catch(() => origin);
  const affiliateBase = publicBase || origin;

  const successRedirect = `${affiliateBase}/affiliate?fee_order_id=${encodeURIComponent(orderId)}&fee_gateway=paytm&fee_paytm_status=TXN_SUCCESS`;
  const failRedirect = `${affiliateBase}/affiliate?fee_gateway=paytm&fee_paytm_status=FAILED`;

  try {
    const [ptGw] = await db.select().from(paymentGatewaysTable)
      .where(eq(paymentGatewaysTable.name, "paytm")).limit(1);

    if (!ptGw?.secretKey) {
      res.redirect(303, failRedirect); return;
    }

    const isVerified: boolean = receivedChecksum
      ? PaytmChecksum.verifySignature(params, ptGw.secretKey, receivedChecksum)
      : false;

    if (isVerified && status === "TXN_SUCCESS") {
      // Find the user by orderId pattern: PTFEE{userId}T{timestamp}
      const match = orderId.match(/^PTFEE(\d+)T/);
      if (match) {
        const userId = parseInt(match[1]);
        await db.update(usersTable)
          .set({ affiliateFeePaidAt: new Date() })
          .where(and(eq(usersTable.id, userId), isNull(usersTable.affiliateFeePaidAt)));
      }
      res.redirect(303, successRedirect); return;
    }
  } catch (err) {
    console.error("[affiliate fee paytm callback] error:", err);
  }

  res.redirect(303, failRedirect);
});

router.post("/fee/verify", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { orderId, gateway, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  if (!orderId || !gateway) { res.status(400).json({ error: "orderId and gateway are required" }); return; }

  if (gateway === "cashfree") {
    const [gw] = await db.select().from(paymentGatewaysTable)
      .where(eq(paymentGatewaysTable.name, "cashfree")).limit(1);
    if (!gw?.apiKey || !gw?.secretKey) { res.status(400).json({ error: "Gateway not configured" }); return; }
    const host = gw.isTestMode ? "https://sandbox.cashfree.com" : "https://api.cashfree.com";
    let orderData: { order_status?: string };
    try {
      const r = await fetch(`${host}/pg/orders/${orderId}`, {
        headers: { "x-api-version": "2023-08-01", "x-client-id": gw.apiKey, "x-client-secret": gw.secretKey },
      });
      orderData = await r.json();
    } catch (e) {
      res.status(500).json({ error: "Failed to verify payment with gateway" }); return;
    }
    if (orderData.order_status !== "PAID") {
      res.status(400).json({ error: "Payment not completed", status: orderData.order_status }); return;
    }
  } else if (gateway === "razorpay") {
    const [gw] = await db.select().from(paymentGatewaysTable)
      .where(eq(paymentGatewaysTable.name, "razorpay")).limit(1);
    if (!gw?.secretKey) { res.status(400).json({ error: "Gateway not configured" }); return; }
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSig = crypto.createHmac("sha256", gw.secretKey).update(body).digest("hex");
    if (expectedSig !== razorpay_signature) {
      res.status(400).json({ error: "Invalid payment signature" }); return;
    }
  } else {
    res.status(400).json({ error: "Unsupported gateway" }); return;
  }

  await db.update(usersTable).set({ affiliateFeePaidAt: new Date() })
    .where(eq(usersTable.id, authedReq.user.userId));
  res.json({ paid: true });
});

/* ── Application ── */
router.post("/apply", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { fullName, email, promoteDescription } = req.body;
  if (!fullName || !email || !promoteDescription) {
    res.status(400).json({ error: "All fields are required" }); return;
  }

  // Check if affiliate fee is required
  const [feeSettings] = await db.select({
    affiliateFeeEnabled: platformSettingsTable.affiliateFeeEnabled,
  }).from(platformSettingsTable).limit(1);
  if (feeSettings?.affiliateFeeEnabled) {
    const [userRow] = await db.select({ affiliateFeePaidAt: usersTable.affiliateFeePaidAt })
      .from(usersTable).where(eq(usersTable.id, authedReq.user.userId)).limit(1);
    if (!userRow?.affiliateFeePaidAt) {
      res.status(402).json({ error: "Please pay the account maintenance fee before applying" }); return;
    }
  }

  const existing = await db.select().from(affiliateApplicationsTable)
    .where(eq(affiliateApplicationsTable.userId, authedReq.user.userId)).limit(1);
  const fireSubmittedEvents = async (userIdForEvent: number, emailForEvent: string, nameForEvent: string) => {
    try {
      const siteUrl = await getPublicBaseUrl();
      const vars = { name: nameForEvent, email: emailForEvent, site_url: siteUrl };
      triggerAutomation("affiliate_application_submitted", userIdForEvent, emailForEvent, vars).catch(e =>
        console.error("[affiliate apply] triggerAutomation error:", e));
      triggerFunnel("affiliate_application_submitted", userIdForEvent, vars).catch(e =>
        console.error("[affiliate apply] triggerFunnel error:", e));
    } catch (e) {
      console.error("[affiliate apply] event dispatch error:", e);
    }
  };

  if (existing.length > 0) {
    if (existing[0].status === "rejected") {
      const [updated] = await db.update(affiliateApplicationsTable)
        .set({ fullName, email, promoteDescription, status: "pending", adminNote: null, updatedAt: new Date() })
        .where(eq(affiliateApplicationsTable.userId, authedReq.user.userId))
        .returning();
      void fireSubmittedEvents(authedReq.user.userId, email, fullName);
      res.json(updated); return;
    }
    res.status(409).json({ error: "You have already applied", status: existing[0].status }); return;
  }
  const [app] = await db.insert(affiliateApplicationsTable).values({
    userId: authedReq.user.userId, fullName, email, promoteDescription, status: "pending",
  }).returning();
  void fireSubmittedEvents(authedReq.user.userId, email, fullName);
  res.json(app);
});

router.get("/application", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const [app] = await db.select().from(affiliateApplicationsTable)
    .where(eq(affiliateApplicationsTable.userId, authedReq.user.userId)).limit(1);
  if (!app) { res.status(404).json({ error: "No application found" }); return; }
  res.json(app);
});

/* ── Dashboard / earnings ── */
router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, authedReq.user.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const settings = await db.select().from(platformSettingsTable).limit(1);
  const platformDefault = settings[0]?.commissionRate ?? 20;
  const cookieDays = settings[0]?.affiliateCookieDays ?? 30;

  // Resolve commission rate: individual override → group rate → platform default
  const [application] = await db.select({
    commissionOverride: affiliateApplicationsTable.commissionOverride,
    commissionGroupId: affiliateApplicationsTable.commissionGroupId,
    welcomedAt: affiliateApplicationsTable.welcomedAt,
  }).from(affiliateApplicationsTable).where(eq(affiliateApplicationsTable.userId, authedReq.user.userId)).limit(1);

  let commissionRate = platformDefault;
  if (application?.commissionOverride != null) {
    commissionRate = application.commissionOverride;
  } else if (application?.commissionGroupId != null) {
    const [group] = await db.select({ commissionRate: commissionGroupsTable.commissionRate })
      .from(commissionGroupsTable).where(eq(commissionGroupsTable.id, application.commissionGroupId)).limit(1);
    if (group) commissionRate = group.commissionRate;
  }

  const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, authedReq.user.userId));
  const allClicks = await db.select().from(affiliateClicksTable).where(eq(affiliateClicksTable.affiliateId, authedReq.user.userId));
  const clicks = allClicks.length;
  const uniqueClicks = allClicks.filter(c => c.isUnique).length;
  const conversions = referrals.filter(r => r.status === "purchase").length;
  const totalEarnings = referrals.reduce((acc, r) => acc + parseFloat(String(r.commission ?? 0)), 0);

  const approvedPayouts = await db.select().from(payoutRequestsTable)
    .where(and(eq(payoutRequestsTable.userId, authedReq.user.userId), eq(payoutRequestsTable.status, "approved")));
  const paidEarnings = approvedPayouts.reduce((acc, p) => acc + parseFloat(String(p.amount)), 0);

  // Build the affiliate link from the **request's own hostname** so the link
  // is always rooted at whatever domain the affiliate is currently visiting.
  // E.g. user on https://vipulkumar.online/affiliate → link starts with
  // https://vipulkumar.online ; same user later visits the site via
  // https://vipulkumaracademy.com → link automatically updates without any
  // admin config change. trust proxy = 1 (set in app.ts) makes req.hostname
  // honour X-Forwarded-Host, so this works behind the Replit Deployments
  // edge. We fall back to the admin-configured siteUrl / env vars only if
  // the request hostname is missing or local — that way the API still works
  // for server-to-server callers where there is no meaningful Host header.
  const reqHost = String(req.hostname || "").toLowerCase();
  const reqProto = (req.protocol === "http" || req.protocol === "https") ? req.protocol : "https";
  const isLocal = !reqHost || reqHost === "localhost" || reqHost === "127.0.0.1" || reqHost === "0.0.0.0";
  let canonicalBase = "";
  if (!isLocal) {
    canonicalBase = `${reqProto}://${reqHost}`;
  } else {
    let baseUrl = await getPublicBaseUrl();
    if (!baseUrl) {
      const fallbackDomain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost:80";
      baseUrl = `https://${fallbackDomain}`;
    }
    try { canonicalBase = new URL(baseUrl).origin; } catch { canonicalBase = baseUrl; }
  }
  const referralLink = (() => {
    try {
      const u = new URL(canonicalBase);
      u.searchParams.set("ref", user.referralCode ?? "");
      return u.toString().replace(/\/$/, "").replace(/\/\?/, "?");
    } catch {
      return `${canonicalBase}?ref=${user.referralCode}`;
    }
  })();

  /* Earnings breakdown */
  const todayStart = dayStart(0);
  const yesterdayStart = dayStart(1);
  const day7Start = dayStart(7);
  const day30Start = dayStart(30);

  const earnInRange = (from: Date, to?: Date) =>
    referrals
      .filter(r => {
        const d = new Date(r.createdAt);
        return d >= from && (to ? d < to : true) && r.commission;
      })
      .reduce((s, r) => s + parseFloat(String(r.commission ?? 0)), 0);

  const todayEarnings = earnInRange(todayStart);
  const yesterdayEarnings = earnInRange(yesterdayStart, todayStart);
  const last7Earnings = earnInRange(day7Start);
  const last30Earnings = earnInRange(day30Start);

  /* Daily chart — last 30 days */
  const daily: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    daily[istDateKey(dayStart(i))] = 0;
  }
  referrals.filter(r => r.commission && new Date(r.createdAt) >= day30Start).forEach(r => {
    const key = istDateKey(new Date(r.createdAt));
    if (key in daily) daily[key] += parseFloat(String(r.commission ?? 0));
  });
  const dailyChart = Object.entries(daily).map(([date, amount]) => ({ date, amount }));

  res.json({
    referralCode: user.referralCode,
    referralLink,
    // The resolved public base URL (custom domain when configured, else
    // deployment URL), normalised to origin-only. Surfaced to the frontend so
    // the Custom Link Generator can accept URLs from this domain even when the
    // affiliate is currently browsing the dashboard via a different origin
    // (e.g., dev preview).
    siteBaseUrl: canonicalBase,
    totalClicks: clicks,
    uniqueClicks,
    totalConversions: conversions,
    totalEarnings,
    pendingEarnings: Math.max(0, totalEarnings - paidEarnings),
    paidEarnings,
    commissionRate,
    cookieDays,
    todayEarnings,
    yesterdayEarnings,
    last7Earnings,
    last30Earnings,
    dailyChart,
    // If the user has no `affiliateApplications` row at all (e.g. an admin or
    // an `affiliate`-role user created directly by an admin — both of whom
    // bypass the apply/approval flow at AffiliatePage), they have no
    // onboarding journey to complete, so we treat them as already-welcomed.
    // This prevents the welcome popup + tour from re-appearing forever for
    // those users (the POST /welcome-complete UPDATE would otherwise affect
    // zero rows because no application row exists to stamp).
    welcomedAt: application
      ? (application.welcomedAt ?? null)
      : new Date().toISOString(),
  });
});

/* Mark welcome onboarding (popup + tour) as completed for the current user.
   Idempotent: only stamps welcomedAt the first time. */
router.post("/welcome-complete", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  await db.update(affiliateApplicationsTable)
    .set({ welcomedAt: new Date() })
    .where(and(
      eq(affiliateApplicationsTable.userId, authedReq.user.userId),
      eq(affiliateApplicationsTable.status, "approved"),
      isNull(affiliateApplicationsTable.welcomedAt),
    ));
  res.json({ ok: true });
});

router.get("/referrals", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const referrals = await db.select().from(referralsTable)
    .where(eq(referralsTable.referrerId, authedReq.user.userId))
    .orderBy(desc(referralsTable.createdAt));
  const enriched = await Promise.all(referrals.map(async (r) => {
    let referredUserName = "Anonymous";
    if (r.referredUserId) {
      const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, r.referredUserId)).limit(1);
      if (u) referredUserName = u.name;
    }
    return { ...r, referredUserName, commission: r.commission ? parseFloat(String(r.commission)) : null };
  }));
  res.json(enriched);
});

/* ── Click analytics ── */
router.get("/clicks", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const userId = authedReq.user.userId;

  const [clicks, purchases] = await Promise.all([
    db.select().from(affiliateClicksTable)
      .where(eq(affiliateClicksTable.affiliateId, userId))
      .orderBy(desc(affiliateClicksTable.createdAt)),
    db.select().from(referralsTable)
      .where(and(eq(referralsTable.referrerId, userId), eq(referralsTable.status, "purchase"))),
  ]);

  const total = clicks.length;
  const unique = clicks.filter(c => c.isUnique).length;
  const conversions = purchases.length; // ground truth: actual purchases, not click.convertedAt

  const day30Start = dayStart(30);
  const daily: Record<string, { clicks: number; unique: number; conversions: number }> = {};
  for (let i = 29; i >= 0; i--) {
    daily[istDateKey(dayStart(i))] = { clicks: 0, unique: 0, conversions: 0 };
  }
  clicks.filter(c => new Date(c.createdAt) >= day30Start).forEach(c => {
    const key = istDateKey(new Date(c.createdAt));
    if (key in daily) {
      daily[key].clicks++;
      if (c.isUnique) daily[key].unique++;
    }
  });
  // Map purchases to the chart by their creation date
  purchases.filter(p => new Date(p.createdAt) >= day30Start).forEach(p => {
    const key = istDateKey(new Date(p.createdAt));
    if (key in daily) daily[key].conversions++;
  });

  const dailyChart = Object.entries(daily).map(([date, v]) => ({ date, ...v }));
  res.json({ total, unique, conversions, dailyChart });
});

/* ── Sales list ── */
router.get("/sales", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const userId = authedReq.user.userId;

  const rows = await db
    .select({
      id: referralsTable.id,
      commission: referralsTable.commission,
      createdAt: referralsTable.createdAt,
      courseId: referralsTable.courseId,
      courseTitle: coursesTable.title,
      bundleTitle: bundlesTable.name,
      saleAmount: paymentsTable.amount,
    })
    .from(referralsTable)
    .leftJoin(coursesTable, eq(coursesTable.id, referralsTable.courseId))
    .leftJoin(
      paymentsTable,
      and(
        eq(paymentsTable.userId, referralsTable.referredUserId),
        or(
          eq(paymentsTable.courseId, referralsTable.courseId),
          and(isNull(paymentsTable.courseId), isNull(referralsTable.courseId)),
        ),
        eq(paymentsTable.status, "completed"),
      ),
    )
    .leftJoin(bundlesTable, eq(bundlesTable.id, paymentsTable.bundleId))
    .where(and(eq(referralsTable.referrerId, userId), eq(referralsTable.status, "purchase")))
    .orderBy(desc(referralsTable.createdAt));

  res.json(rows.map(r => ({
    id: r.id,
    courseTitle: r.courseTitle ?? r.bundleTitle ?? "Unknown",
    isBundle: r.courseId == null && r.bundleTitle != null,
    saleAmount: r.saleAmount != null ? parseFloat(String(r.saleAmount)) : null,
    commission: parseFloat(String(r.commission ?? 0)),
    createdAt: r.createdAt,
  })));
});

/* ── Upcoming payout (affiliate's own scheduled info) ── */
router.get("/upcoming-payout", requireAuth, async (req, res): Promise<void> => {
  const { userId } = (req as AuthedRequest).user;

  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const payoutPeriodDays = settings?.payoutPeriodDays ?? 7;
  const payoutWeekDay = settings?.payoutWeekDay ?? null;

  const commissions = await db.select({ amount: referralsTable.commission })
    .from(referralsTable)
    .where(and(eq(referralsTable.referrerId, userId), eq(referralsTable.status, "purchase")));
  const totalEarned = commissions.reduce((s, c) => s + parseFloat(String(c.amount ?? 0)), 0);

  const approved = await db.select({ amount: payoutRequestsTable.amount })
    .from(payoutRequestsTable)
    .where(and(eq(payoutRequestsTable.userId, userId), eq(payoutRequestsTable.status, "approved")));
  const totalPaidOut = approved.reduce((s, p) => s + parseFloat(String(p.amount)), 0);

  const unpaidAmount = Math.max(0, totalEarned - totalPaidOut);

  const [lastApproved] = await db.select({ processedAt: payoutRequestsTable.processedAt })
    .from(payoutRequestsTable)
    .where(and(eq(payoutRequestsTable.userId, userId), eq(payoutRequestsTable.status, "approved")))
    .orderBy(desc(payoutRequestsTable.processedAt)).limit(1);
  const lastPayoutDate = lastApproved?.processedAt ?? null;

  let nextDueDate: Date | null = null;
  if (payoutWeekDay === null && lastPayoutDate) {
    nextDueDate = new Date(lastPayoutDate);
    nextDueDate.setDate(nextDueDate.getDate() + payoutPeriodDays);
  }
  const isDue = payoutWeekDay !== null
    ? new Date().getDay() === payoutWeekDay
    : (!nextDueDate || new Date() >= nextDueDate);

  const [latestAction] = await db.select()
    .from(payoutRequestsTable)
    .where(eq(payoutRequestsTable.userId, userId))
    .orderBy(desc(payoutRequestsTable.requestedAt)).limit(1);

  res.json({
    unpaidAmount,
    totalEarned,
    totalPaidOut,
    nextDueDate: nextDueDate?.toISOString() ?? null,
    lastPayoutDate: lastPayoutDate?.toISOString() ?? null,
    isDue,
    payoutPeriodDays,
    latestAction: latestAction ? {
      id: latestAction.id,
      status: latestAction.status,
      amount: parseFloat(String(latestAction.amount)),
      note: latestAction.rejectionReason,
      date: latestAction.processedAt?.toISOString() ?? latestAction.requestedAt?.toISOString() ?? null,
    } : null,
  });
});

/* ── Payout ── */
router.post("/payout-request", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { amount, paymentMethod, paymentDetails } = req.body;
  if (!amount || !paymentMethod || !paymentDetails) {
    res.status(400).json({ error: "amount, paymentMethod and paymentDetails are required" }); return;
  }
  await db.insert(payoutRequestsTable).values({
    userId: authedReq.user.userId, amount: String(amount), paymentMethod, paymentDetails, status: "pending",
  });
  res.json({ message: "Payout request submitted" });
});

router.get("/payouts", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const payouts = await db.select().from(payoutRequestsTable)
    .where(eq(payoutRequestsTable.userId, authedReq.user.userId))
    .orderBy(desc(payoutRequestsTable.requestedAt));
  res.json(payouts.map(p => ({ ...p, amount: parseFloat(String(p.amount)) })));
});

router.get("/payouts/:id/commissions", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const userId = authedReq.user.userId;
  const payoutId = parseInt(req.params.id);
  if (isNaN(payoutId)) { res.status(400).json({ error: "Invalid payout ID" }); return; }

  const [payout] = await db.select().from(payoutRequestsTable)
    .where(and(eq(payoutRequestsTable.id, payoutId), eq(payoutRequestsTable.userId, userId)))
    .limit(1);
  if (!payout) { res.status(404).json({ error: "Payout not found" }); return; }

  const [prevPayout] = await db.select({ requestedAt: payoutRequestsTable.requestedAt })
    .from(payoutRequestsTable)
    .where(and(eq(payoutRequestsTable.userId, userId), lt(payoutRequestsTable.requestedAt, payout.requestedAt)))
    .orderBy(desc(payoutRequestsTable.requestedAt))
    .limit(1);

  const fromDate = prevPayout?.requestedAt ?? new Date(0);
  const toDate = payout.requestedAt;

  const rows = await db
    .select({
      id: referralsTable.id,
      commission: referralsTable.commission,
      createdAt: referralsTable.createdAt,
      courseTitle: coursesTable.title,
      bundleName: bundlesTable.name,
    })
    .from(referralsTable)
    .leftJoin(
      paymentsTable,
      and(
        eq(paymentsTable.userId, referralsTable.referredUserId),
        eq(paymentsTable.status, "completed"),
        or(
          eq(paymentsTable.courseId, referralsTable.courseId),
          and(isNull(paymentsTable.courseId), isNull(referralsTable.courseId)),
        ),
      ),
    )
    .leftJoin(coursesTable, eq(coursesTable.id, referralsTable.courseId))
    .leftJoin(bundlesTable, eq(bundlesTable.id, paymentsTable.bundleId))
    .where(and(
      eq(referralsTable.referrerId, userId),
      eq(referralsTable.status, "purchase"),
      gte(referralsTable.createdAt, fromDate),
      lte(referralsTable.createdAt, toDate),
    ))
    .orderBy(desc(referralsTable.createdAt));

  res.json(rows.map(r => ({
    id: r.id,
    commission: parseFloat(String(r.commission ?? 0)),
    productName: r.courseTitle ?? r.bundleName ?? null,
    createdAt: r.createdAt,
  })));
});

/* ── KYC ── */
router.get("/kyc", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const [kyc] = await db.select().from(affiliateKycTable)
    .where(eq(affiliateKycTable.userId, authedReq.user.userId)).limit(1);
  res.json(kyc ?? null);
});

router.patch("/kyc/pan-number", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { panNumber } = req.body;
  if (!panNumber || typeof panNumber !== "string" || panNumber.trim().length === 0) {
    res.status(400).json({ error: "PAN number is required" }); return;
  }
  const [existing] = await db.select().from(affiliateKycTable)
    .where(eq(affiliateKycTable.userId, authedReq.user.userId)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "No KYC record found" }); return;
  }
  const [updated] = await db.update(affiliateKycTable)
    .set({ panNumber: panNumber.trim().toUpperCase() })
    .where(eq(affiliateKycTable.userId, authedReq.user.userId)).returning();
  res.json(updated);
});

router.post("/kyc", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { idProofName, addressProofName, panNumber } = req.body;
  if (!idProofName || !addressProofName || !panNumber) {
    res.status(400).json({ error: "Name, PAN number, and PAN photo are required" }); return;
  }
  const userId = authedReq.user.userId;
  const [existing] = await db.select().from(affiliateKycTable)
    .where(eq(affiliateKycTable.userId, userId)).limit(1);
  let saved: typeof affiliateKycTable.$inferSelect;
  if (existing) {
    const [updated] = await db.update(affiliateKycTable)
      .set({ idProofName, addressProofName, panNumber: panNumber ?? null, status: "pending", adminNote: null, submittedAt: new Date() })
      .where(eq(affiliateKycTable.userId, userId)).returning();
    saved = updated;
  } else {
    const [created] = await db.insert(affiliateKycTable).values({
      userId, idProofName, addressProofName, panNumber: panNumber ?? null, status: "pending",
    }).returning();
    saved = created;
  }
  // Fire automation trigger (non-blocking)
  try {
    const [u] = await db.select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const vars: Record<string, string> = {
      name: u?.name ?? "Affiliate",
      email: u?.email ?? "",
      pan_number: panNumber ?? "",
      id_proof_name: idProofName ?? "",
      address_proof_name: addressProofName ?? "",
      is_resubmission: existing ? "true" : "false",
      submitted_at: (saved.submittedAt ?? new Date()).toISOString(),
    };
    triggerFunnel("affiliate_kyc_submitted", userId, vars).catch(e =>
      console.error("[affiliate kyc submitted] triggerFunnel error:", e));
  } catch (e) { console.error("[affiliate kyc submitted] vars build error:", e); }
  res.json(saved);
});

/* ── Bank details ── */
router.get("/bank", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const [bank] = await db.select().from(affiliateBankDetailsTable)
    .where(eq(affiliateBankDetailsTable.userId, authedReq.user.userId)).limit(1);
  res.json(bank ?? null);
});

router.post("/bank", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { accountHolderName, accountNumber, ifscCode, bankName } = req.body;
  if (!accountHolderName || !accountNumber || !ifscCode || !bankName) {
    res.status(400).json({ error: "All bank details are required" }); return;
  }
  const [existing] = await db.select().from(affiliateBankDetailsTable)
    .where(eq(affiliateBankDetailsTable.userId, authedReq.user.userId)).limit(1);
  if (existing) {
    const [updated] = await db.update(affiliateBankDetailsTable)
      .set({ accountHolderName, accountNumber, ifscCode, bankName })
      .where(eq(affiliateBankDetailsTable.userId, authedReq.user.userId)).returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(affiliateBankDetailsTable)
      .values({ userId: authedReq.user.userId, accountHolderName, accountNumber, ifscCode, bankName }).returning();
    res.json(created);
  }
});

/* ── Pixel ── */
router.get("/pixel", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const [pixel] = await db.select().from(affiliatePixelTable)
    .where(eq(affiliatePixelTable.userId, authedReq.user.userId)).limit(1);
  res.json(pixel ?? null);
});

router.post("/pixel", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { facebookPixelId, accessToken, trackPageView, trackPurchase } = req.body;
  const updates = {
    facebookPixelId: facebookPixelId || null,
    accessToken: accessToken || null,
    trackPageView: trackPageView ?? true,
    trackPurchase: trackPurchase ?? true,
  };
  const [existing] = await db.select().from(affiliatePixelTable)
    .where(eq(affiliatePixelTable.userId, authedReq.user.userId)).limit(1);
  if (existing) {
    const [updated] = await db.update(affiliatePixelTable)
      .set(updates)
      .where(eq(affiliatePixelTable.userId, authedReq.user.userId)).returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(affiliatePixelTable)
      .values({ userId: authedReq.user.userId, ...updates }).returning();
    res.json(created);
  }
});

router.post("/pixel/test-event", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { testEventCode, eventName = "Purchase", value = 999 } = req.body;
  if (!testEventCode) { res.status(400).json({ error: "testEventCode is required" }); return; }

  const [pixel] = await db.select().from(affiliatePixelTable)
    .where(eq(affiliatePixelTable.userId, authedReq.user.userId)).limit(1);

  if (!pixel?.facebookPixelId || !pixel?.accessToken) {
    res.status(400).json({ error: "Please save your Pixel ID and Access Token first." }); return;
  }

  const userIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? undefined;
  const userAgent = req.headers["user-agent"] ?? undefined;

  const result = await sendFbTestEvent(
    pixel.facebookPixelId,
    pixel.accessToken,
    testEventCode,
    eventName as "InitiateCheckout" | "Purchase",
    Number(value),
    userIp,
    userAgent,
  );

  if (result.success) {
    res.json({ success: true, message: "Test event sent successfully!", result: result.result });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
});

/* ── Creatives ── */
router.get("/creatives", requireAuth, async (req, res): Promise<void> => {
  const creatives = await db.select().from(affiliateCreativesTable).orderBy(desc(affiliateCreativesTable.createdAt));
  res.json(creatives);
});

/* ── Track click ── */
router.post("/track", async (req, res): Promise<void> => {
  const { referralCode, courseId } = req.body;
  if (!referralCode) { res.status(400).json({ error: "referralCode is required" }); return; }

  /* Always return cookieDays so the client can set the correct expiry */
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const cookieDays = settings?.affiliateCookieDays ?? 30;

  const [referrer] = await db.select().from(usersTable).where(eq(usersTable.referralCode, referralCode)).limit(1);
  if (referrer) {
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
    const ipHash = hashIp(ip);
    /* Basic duplicate check within 24h */
    const oneDayAgo = new Date(Date.now() - 86400000);
    const recentClick = await db.select({ id: affiliateClicksTable.id }).from(affiliateClicksTable)
      .where(and(
        eq(affiliateClicksTable.affiliateId, referrer.id),
        eq(affiliateClicksTable.ipHash, ipHash),
        gte(affiliateClicksTable.createdAt, oneDayAgo),
      )).limit(1);
    const isUnique = recentClick.length === 0;
    await db.insert(affiliateClicksTable).values({
      affiliateId: referrer.id,
      ipHash,
      userAgent: req.headers["user-agent"]?.substring(0, 200) ?? null,
      courseId: courseId || null,
      isUnique,
    });
    /* Also create a referral record for backward compat */
    await db.insert(referralsTable).values({ referrerId: referrer.id, courseId: courseId || null, status: "click" });
  }
  res.json({ message: "Tracked", cookieDays });
});

/* ── Fire InitiateCheckout pixel event when checkout page opens ── */
router.post("/pixel/initiate-checkout", async (req, res): Promise<void> => {
  const { affiliateRef } = req.body;
  if (!affiliateRef) { res.json({ sent: false }); return; }

  const [referrer] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.referralCode, affiliateRef)).limit(1);
  if (!referrer) { res.json({ sent: false }); return; }

  const [pixel] = await db.select({ facebookPixelId: affiliatePixelTable.facebookPixelId, accessToken: affiliatePixelTable.accessToken })
    .from(affiliatePixelTable).where(eq(affiliatePixelTable.userId, referrer.id)).limit(1);
  if (!pixel?.facebookPixelId || !pixel?.accessToken) { res.json({ sent: false }); return; }

  const userIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? undefined;
  const userAgent = req.headers["user-agent"] ?? undefined;

  sendFbEvent(pixel.facebookPixelId, pixel.accessToken, {
    eventName: "InitiateCheckout",
    userIp,
    userAgent,
  }).catch(e => console.error("[fb pixel InitiateCheckout]", e));

  res.json({ sent: true });
});

/* ── Admin: affiliate applications ── */
router.get("/admin/applications", requireAdmin, async (req, res): Promise<void> => {
  const apps = await db.select().from(affiliateApplicationsTable).orderBy(desc(affiliateApplicationsTable.createdAt));
  const enriched = await Promise.all(apps.map(async (a) => {
    const [user] = await db.select({ name: usersTable.name, email: usersTable.email, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, a.userId)).limit(1);

    // Enrolled courses
    const enrollments = await db
      .select({ courseId: coursesTable.id, courseTitle: coursesTable.title })
      .from(enrollmentsTable)
      .innerJoin(coursesTable, eq(enrollmentsTable.courseId, coursesTable.id))
      .where(eq(enrollmentsTable.userId, a.userId));

    // Completed payments (courses + bundles)
    const payments = await db
      .select({
        id: paymentsTable.id,
        amount: paymentsTable.amount,
        courseId: paymentsTable.courseId,
        courseTitle: coursesTable.title,
        bundleId: paymentsTable.bundleId,
        bundleName: bundlesTable.name,
        createdAt: paymentsTable.createdAt,
        gateway: paymentsTable.gateway,
      })
      .from(paymentsTable)
      .leftJoin(coursesTable, eq(paymentsTable.courseId, coursesTable.id))
      .leftJoin(bundlesTable, eq(paymentsTable.bundleId, bundlesTable.id))
      .where(and(eq(paymentsTable.userId, a.userId), eq(paymentsTable.status, "completed")))
      .orderBy(desc(paymentsTable.createdAt));

    return {
      ...a,
      userName: user?.name ?? "Unknown",
      userEmail: user?.email ?? "",
      userRole: user?.role ?? "student",
      enrollments,
      purchases: payments,
    };
  }));
  res.json(enriched);
});

router.post("/admin/applications/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { commissionGroupId } = req.body;
  const [app] = await db.select().from(affiliateApplicationsTable).where(eq(affiliateApplicationsTable.id, id)).limit(1);
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }

  const updatePayload: Record<string, any> = { status: "approved", reviewedAt: new Date() };
  if (commissionGroupId) {
    const groupId = parseInt(commissionGroupId);
    const [grp] = await db.select().from(commissionGroupsTable).where(eq(commissionGroupsTable.id, groupId)).limit(1);
    if (grp) {
      updatePayload.commissionGroupId = groupId;
      updatePayload.commissionOverride = null;
    }
  }

  // Idempotency guard: only update + fire events when the application is not already approved.
  // The conditional WHERE prevents double-firing on duplicate admin clicks or concurrent requests.
  const updated = await db.update(affiliateApplicationsTable)
    .set(updatePayload)
    .where(and(eq(affiliateApplicationsTable.id, id), ne(affiliateApplicationsTable.status, "approved")))
    .returning({ id: affiliateApplicationsTable.id });

  if (updated.length === 0) {
    res.json({ message: "Application is already approved" }); return;
  }

  await db.update(usersTable).set({ role: "affiliate" }).where(eq(usersTable.id, app.userId));

  // Fire automation events for approval (only on actual state transition)
  void (async () => {
    try {
      const siteUrl = await getPublicBaseUrl();
      const vars = { name: app.fullName, email: app.email, site_url: siteUrl };
      triggerAutomation("affiliate_application_approved", app.userId, app.email, vars).catch(e =>
        console.error("[affiliate approve] triggerAutomation error:", e));
      triggerFunnel("affiliate_application_approved", app.userId, vars).catch(e =>
        console.error("[affiliate approve] triggerFunnel error:", e));
      // Backwards-compat: also fire the existing affiliate_joined trigger so any
      // previously configured funnels keep working.
      triggerFunnel("affiliate_joined", app.userId, vars).catch(() => {});
    } catch (e) {
      console.error("[affiliate approve] event dispatch error:", e);
    }
  })();

  res.json({ message: "Application approved, user promoted to affiliate" });
});

router.post("/admin/applications/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { adminNote } = req.body;
  if (!adminNote) { res.status(400).json({ error: "adminNote is required when rejecting" }); return; }
  const [app] = await db.select().from(affiliateApplicationsTable).where(eq(affiliateApplicationsTable.id, id)).limit(1);
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }

  // Idempotency guard: only fire the event on actual state transition (not when re-rejecting).
  // Allow updating adminNote on already-rejected apps without re-firing the email.
  const wasAlreadyRejected = app.status === "rejected";
  await db.update(affiliateApplicationsTable)
    .set({ status: "rejected", adminNote, reviewedAt: new Date() })
    .where(eq(affiliateApplicationsTable.id, id));

  if (!wasAlreadyRejected) {
    // Fire automation events for rejection (with rejection_reason from admin note)
    void (async () => {
      try {
        const siteUrl = await getPublicBaseUrl();
        const vars = { name: app.fullName, email: app.email, site_url: siteUrl, rejection_reason: adminNote };
        triggerAutomation("affiliate_application_rejected", app.userId, app.email, vars).catch(e =>
          console.error("[affiliate reject] triggerAutomation error:", e));
        triggerFunnel("affiliate_application_rejected", app.userId, vars).catch(e =>
          console.error("[affiliate reject] triggerFunnel error:", e));
      } catch (e) {
        console.error("[affiliate reject] event dispatch error:", e);
      }
    })();
  }

  res.json({ message: wasAlreadyRejected ? "Application note updated" : "Application rejected" });
});

/* ── Admin: creatives CRUD ── */
router.post("/admin/creatives", requireAdmin, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { title, type, url, content, headline, description } = req.body;
  if (!title || !type) { res.status(400).json({ error: "title and type are required" }); return; }
  const [creative] = await db.insert(affiliateCreativesTable).values({
    title, type, url: url || null, content: content || null, headline: headline || null, description: description || null,
    uploadedByAdminId: authedReq.user.userId,
  }).returning();
  res.json(creative);
});

router.put("/admin/creatives/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { title, type, url, content, headline, description } = req.body;
  if (!title || !type) { res.status(400).json({ error: "title and type are required" }); return; }
  const [updated] = await db.update(affiliateCreativesTable)
    .set({ title, type, url: url || null, content: content || null, headline: headline || null, description: description || null })
    .where(eq(affiliateCreativesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Creative not found" }); return; }
  res.json(updated);
});

router.delete("/admin/creatives/:id", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(affiliateCreativesTable).where(eq(affiliateCreativesTable.id, parseInt(req.params.id)));
  res.json({ message: "Creative deleted" });
});

/* ── Admin: KYC review ── */
router.post("/admin/kyc/:userId/approve", requireAdmin, async (req, res): Promise<void> => {
  const targetUserId = parseInt(req.params.userId);
  const [current] = await db.select().from(affiliateKycTable)
    .where(eq(affiliateKycTable.userId, targetUserId)).limit(1);
  const reviewedAt = new Date();
  await db.update(affiliateKycTable)
    .set({ status: "approved", reviewedAt })
    .where(eq(affiliateKycTable.userId, targetUserId));
  // Fire only on actual transition (skip if already approved)
  if (current && current.status !== "approved") {
    try {
      const [u] = await db.select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, targetUserId)).limit(1);
      const vars: Record<string, string> = {
        name: u?.name ?? "Affiliate",
        email: u?.email ?? "",
        pan_number: current.panNumber ?? "",
        reviewed_at: reviewedAt.toISOString(),
      };
      triggerFunnel("affiliate_kyc_approved", targetUserId, vars).catch(e =>
        console.error("[affiliate kyc approved] triggerFunnel error:", e));
    } catch (e) { console.error("[affiliate kyc approved] vars build error:", e); }
  }
  res.json({ message: "KYC approved" });
});

router.post("/admin/kyc/:userId/reject", requireAdmin, async (req, res): Promise<void> => {
  const targetUserId = parseInt(req.params.userId);
  const { adminNote } = req.body;
  const finalNote = adminNote || "Rejected by admin";
  const [current] = await db.select().from(affiliateKycTable)
    .where(eq(affiliateKycTable.userId, targetUserId)).limit(1);
  const reviewedAt = new Date();
  await db.update(affiliateKycTable)
    .set({ status: "rejected", adminNote: finalNote, reviewedAt })
    .where(eq(affiliateKycTable.userId, targetUserId));
  // Fire only on actual transition (skip if already rejected)
  if (current && current.status !== "rejected") {
    try {
      const [u] = await db.select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, targetUserId)).limit(1);
      const vars: Record<string, string> = {
        name: u?.name ?? "Affiliate",
        email: u?.email ?? "",
        pan_number: current.panNumber ?? "",
        rejection_reason: finalNote,
        reviewed_at: reviewedAt.toISOString(),
      };
      triggerFunnel("affiliate_kyc_rejected", targetUserId, vars).catch(e =>
        console.error("[affiliate kyc rejected] triggerFunnel error:", e));
    } catch (e) { console.error("[affiliate kyc rejected] vars build error:", e); }
  }
  res.json({ message: "KYC rejected" });
});

/* ── Admin: all affiliates list ── */
router.get("/admin/all-affiliates", requireAdmin, async (req, res): Promise<void> => {
  const apps = await db.select().from(affiliateApplicationsTable)
    .where(eq(affiliateApplicationsTable.status, "approved"))
    .orderBy(desc(affiliateApplicationsTable.createdAt));

  const enriched = await Promise.all(apps.map(async (a) => {
    const [user] = await db.select({ name: usersTable.name, email: usersTable.email, referralCode: usersTable.referralCode, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, a.userId)).limit(1);

    const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, a.userId));
    const totalClicks = referrals.length;
    const totalConversions = referrals.filter(r => r.status === "purchase").length;
    const totalEarnings = referrals.reduce((acc, r) => acc + parseFloat(String(r.commission ?? 0)), 0);

    const payouts = await db.select().from(payoutRequestsTable).where(eq(payoutRequestsTable.userId, a.userId));
    const paidOut = payouts.filter(p => p.status === "approved").reduce((acc, p) => acc + parseFloat(String(p.amount)), 0);
    const pendingPayout = payouts.filter(p => p.status === "pending").reduce((acc, p) => acc + parseFloat(String(p.amount)), 0);

    const [kyc] = await db.select({ status: affiliateKycTable.status }).from(affiliateKycTable)
      .where(eq(affiliateKycTable.userId, a.userId)).limit(1);

    const group = a.commissionGroupId
      ? (await db.select({ id: commissionGroupsTable.id, name: commissionGroupsTable.name, commissionRate: commissionGroupsTable.commissionRate })
          .from(commissionGroupsTable).where(eq(commissionGroupsTable.id, a.commissionGroupId)).limit(1))[0] ?? null
      : null;

    return {
      applicationId: a.id,
      userId: a.userId,
      name: user?.name ?? a.fullName,
      email: user?.email ?? a.email,
      referralCode: user?.referralCode ?? null,
      role: user?.role ?? "affiliate",
      isBlocked: a.isBlocked,
      commissionOverride: a.commissionOverride,
      commissionGroupId: a.commissionGroupId ?? null,
      commissionGroupName: group?.name ?? null,
      commissionGroupRate: group?.commissionRate ?? null,
      approvedAt: a.reviewedAt,
      totalClicks,
      totalConversions,
      totalEarnings,
      pendingPayout,
      paidOut,
      kycStatus: kyc?.status ?? "not_submitted",
    };
  }));
  res.json(enriched);
});

/* ── Admin: block / unblock affiliate ── */
router.post("/admin/affiliates/:appId/block", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(req.params.appId);
  await db.update(affiliateApplicationsTable).set({ isBlocked: true }).where(eq(affiliateApplicationsTable.id, appId));
  res.json({ message: "Affiliate blocked" });
});

router.post("/admin/affiliates/:appId/unblock", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(req.params.appId);
  await db.update(affiliateApplicationsTable).set({ isBlocked: false }).where(eq(affiliateApplicationsTable.id, appId));
  res.json({ message: "Affiliate unblocked" });
});

/* ── Admin: set per-affiliate commission ── */
router.post("/admin/affiliates/:appId/commission", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(req.params.appId);
  const { commissionRate } = req.body;
  const rate = commissionRate === null || commissionRate === "" ? null : parseInt(String(commissionRate));
  await db.update(affiliateApplicationsTable)
    .set({ commissionOverride: rate })
    .where(eq(affiliateApplicationsTable.id, appId));
  res.json({ message: "Commission updated" });
});

/* ── Admin: assign affiliate to commission group ── */
router.post("/admin/affiliates/:appId/commission-group", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(req.params.appId);
  const { groupId } = req.body;
  const gid = groupId === null || groupId === "" ? null : parseInt(String(groupId));
  // Clear individual override when assigning to a group so the group rate takes effect
  await db.update(affiliateApplicationsTable)
    .set({ commissionGroupId: gid, commissionOverride: gid !== null ? null : undefined })
    .where(eq(affiliateApplicationsTable.id, appId));
  res.json({ message: "Group assigned" });
});

/* ── Admin: commission groups CRUD ── */
router.get("/admin/commission-groups", requireAdmin, async (req, res): Promise<void> => {
  const groups = await db.select().from(commissionGroupsTable).orderBy(commissionGroupsTable.name);
  const counts = await db.select({ groupId: affiliateApplicationsTable.commissionGroupId, cnt: count() })
    .from(affiliateApplicationsTable)
    .where(and(eq(affiliateApplicationsTable.status, "approved")))
    .groupBy(affiliateApplicationsTable.commissionGroupId);
  const countMap = new Map(counts.map(c => [c.groupId, Number(c.cnt)]));
  res.json(groups.map(g => ({ ...g, affiliateCount: countMap.get(g.id) ?? 0 })));
});

router.post("/admin/commission-groups", requireAdmin, async (req, res): Promise<void> => {
  const { name, description, commissionRate } = req.body;
  if (!name || commissionRate === undefined) { res.status(400).json({ error: "Name and commissionRate are required" }); return; }
  const [group] = await db.insert(commissionGroupsTable)
    .values({ name: String(name).trim(), description: description ? String(description).trim() : null, commissionRate: parseInt(String(commissionRate)) })
    .returning();
  res.json(group);
});

router.put("/admin/commission-groups/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, description, commissionRate } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (description !== undefined) updates.description = description ? String(description).trim() : null;
  if (commissionRate !== undefined) updates.commissionRate = parseInt(String(commissionRate));
  const [group] = await db.update(commissionGroupsTable).set(updates).where(eq(commissionGroupsTable.id, id)).returning();
  res.json(group);
});

router.delete("/admin/commission-groups/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.update(affiliateApplicationsTable)
    .set({ commissionGroupId: null })
    .where(eq(affiliateApplicationsTable.commissionGroupId, id));
  await db.delete(commissionGroupsTable).where(eq(commissionGroupsTable.id, id));
  res.json({ message: "Group deleted" });
});

type PayoutStatus = "pending" | "approved" | "rejected" | "hold";
const PAYOUT_STATUSES: PayoutStatus[] = ["pending", "approved", "rejected", "hold"];

function isPayoutStatus(s: unknown): s is PayoutStatus {
  return typeof s === "string" && (PAYOUT_STATUSES as string[]).includes(s);
}

/* ── Admin: all payout requests ── */
router.get("/admin/all-payouts", requireAdmin, async (req, res): Promise<void> => {
  const rawStatus = req.query.status;
  const statusFilter = isPayoutStatus(rawStatus) ? rawStatus : undefined;
  const baseQuery = db.select().from(payoutRequestsTable);
  const payouts = await (statusFilter
    ? baseQuery.where(eq(payoutRequestsTable.status, statusFilter)).orderBy(desc(payoutRequestsTable.processedAt))
    : baseQuery.orderBy(desc(payoutRequestsTable.requestedAt)));
  const enriched = await Promise.all(payouts.map(async (p) => {
    const [user] = await db.select({ name: usersTable.name, email: usersTable.email, phone: (usersTable as any).phone })
      .from(usersTable).where(eq(usersTable.id, p.userId)).limit(1);
    const [bank] = await db.select().from(affiliateBankDetailsTable)
      .where(eq(affiliateBankDetailsTable.userId, p.userId)).limit(1);
    const [kyc] = await db.select({ panNumber: affiliateKycTable.panNumber })
      .from(affiliateKycTable).where(eq(affiliateKycTable.userId, p.userId)).limit(1);
    return {
      ...p,
      amount: parseFloat(String(p.amount)),
      userName: user?.name ?? "Unknown",
      userEmail: user?.email ?? "",
      userPhone: (user as any)?.phone ?? null,
      panNumber: kyc?.panNumber ?? null,
      bankName: bank?.bankName ?? null,
      accountNumber: bank?.accountNumber ?? null,
      ifscCode: bank?.ifscCode ?? null,
      accountHolderName: bank?.accountHolderName ?? null,
    };
  }));
  res.json(enriched);
});

/* ── Admin: scheduled payouts (auto-calculated per period) ── */
router.get("/admin/scheduled-payouts", requireAdmin, async (req, res): Promise<void> => {
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const payoutPeriodDays = settings?.payoutPeriodDays ?? 7;
  const payoutWeekDay = settings?.payoutWeekDay ?? null;

  // Union: approved applications + any user with role='affiliate' (some affiliates may have been created directly)
  const approvedApps = await db.select({ userId: affiliateApplicationsTable.userId })
    .from(affiliateApplicationsTable)
    .where(eq(affiliateApplicationsTable.status, "approved"));

  const affiliateUsers = await db.select({ userId: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "affiliate"));

  const uniqueIds = Array.from(new Set([
    ...approvedApps.map(a => a.userId),
    ...affiliateUsers.map(u => u.userId),
  ]));

  const results = await Promise.all(uniqueIds.map(async (userId) => {
    const [user] = await db.select({ name: usersTable.name, email: usersTable.email, phone: (usersTable as any).phone })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) return null;

    const commissions = await db.select({ amount: referralsTable.commission })
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, userId), eq(referralsTable.status, "purchase")));
    const totalEarned = commissions.reduce((s, c) => s + parseFloat(String(c.amount ?? 0)), 0);

    const approved = await db.select({ amount: payoutRequestsTable.amount })
      .from(payoutRequestsTable)
      .where(and(eq(payoutRequestsTable.userId, userId), eq(payoutRequestsTable.status, "approved")));
    const totalPaidOut = approved.reduce((s, p) => s + parseFloat(String(p.amount)), 0);

    const unpaidAmount = Math.max(0, totalEarned - totalPaidOut);
    if (unpaidAmount <= 0) return null;

    const [lastApproved] = await db.select({ processedAt: payoutRequestsTable.processedAt })
      .from(payoutRequestsTable)
      .where(and(eq(payoutRequestsTable.userId, userId), eq(payoutRequestsTable.status, "approved")))
      .orderBy(desc(payoutRequestsTable.processedAt)).limit(1);
    const lastPayoutDate = lastApproved?.processedAt ?? null;

    let nextDueDate: Date | null = null;
    if (payoutWeekDay === null && lastPayoutDate) {
      nextDueDate = new Date(lastPayoutDate);
      nextDueDate.setDate(nextDueDate.getDate() + payoutPeriodDays);
    }
    const isDue = payoutWeekDay !== null
      ? new Date().getDay() === payoutWeekDay
      : (!nextDueDate || new Date() >= nextDueDate);

    const [latestAction] = await db.select()
      .from(payoutRequestsTable)
      .where(eq(payoutRequestsTable.userId, userId))
      .orderBy(desc(payoutRequestsTable.requestedAt)).limit(1);

    const [kyc] = await db.select({ panNumber: affiliateKycTable.panNumber, status: affiliateKycTable.status })
      .from(affiliateKycTable).where(eq(affiliateKycTable.userId, userId)).limit(1);

    const [bank] = await db.select().from(affiliateBankDetailsTable)
      .where(eq(affiliateBankDetailsTable.userId, userId)).limit(1);

    return {
      affiliateId: userId,
      name: user.name,
      email: user.email,
      phone: (user as any).phone ?? null,
      panNumber: kyc?.panNumber ?? null,
      kycStatus: kyc?.status ?? null,
      bank: bank ? {
        accountHolderName: bank.accountHolderName,
        accountNumber: bank.accountNumber,
        ifscCode: bank.ifscCode,
        bankName: bank.bankName,
      } : null,
      totalEarned,
      totalPaidOut,
      unpaidAmount,
      lastPayoutDate: lastPayoutDate?.toISOString() ?? null,
      nextDueDate: nextDueDate?.toISOString() ?? null,
      isDue,
      payoutPeriodDays,
      latestAction: latestAction ? {
        id: latestAction.id,
        status: latestAction.status,
        amount: parseFloat(String(latestAction.amount)),
        note: latestAction.rejectionReason,
        date: latestAction.requestedAt?.toISOString() ?? null,
      } : null,
    };
  }));

  res.json(results.filter(Boolean));
});

router.post("/admin/scheduled-payouts/:affiliateId/action", requireAdmin, async (req, res): Promise<void> => {
  const affiliateId = parseInt(req.params.affiliateId);
  const { action, note } = req.body;
  if (!["paid", "hold", "reject"].includes(action)) {
    res.status(400).json({ error: "Invalid action" }); return;
  }

  const commissions = await db.select({ amount: referralsTable.commission })
    .from(referralsTable)
    .where(and(eq(referralsTable.referrerId, affiliateId), eq(referralsTable.status, "purchase")));
  const totalEarned = commissions.reduce((s, c) => s + parseFloat(String(c.amount ?? 0)), 0);

  const approvedPayouts = await db.select({ amount: payoutRequestsTable.amount })
    .from(payoutRequestsTable)
    .where(and(eq(payoutRequestsTable.userId, affiliateId), eq(payoutRequestsTable.status, "approved")));
  const totalPaidOut = approvedPayouts.reduce((s, p) => s + parseFloat(String(p.amount)), 0);

  const unpaidAmount = Math.max(0, totalEarned - totalPaidOut);
  if (unpaidAmount <= 0) { res.status(400).json({ error: "No unpaid amount for this affiliate" }); return; }

  const [bank] = await db.select().from(affiliateBankDetailsTable)
    .where(eq(affiliateBankDetailsTable.userId, affiliateId)).limit(1);

  const status = action === "paid" ? "approved" : action === "hold" ? "hold" : "rejected";
  const paymentMethod = bank ? "bank_transfer" : "admin_direct";
  const paymentDetails = bank
    ? `${bank.bankName} · A/C ${bank.accountNumber} · ${bank.ifscCode}`
    : "Direct admin payout";
  const processedAt = action === "paid" ? new Date() : null;
  await db.insert(payoutRequestsTable).values({
    userId: affiliateId,
    amount: unpaidAmount.toFixed(2) as any,
    paymentMethod,
    paymentDetails,
    status: status as any,
    rejectionReason: (action === "reject" || action === "hold") && note ? note : null,
    processedAt,
  });

  // Fire payout-paid trigger only when action === "paid"
  if (action === "paid") {
    try {
      const [u] = await db.select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, affiliateId)).limit(1);
      const vars: Record<string, string> = {
        name: u?.name ?? "Affiliate",
        email: u?.email ?? "",
        payout_amount: unpaidAmount.toFixed(2),
        payment_method: paymentMethod,
        payment_details: paymentDetails,
        paid_at: (processedAt ?? new Date()).toISOString(),
      };
      triggerFunnel("affiliate_payout_paid", affiliateId, vars).catch(e =>
        console.error("[affiliate payout paid] triggerFunnel error:", e));
    } catch (e) { console.error("[affiliate payout paid] vars build error:", e); }
  }

  res.json({ message: action === "paid" ? "Marked as paid" : action === "hold" ? "Put on hold" : "Rejected" });
});

/* ── Admin: all KYC submissions ── */
router.get("/admin/all-kyc", requireAdmin, async (req, res): Promise<void> => {
  const submissions = await db.select().from(affiliateKycTable).orderBy(desc(affiliateKycTable.submittedAt));
  const enriched = await Promise.all(submissions.map(async (k) => {
    const [user] = await db.select({ name: usersTable.name, email: usersTable.email, phone: (usersTable as any).phone })
      .from(usersTable).where(eq(usersTable.id, k.userId)).limit(1);
    return {
      ...k,
      userName: user?.name ?? "Unknown",
      userEmail: user?.email ?? "",
      userPhone: (user as any)?.phone ?? null,
    };
  }));
  res.json(enriched);
});

/* ── Admin: affiliate program settings ── */
router.get("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  if (!settings) { res.json({ commissionRate: 20, affiliateEnabled: true, affiliateCookieDays: 30, affiliateMinPayout: 500, payoutPeriodDays: 7, payoutWeekDay: null, affiliateFeeEnabled: false, affiliateFeeAmount: 99 }); return; }
  res.json({
    commissionRate: settings.commissionRate,
    affiliateEnabled: settings.affiliateEnabled,
    affiliateCookieDays: settings.affiliateCookieDays,
    affiliateMinPayout: settings.affiliateMinPayout,
    payoutPeriodDays: settings.payoutPeriodDays,
    payoutWeekDay: settings.payoutWeekDay ?? null,
    affiliateFeeEnabled: settings.affiliateFeeEnabled,
    affiliateFeeAmount: settings.affiliateFeeAmount,
  });
});

router.post("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const { commissionRate, affiliateEnabled, affiliateCookieDays, affiliateMinPayout, payoutPeriodDays, payoutWeekDay, affiliateFeeEnabled, affiliateFeeAmount } = req.body;
  const [existing] = await db.select().from(platformSettingsTable).limit(1);
  const updates = {
    ...(commissionRate !== undefined && { commissionRate: parseInt(String(commissionRate)) }),
    ...(affiliateEnabled !== undefined && { affiliateEnabled: Boolean(affiliateEnabled) }),
    ...(affiliateCookieDays !== undefined && { affiliateCookieDays: parseInt(String(affiliateCookieDays)) }),
    ...(affiliateMinPayout !== undefined && { affiliateMinPayout: parseInt(String(affiliateMinPayout)) }),
    ...(payoutPeriodDays !== undefined && { payoutPeriodDays: parseInt(String(payoutPeriodDays)) }),
    ...(payoutWeekDay !== undefined && { payoutWeekDay: payoutWeekDay === null ? null : parseInt(String(payoutWeekDay)) }),
    ...(affiliateFeeEnabled !== undefined && { affiliateFeeEnabled: Boolean(affiliateFeeEnabled) }),
    ...(affiliateFeeAmount !== undefined && { affiliateFeeAmount: parseInt(String(affiliateFeeAmount)) }),
  };
  if (existing) {
    await db.update(platformSettingsTable).set(updates).where(eq(platformSettingsTable.id, existing.id));
  } else {
    await db.insert(platformSettingsTable).values({ siteName: "Upcalify", siteDescription: "", ...updates });
  }
  res.json({ message: "Settings saved" });
});

// ── Admin: Affiliate Sales ────────────────────────────────────────────────────
router.get("/admin/sales", requireAdmin, async (req, res): Promise<void> => {
  // All completed payments attributed to an affiliate
  const rows = await db
    .select({
      orderId:               paymentsTable.id,
      buyerUserId:           paymentsTable.userId,
      courseId:              paymentsTable.courseId,
      bundleId:              paymentsTable.bundleId,
      amount:                paymentsTable.amount,
      gateway:               paymentsTable.gateway,
      affiliateRef:          paymentsTable.affiliateRef,
      buyerName:             paymentsTable.billingName,
      buyerEmail:            paymentsTable.billingEmail,
      courseTitle:           coursesTable.title,
      bundleTitle:           bundlesTable.name,
      affiliateUserId:       usersTable.id,
      affiliateName:         usersTable.name,
      affiliateEmail:        usersTable.email,
      affiliateReferralCode: usersTable.referralCode,
      createdAt:             paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .leftJoin(coursesTable, eq(paymentsTable.courseId, coursesTable.id))
    .leftJoin(bundlesTable, eq(paymentsTable.bundleId, bundlesTable.id))
    .leftJoin(usersTable, eq(usersTable.referralCode, paymentsTable.affiliateRef))
    .where(and(eq(paymentsTable.status, "completed"), isNotNull(paymentsTable.affiliateRef)))
    .orderBy(desc(paymentsTable.createdAt));

  // Fetch commissions in one query and map by (referredUserId, courseId/null)
  const commissions = await db
    .select({ referredUserId: referralsTable.referredUserId, courseId: referralsTable.courseId, commission: referralsTable.commission })
    .from(referralsTable)
    .where(eq(referralsTable.status, "purchase"));

  const commMap = new Map(commissions.map(c => [`${c.referredUserId}-${c.courseId}`, parseFloat(String(c.commission ?? 0))]));

  res.json(rows.map(r => ({
    ...r,
    courseTitle: r.courseTitle ?? r.bundleTitle ?? null,
    amount: parseFloat(String(r.amount)),
    commission: commMap.get(`${r.buyerUserId}-${r.courseId}`) ?? null,
    isSelfReferral: r.buyerUserId != null && r.affiliateUserId != null && r.buyerUserId === r.affiliateUserId,
  })));
});

export default router;
