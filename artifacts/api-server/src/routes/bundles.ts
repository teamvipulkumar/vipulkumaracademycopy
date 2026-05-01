import { Router } from "express";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  bundlesTable, bundleCoursesTable, coursesTable, paymentsTable,
  enrollmentsTable, notificationsTable, usersTable, couponsTable,
  platformSettingsTable, paymentGatewaysTable, referralsTable, affiliateClicksTable,
  affiliateApplicationsTable, commissionGroupsTable,
} from "@workspace/db";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import { requireAuth, requireAdmin, signToken, verifyToken, authCookieOptions, type JwtPayload } from "../middlewares/auth";
import type { Request } from "express";
import { triggerAutomation, triggerFunnel, getPublicBaseUrl } from "./crm";
import { ensureUserForPayment, getOrCreateWelcomeVerifyLink, gatewayFetch } from "./payments";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PaytmChecksum = require("paytmchecksum");

const router = Router();
type AuthedRequest = Request & { user: JwtPayload };

/* ── Helpers ─────────────────────────────────────────────────────────────── */
async function getBundleWithCourses(bundleId: number) {
  const [bundle] = await db.select().from(bundlesTable).where(eq(bundlesTable.id, bundleId)).limit(1);
  if (!bundle) return null;
  const bundleCourses = await db
    .select({
      id: coursesTable.id,
      title: coursesTable.title,
      description: coursesTable.description,
      thumbnailUrl: coursesTable.thumbnailUrl,
      price: coursesTable.price,
      category: coursesTable.category,
      level: coursesTable.level,
      tag: coursesTable.tag,
      durationMinutes: coursesTable.durationMinutes,
    })
    .from(bundleCoursesTable)
    .leftJoin(coursesTable, eq(bundleCoursesTable.courseId, coursesTable.id))
    .where(eq(bundleCoursesTable.bundleId, bundleId));
  return {
    ...bundle,
    price: parseFloat(String(bundle.price)),
    compareAtPrice: bundle.compareAtPrice ? parseFloat(String(bundle.compareAtPrice)) : null,
    courses: bundleCourses.filter(c => c.id !== null).map(c => ({
      ...c,
      price: parseFloat(String(c.price)),
    })),
  };
}

async function enrollInBundle(bundleId: number, userId: number, affiliateRef?: string | null): Promise<{ enrolledCourses: number[]; bundleName: string }> {
  const bundle = await getBundleWithCourses(bundleId);
  if (!bundle) throw new Error("Bundle not found");

  const enrolledCourses: number[] = [];
  for (const course of bundle.courses) {
    if (!course.id) continue;
    const [existing] = await db.select().from(enrollmentsTable).where(
      and(eq(enrollmentsTable.userId, userId), eq(enrollmentsTable.courseId, course.id))
    ).limit(1);
    if (!existing) {
      await db.insert(enrollmentsTable).values({ userId, courseId: course.id });
      enrolledCourses.push(course.id);
    }
  }

  await db.insert(notificationsTable).values({
    userId,
    title: "Package Enrolled! 🎉",
    message: `You now have access to all ${bundle.courses.length} courses in "${bundle.name}".`,
    type: "success",
  });

  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (buyer) {
    triggerAutomation("purchase", buyer.id, buyer.email, {
      name: buyer.name, email: buyer.email, course_name: bundle.name,
    }).catch(() => {});
    triggerFunnel("new_purchase", buyer.id, {
      course_name: bundle.name,
      amount: String(bundle.price.toFixed(2)),
      
    }).catch(() => {});
  }

  if (affiliateRef) {
    try {
      const [referrer] = await db.select({ id: usersTable.id, role: usersTable.role, name: usersTable.name, email: usersTable.email }).from(usersTable)
        .where(eq(usersTable.referralCode, affiliateRef)).limit(1);
      if (referrer && referrer.id !== userId) {
        // Resolve commission rate: individual override → group → platform default
        const [settings] = await db.select({ commissionRate: platformSettingsTable.commissionRate })
          .from(platformSettingsTable).limit(1);
        let rate = settings?.commissionRate ?? 20;

        const [app] = await db.select({
          commissionOverride: affiliateApplicationsTable.commissionOverride,
          commissionGroupId: affiliateApplicationsTable.commissionGroupId,
          isBlocked: affiliateApplicationsTable.isBlocked,
          status: affiliateApplicationsTable.status,
        }).from(affiliateApplicationsTable)
          .where(eq(affiliateApplicationsTable.userId, referrer.id)).limit(1);

        // For affiliates: must have approved, unblocked application
        if (referrer.role === "affiliate" && (!app || app.status !== "approved" || app.isBlocked)) {
          // Not eligible — silently skip commission
        } else {
        if (app?.commissionOverride != null) {
          rate = app.commissionOverride;
        } else if (app?.commissionGroupId != null) {
          const [grp] = await db.select({ commissionRate: commissionGroupsTable.commissionRate })
            .from(commissionGroupsTable).where(eq(commissionGroupsTable.id, app.commissionGroupId)).limit(1);
          if (grp) rate = grp.commissionRate;
        }

        const [payment] = await db.select().from(paymentsTable)
          .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.bundleId, bundleId)))
          .orderBy(desc(paymentsTable.createdAt)).limit(1);
        if (payment) {
          const commission = parseFloat(((parseFloat(String(payment.amount)) * rate) / 100).toFixed(2));

          // Find an existing click referral (referredUserId is null at click time) to upgrade
          const [clickRef] = await db.select().from(referralsTable)
            .where(and(
              eq(referralsTable.referrerId, referrer.id),
              isNull(referralsTable.referredUserId),
              isNull(referralsTable.courseId),
              eq(referralsTable.status, "click"),
            ))
            .orderBy(desc(referralsTable.createdAt))
            .limit(1);

          if (clickRef) {
            // Update createdAt to NOW so dashboard time-based filters reflect purchase date
            await db.update(referralsTable)
              .set({ status: "purchase", referredUserId: userId, commission: String(commission), createdAt: new Date() })
              .where(eq(referralsTable.id, clickRef.id));
          } else {
            await db.insert(referralsTable).values({
              referrerId: referrer.id,
              referredUserId: userId,
              courseId: null,
              status: "purchase",
              commission: String(commission),
            });
          }

          // Mark any unconverted click as converted
          await db.update(affiliateClicksTable)
            .set({ convertedAt: new Date() })
            .where(and(
              eq(affiliateClicksTable.affiliateId, referrer.id),
              isNull(affiliateClicksTable.courseId),
              isNull(affiliateClicksTable.convertedAt),
            ));

          // Notify the affiliate
          await db.insert(notificationsTable).values({
            userId: referrer.id,
            title: "Commission Earned! 🎉",
            message: `You earned ₹${commission.toFixed(2)} commission from a bundle purchase.`,
            type: "success",
          });

          // Fire CRM automation + funnel for affiliate_commission event (non-blocking)
          const commissionVars = {
            name: referrer.name ?? "",
            commission_amount: commission.toFixed(2),
            payout_amount: commission.toFixed(2),
            
          };
          triggerAutomation("affiliate_commission", referrer.id, referrer.email ?? "", commissionVars).catch(e => console.error("[bundle affiliate commission] triggerAutomation error:", e));
          triggerFunnel("affiliate_commission", referrer.id, commissionVars).catch(e => console.error("[bundle affiliate commission] triggerFunnel error:", e));
        }
        } // closes else (eligible affiliate)
      }
    } catch (err) { console.error("[bundle affiliate commission]", err); }
  }

  return { enrolledCourses, bundleName: bundle.name };
}

/* ── Public Routes ───────────────────────────────────────────────────────── */

router.get("/", async (_req, res): Promise<void> => {
  try {
    const bundles = await db.select().from(bundlesTable).where(eq(bundlesTable.isActive, true)).orderBy(desc(bundlesTable.createdAt));
    const enriched = await Promise.all(bundles.map(b => getBundleWithCourses(b.id)));
    res.json(enriched.filter(Boolean));
  } catch {
    res.json([]);
  }
});

router.get("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid bundle ID" }); return; }
  const bundle = await getBundleWithCourses(id);
  if (!bundle) { res.status(404).json({ error: "Bundle not found" }); return; }
  res.json(bundle);
});

/* ── Admin Routes ────────────────────────────────────────────────────────── */

router.get("/admin/list", requireAdmin, async (_req, res): Promise<void> => {
  const bundles = await db.select().from(bundlesTable).orderBy(desc(bundlesTable.createdAt));
  const enriched = await Promise.all(bundles.map(b => getBundleWithCourses(b.id)));
  res.json(enriched.filter(Boolean));
});

router.post("/admin", requireAdmin, async (req, res): Promise<void> => {
  const { name, slug, description, thumbnailUrl, price, compareAtPrice, isActive, courseIds } = req.body;
  if (!name || !price) { res.status(400).json({ error: "name and price are required" }); return; }
  const generatedSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [bundle] = await db.insert(bundlesTable).values({
    name,
    slug: generatedSlug,
    description: description || null,
    thumbnailUrl: thumbnailUrl || null,
    price: String(parseFloat(price)),
    compareAtPrice: compareAtPrice ? String(parseFloat(compareAtPrice)) : null,
    isActive: isActive ?? true,
  }).returning();
  if (courseIds?.length) {
    await db.insert(bundleCoursesTable).values(
      (courseIds as number[]).map(cId => ({ bundleId: bundle.id, courseId: cId }))
    );
  }
  const created = await getBundleWithCourses(bundle.id);
  res.status(201).json(created);
});

router.put("/admin/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { name, slug, description, thumbnailUrl, price, compareAtPrice, isActive, courseIds } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    updates.name = name;
    if (!slug) updates.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  if (slug !== undefined) updates.slug = slug;
  if (description !== undefined) updates.description = description || null;
  if (thumbnailUrl !== undefined) updates.thumbnailUrl = thumbnailUrl || null;
  if (price !== undefined) updates.price = String(parseFloat(price));
  if (compareAtPrice !== undefined) updates.compareAtPrice = compareAtPrice ? String(parseFloat(compareAtPrice)) : null;
  if (isActive !== undefined) updates.isActive = isActive;

  const [updated] = await db.update(bundlesTable).set(updates).where(eq(bundlesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Bundle not found" }); return; }

  if (courseIds !== undefined) {
    await db.delete(bundleCoursesTable).where(eq(bundleCoursesTable.bundleId, id));
    if ((courseIds as number[]).length) {
      await db.insert(bundleCoursesTable).values(
        (courseIds as number[]).map(cId => ({ bundleId: id, courseId: cId }))
      );
    }
  }
  const result = await getBundleWithCourses(id);
  res.json(result);
});

router.delete("/admin/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(bundlesTable).where(eq(bundlesTable.id, id));
  res.json({ success: true });
});

/* ── Bundle Payment Routes ───────────────────────────────────────────────── */

// ── Legacy auth-only checkout (kept for backward compat) ──────────────────
router.post("/checkout", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { bundleId, gateway, couponCode, affiliateRef, state, mobile } = req.body;
  if (!bundleId || !gateway) { res.status(400).json({ error: "bundleId and gateway are required" }); return; }

  const bundle = await getBundleWithCourses(bundleId);
  if (!bundle || !bundle.isActive) { res.status(404).json({ error: "Bundle not found" }); return; }

  const [user] = await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, authedReq.user.userId)).limit(1);

  let amount = bundle.price;

  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date()) && (!coupon.maxUses || coupon.usedCount < coupon.maxUses) && !coupon.courseId) {
      const discount = parseFloat(String(coupon.discountValue));
      if (coupon.discountType === "percentage") amount = amount * (1 - discount / 100);
      else amount = Math.max(0, amount - discount);
    }
  }

  const sessionId = nanoid(32);
  await db.insert(paymentsTable).values({
    userId: authedReq.user.userId,
    bundleId,
    courseId: null,
    amount: String(amount.toFixed(2)),
    currency: "INR",
    status: "pending",
    gateway,
    sessionId,
    couponCode: couponCode || null,
    affiliateRef: affiliateRef || null,
    billingName: user?.name || null,
    billingEmail: user?.email || null,
    billingMobile: mobile?.trim() || null,
    billingState: state || null,
  });

  res.json({ sessionId, amount, currency: "INR", gateway });
});

router.post("/verify", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { sessionId } = req.body;
  if (!sessionId) { res.status(400).json({ error: "sessionId is required" }); return; }

  const [payment] = await db.select().from(paymentsTable).where(
    and(eq(paymentsTable.sessionId, sessionId), eq(paymentsTable.userId, authedReq.user.userId))
  ).limit(1);
  if (!payment) { res.status(404).json({ error: "Payment session not found" }); return; }
  if (!payment.bundleId) { res.status(400).json({ error: "Not a bundle payment" }); return; }

  await db.update(paymentsTable).set({ status: "completed", paymentId: `sim_${nanoid(12)}` }).where(eq(paymentsTable.id, payment.id));

  if (payment.couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, payment.couponCode)).limit(1);
    if (coupon) await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
  }

  const { enrolledCourses, bundleName } = await enrollInBundle(payment.bundleId, authedReq.user.userId, payment.affiliateRef);
  res.json({ success: true, bundleId: payment.bundleId, enrolledCourses, bundleName });
});

// ── Guest / Auto-register Bundle Checkout (simulated gateways) ───────────
router.post("/checkout/guest", async (req, res): Promise<void> => {
  const { bundleId, email, fullName, state, mobile, gateway, couponCode, affiliateRef } = req.body;
  if (!bundleId || !email || !fullName || !gateway) {
    res.status(400).json({ error: "bundleId, email, fullName, and gateway are required" }); return;
  }

  const bundle = await getBundleWithCourses(parseInt(bundleId));
  if (!bundle || !bundle.isActive) { res.status(404).json({ error: "Bundle not found" }); return; }

  // Find or create user
  let userId: number;
  let isNewUser = false;
  let tempPassword: string | undefined;

  const existingToken = req.cookies?.token;
  userId = 0;
  if (existingToken) {
    try {
      const payload = verifyToken(existingToken);
      // SECURITY: stale JWTs may reference deleted users (e.g., after a DB
      // restore). Verify the user actually exists before trusting the id.
      const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
      if (u) userId = payload.userId;
    } catch { /* invalid token — treat as guest */ }
  }

  if (!userId) {
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      tempPassword = nanoid(10);
      const hashed = await bcrypt.hash(tempPassword, 10);
      const [newUser] = await db.insert(usersTable).values({
        email: email.toLowerCase().trim(), password: hashed, name: fullName.trim(),
        referralCode: nanoid(8).toUpperCase(), role: "student",
      }).returning();
      userId = newUser.id;
      isNewUser = true;
    }
  }

  // Apply coupon (bundle-wide only — no courseId restriction)
  let amount = bundle.price;
  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date()) && (!coupon.maxUses || coupon.usedCount < coupon.maxUses) && !coupon.courseId) {
      const discount = parseFloat(String(coupon.discountValue));
      amount = coupon.discountType === "percentage" ? amount * (1 - discount / 100) : Math.max(0, amount - discount);
      await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
    }
  }

  // Insert completed payment
  const sessionId = nanoid(32);
  await db.insert(paymentsTable).values({
    userId,
    bundleId: bundle.id,
    courseId: null,
    amount: String(amount.toFixed(2)),
    currency: "INR",
    status: "completed",
    gateway,
    sessionId,
    paymentId: `sim_${nanoid(12)}`,
    couponCode: couponCode || null,
    affiliateRef: affiliateRef || null,
    billingName: fullName?.trim() || null,
    billingEmail: email?.toLowerCase().trim() || null,
    billingMobile: mobile?.trim() || null,
    billingState: state || null,
  });

  // Enroll in all bundle courses
  const { enrolledCourses, bundleName } = await enrollInBundle(bundle.id, userId, affiliateRef);

  // Auto-login
  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (freshUser) {
    if (isNewUser) {
      const verifyLink = await getOrCreateWelcomeVerifyLink(freshUser.id);
      const baseUrl = await getPublicBaseUrl();
      triggerAutomation("welcome", freshUser.id, freshUser.email, { name: freshUser.name, email: freshUser.email, verify_link: verifyLink }).catch(() => {});
      triggerFunnel("user_signup", freshUser.id, { verify_link: verifyLink, name: freshUser.name, email: freshUser.email }).catch(e => console.error("[bundle payment new user] triggerFunnel error:", e));
    }
  }
  const token = signToken({ userId: freshUser!.id, email: freshUser!.email, role: freshUser!.role });
  res.cookie("token", token, authCookieOptions());

  const { password: _, ...safeUser } = freshUser!;
  res.json({
    success: true, isNewUser, tempPassword,
    user: safeUser,
    bundleId: bundle.id, bundleName,
    enrolledCourses,
    enrolledCount: enrolledCourses.length,
  });
});

// ── Cashfree: Create Order for Bundle ─────────────────────────────────────
router.post("/cashfree/create-order", async (req, res): Promise<void> => {
  const { bundleId, email, fullName, state, mobile, couponCode, affiliateRef } = req.body;
  if (!bundleId || !email || !fullName) {
    res.status(400).json({ error: "bundleId, email, and fullName are required" }); return;
  }

  const [gw] = await db.select().from(paymentGatewaysTable).where(
    and(eq(paymentGatewaysTable.name, "cashfree"), eq(paymentGatewaysTable.isActive, true))
  ).limit(1);
  if (!gw?.apiKey || !gw?.secretKey) {
    res.status(400).json({ error: "Cashfree is not configured or inactive" }); return;
  }

  const bundle = await getBundleWithCourses(parseInt(bundleId));
  if (!bundle || !bundle.isActive) { res.status(404).json({ error: "Bundle not found" }); return; }

  // Resolve user — defer creation for brand-new emails until payment success.
  // SECURITY: see /payments/cashfree/create-order for rationale on `wasAlreadyLoggedIn`.
  let userId: number | null = null;
  let wasAlreadyLoggedIn = false;
  let pendingPasswordHash: string | null = null;
  let isNewUser = false;
  let tempPassword: string | undefined;

  const existingToken = req.cookies?.token;
  if (existingToken) {
    try {
      const payload = verifyToken(existingToken);
      // SECURITY: stale JWTs may reference deleted users (e.g., after a DB
      // restore). Verify the user actually exists before trusting the id as
      // a foreign key — otherwise the payment INSERT fails with FK violation.
      const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
      if (u) { userId = payload.userId; wasAlreadyLoggedIn = true; }
    } catch { /* invalid token — treat as guest */ }
  }

  if (!userId) {
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      tempPassword = nanoid(10);
      pendingPasswordHash = await bcrypt.hash(tempPassword, 10);
      isNewUser = true;
    }
  }

  // Apply coupon
  let amount = bundle.price;
  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon?.isActive && (!coupon.maxUses || coupon.usedCount < coupon.maxUses) && !coupon.courseId) {
      const d = parseFloat(String(coupon.discountValue));
      amount = coupon.discountType === "percentage" ? amount * (1 - d / 100) : Math.max(0, amount - d);
    }
  }

  // Insert payment record first to get the auto-incremented DB id
  const sessionId = nanoid(32);
  const host = gw.isTestMode ? "https://sandbox.cashfree.com" : "https://api.cashfree.com";
  const [pendingPayment] = await db.insert(paymentsTable).values({
    userId,
    bundleId: bundle.id,
    courseId: null,
    amount: String(amount.toFixed(2)),
    currency: "INR",
    status: "pending",
    gateway: "cashfree",
    sessionId,
    gatewayOrderId: sessionId, // temp placeholder
    couponCode: couponCode || null,
    affiliateRef: affiliateRef || null,
    billingName: fullName?.trim() || null,
    billingEmail: email?.toLowerCase().trim() || null,
    billingMobile: mobile?.trim() || null,
    billingState: state || null,
    pendingPasswordHash,
    // SECURITY: see /payments/cashfree/create-order for rationale.
    allowAutoLogin: wasAlreadyLoggedIn || isNewUser,
  }).returning();

  // Build the Cashfree order ID from the DB payment id so they match
  const cfOrderId = `ORD${pendingPayment.id}`;

  let cfResp: { order_id?: string; payment_session_id?: string; message?: string };
  try {
    const r = await gatewayFetch(`${host}/pg/orders`, {
      method: "POST",
      headers: { "x-api-version": "2023-08-01", "x-client-id": gw.apiKey, "x-client-secret": gw.secretKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: cfOrderId,
        order_amount: parseFloat(amount.toFixed(2)),
        order_currency: "INR",
        customer_details: {
          customer_id: userId ? `uid_${userId}` : `guest_${pendingPayment.id}`,
          customer_email: email.toLowerCase().trim(),
          customer_phone: mobile?.trim() || "9999999999",
          customer_name: fullName.trim(),
        },
        order_meta: { notify_url: "" },
      }),
    });
    cfResp = await r.json();
    if (!r.ok || !cfResp.payment_session_id) {
      await db.delete(paymentsTable).where(eq(paymentsTable.id, pendingPayment.id));
      res.status(400).json({ error: cfResp.message ?? "Failed to create Cashfree order" }); return;
    }
  } catch (err: unknown) {
    await db.delete(paymentsTable).where(eq(paymentsTable.id, pendingPayment.id));
    res.status(500).json({ error: (err as Error).message }); return;
  }

  // Update the payment record with the real gatewayOrderId
  await db.update(paymentsTable).set({ gatewayOrderId: cfOrderId }).where(eq(paymentsTable.id, pendingPayment.id));

  // SECURITY: only refresh the auth cookie for users who were already logged
  // in when they submitted checkout. See /payments/cashfree/create-order.
  if (wasAlreadyLoggedIn && userId) {
    const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (freshUser) {
      const token = signToken({ userId: freshUser.id, email: freshUser.email, role: freshUser.role });
      res.cookie("token", token, authCookieOptions());
    }
  }

  res.json({
    paymentSessionId: cfResp.payment_session_id,
    orderId: cfOrderId,
    isTestMode: gw.isTestMode,
    isNewUser, tempPassword,
    userId,
    bundleId: bundle.id,
    bundleName: bundle.name,
  });
});

// ── Paytm: Create Order for Bundle ───────────────────────────────────────
router.post("/paytm/create-order", async (req, res): Promise<void> => {
  const { bundleId, email, fullName, state, mobile, couponCode, affiliateRef } = req.body;
  if (!bundleId || !email || !fullName) {
    res.status(400).json({ error: "bundleId, email, and fullName are required" }); return;
  }

  const [gw] = await db.select().from(paymentGatewaysTable).where(
    and(eq(paymentGatewaysTable.name, "paytm"), eq(paymentGatewaysTable.isActive, true))
  ).limit(1);
  if (!gw?.apiKey || !gw?.secretKey) {
    res.status(400).json({ error: "Paytm is not configured or inactive" }); return;
  }

  const mid = gw.apiKey;
  const merchantKey = gw.secretKey;

  const bundle = await getBundleWithCourses(parseInt(bundleId));
  if (!bundle || !bundle.isActive) { res.status(404).json({ error: "Bundle not found" }); return; }

  // Resolve user — defer creation for brand-new emails until payment success.
  // SECURITY: see /payments/cashfree/create-order for rationale on `wasAlreadyLoggedIn`.
  let userId: number | null = null;
  let wasAlreadyLoggedIn = false;
  let pendingPasswordHash: string | null = null;
  let isNewUser = false;
  let tempPassword: string | undefined;

  const existingToken = req.cookies?.token;
  if (existingToken) {
    try {
      const payload = verifyToken(existingToken);
      // SECURITY: stale JWTs may reference deleted users (e.g., after a DB
      // restore). Verify the user actually exists before trusting the id as
      // a foreign key — otherwise the payment INSERT fails with FK violation.
      const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
      if (u) { userId = payload.userId; wasAlreadyLoggedIn = true; }
    } catch { /* invalid token — treat as guest */ }
  }

  if (!userId) {
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      tempPassword = nanoid(10);
      pendingPasswordHash = await bcrypt.hash(tempPassword, 10);
      isNewUser = true;
    }
  }

  // Apply coupon
  let amount = bundle.price;
  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon?.isActive && (!coupon.maxUses || coupon.usedCount < coupon.maxUses) && !coupon.courseId) {
      const d = parseFloat(String(coupon.discountValue));
      amount = coupon.discountType === "percentage" ? amount * (1 - d / 100) : Math.max(0, amount - d);
    }
  }

  // Paytm v3 Initiate Transaction API flow (modern, currently supported on production).
  // v3 lives on secure.paytmpayments.com (per official paytm-pg-node-sdk), not securegw.paytm.in.
  const orderId = `BPT_${nanoid(14)}`;
  const host = gw.isTestMode ? "https://securestage.paytmpayments.com" : "https://secure.paytmpayments.com";

  const forwardedProto = req.get("x-forwarded-proto") || req.protocol;
  const origin = `${forwardedProto}://${req.get("host")}`;
  const wsOverride = gw.webhookSecret?.startsWith("WS:") ? gw.webhookSecret.slice(3).trim() : "";
  const websiteName = wsOverride || (gw.isTestMode ? "WEBSTAGING" : "DEFAULT");
  const callbackUrl = `${origin}/api/payments/paytm/callback`;

  const initBody = {
    requestType: "Payment",
    mid,
    websiteName,
    orderId,
    txnAmount: { value: amount.toFixed(2), currency: "INR" },
    userInfo: {
      // userId may be null for guests — fall back to a stable per-order id.
      custId: userId ? `uid_${userId}` : `guest_${orderId}`,
      email: email.toLowerCase().trim(),
      ...(mobile?.trim() ? { mobile: mobile.trim() } : {}),
      firstName: fullName?.trim() || "",
    },
    callbackUrl,
  };

  let txnToken: string;
  try {
    const sig = await PaytmChecksum.generateSignature(JSON.stringify(initBody), merchantKey);
    const head = {
      version: "v1",
      channelId: "WEB",
      requestTimestamp: Date.now().toString(),
      signature: sig,
    };
    const initUrl = `${host}/theia/api/v1/initiateTransaction?mid=${mid}&orderId=${encodeURIComponent(orderId)}`;
    const r = await gatewayFetch(initUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: initBody, head }),
    });
    const data = await r.json() as { body?: { txnToken?: string; resultInfo?: { resultCode?: string; resultMsg?: string; resultStatus?: string } } };
    console.log("[paytm bundle create-order] initiate response:", JSON.stringify(data));
    const token = data?.body?.txnToken;
    if (!token) {
      const info = data?.body?.resultInfo;
      res.status(502).json({
        error: "Paytm initiate transaction failed",
        code: info?.resultCode,
        message: info?.resultMsg || "Unknown Paytm error",
      });
      return;
    }
    txnToken = token;
  } catch (err: unknown) {
    console.error("[paytm bundle create-order] initiate error:", err);
    res.status(500).json({ error: (err as Error).message });
    return;
  }

  // Store pending payment
  const sessionId = nanoid(32);
  await db.insert(paymentsTable).values({
    userId,
    bundleId: bundle.id,
    courseId: null,
    amount: String(amount.toFixed(2)),
    currency: "INR",
    status: "pending",
    gateway: "paytm",
    sessionId,
    gatewayOrderId: orderId,
    couponCode: couponCode || null,
    affiliateRef: affiliateRef || null,
    billingName: fullName?.trim() || null,
    billingEmail: email?.toLowerCase().trim() || null,
    billingMobile: mobile?.trim() || null,
    billingState: state || null,
    pendingPasswordHash,
    // SECURITY: see /payments/cashfree/create-order for rationale.
    allowAutoLogin: wasAlreadyLoggedIn || isNewUser,
  });

  // SECURITY: only refresh the auth cookie for users who were already logged
  // in when they submitted checkout. See /payments/cashfree/create-order.
  if (wasAlreadyLoggedIn && userId) {
    const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (freshUser) {
      const token = signToken({ userId: freshUser.id, email: freshUser.email, role: freshUser.role });
      res.cookie("token", token, authCookieOptions());
    }
  }

  // Frontend will POST { mid, orderId, txnToken } to showPaymentPage URL
  res.json({
    paytmParams: { mid, orderId, txnToken },
    actionUrl: `${host}/theia/api/v1/showPaymentPage?mid=${mid}&orderId=${encodeURIComponent(orderId)}`,
    orderId,
    amount: parseFloat(amount.toFixed(2)),
    isTestMode: gw.isTestMode,
    isNewUser, tempPassword,
    userId,
    bundleId: bundle.id,
    bundleName: bundle.name,
  });
});

// ── Stripe: Create Order for Bundle ──────────────────────────────────────────
router.post("/stripe/create-order", async (req, res): Promise<void> => {
  const { bundleId, email, fullName, state, mobile, couponCode, affiliateRef } = req.body;
  if (!bundleId || !email || !fullName) {
    res.status(400).json({ error: "bundleId, email, and fullName are required" }); return;
  }

  const [gw] = await db.select().from(paymentGatewaysTable).where(
    and(eq(paymentGatewaysTable.name, "stripe"), eq(paymentGatewaysTable.isActive, true))
  ).limit(1);
  if (!gw?.apiKey || !gw?.secretKey) {
    res.status(400).json({ error: "Stripe is not configured or inactive" }); return;
  }

  const bundle = await getBundleWithCourses(parseInt(bundleId));
  if (!bundle || !bundle.isActive) { res.status(404).json({ error: "Bundle not found" }); return; }

  // Resolve user — defer creation for brand-new emails until payment success.
  // SECURITY: see /payments/cashfree/create-order for rationale on `wasAlreadyLoggedIn`.
  let userId: number | null = null;
  let wasAlreadyLoggedIn = false;
  let pendingPasswordHash: string | null = null;
  let isNewUser = false;
  let tempPassword: string | undefined;

  const existingToken = req.cookies?.token;
  if (existingToken) {
    try {
      const payload = verifyToken(existingToken);
      // SECURITY: stale JWTs may reference deleted users (e.g., after a DB
      // restore). Verify the user actually exists before trusting the id as
      // a foreign key — otherwise the payment INSERT fails with FK violation.
      const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
      if (u) { userId = payload.userId; wasAlreadyLoggedIn = true; }
    } catch { /* invalid token — treat as guest */ }
  }

  if (!userId) {
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      tempPassword = nanoid(10);
      pendingPasswordHash = await bcrypt.hash(tempPassword, 10);
      isNewUser = true;
    }
  }

  let amount = bundle.price;
  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon?.isActive && (!coupon.maxUses || coupon.usedCount < coupon.maxUses) && !coupon.courseId) {
      const d = parseFloat(String(coupon.discountValue));
      amount = coupon.discountType === "percentage" ? amount * (1 - d / 100) : Math.max(0, amount - d);
    }
  }

  const amountInPaise = Math.round(amount * 100);

  try {
    const body = new URLSearchParams({
      amount: String(amountInPaise),
      currency: "inr",
      "payment_method_types[]": "card",
      description: bundle.name,
      "metadata[bundle_id]": String(bundle.id),
      "metadata[bundle_name]": bundle.name,
      "metadata[customer_email]": email.toLowerCase().trim(),
      "metadata[customer_name]": fullName.trim(),
    });
    const r = await gatewayFetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: { Authorization: `Bearer ${gw.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const intent = await r.json() as { client_secret: string; id: string; error?: { message: string } };
    if (!r.ok) throw new Error(intent.error?.message ?? "Stripe PaymentIntent failed");

    const sessionId = nanoid(32);
    await db.insert(paymentsTable).values({
      userId,
      bundleId: bundle.id,
      courseId: null,
      amount: String(amount.toFixed(2)),
      currency: "INR",
      status: "pending",
      gateway: "stripe",
      sessionId,
      paymentId: intent.id,
      couponCode: couponCode || null,
      affiliateRef: affiliateRef || null,
      billingName: fullName?.trim() || null,
      billingEmail: email?.toLowerCase().trim() || null,
      billingMobile: mobile?.trim() || null,
      billingState: state || null,
      pendingPasswordHash,
      // SECURITY: see /payments/cashfree/create-order for rationale.
      allowAutoLogin: wasAlreadyLoggedIn || isNewUser,
    });

    // SECURITY: only refresh the auth cookie + return real DB user fields when
    // the request was already authenticated. Guests (including matched-by-email)
    // get a display-only `safeUser` from the form so we don't leak the existing
    // user's name/role. See /payments/cashfree/create-order for full rationale.
    let safeUser: Record<string, unknown>;
    if (wasAlreadyLoggedIn && userId) {
      const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (freshUser) {
        const token = signToken({ userId: freshUser.id, email: freshUser.email, role: freshUser.role });
        res.cookie("token", token, authCookieOptions());
        const { password: _p, ...rest } = freshUser;
        safeUser = rest;
      } else {
        safeUser = {
          id: null,
          email: email.toLowerCase().trim(),
          name: fullName.trim(),
          role: "student",
        };
      }
    } else {
      safeUser = {
        id: null,
        email: email.toLowerCase().trim(),
        name: fullName.trim(),
        role: "student",
      };
    }

    res.json({
      clientSecret: intent.client_secret, publishableKey: gw.apiKey,
      sessionId, paymentIntentId: intent.id, amount,
      isNewUser, tempPassword, user: safeUser,
      bundleName: bundle.name, bundleId: bundle.id,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Stripe: Verify Payment for Bundle ────────────────────────────────────────
router.post("/stripe/verify", async (req, res): Promise<void> => {
  const { paymentIntentId, sessionId } = req.body;
  if (!paymentIntentId || !sessionId) {
    res.status(400).json({ error: "paymentIntentId and sessionId are required" }); return;
  }

  const [payment] = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.sessionId, sessionId)).limit(1);
  if (!payment || !payment.bundleId) { res.status(404).json({ error: "Bundle payment session not found" }); return; }

  const [gw] = await db.select().from(paymentGatewaysTable).where(
    and(eq(paymentGatewaysTable.name, "stripe"), eq(paymentGatewaysTable.isActive, true))
  ).limit(1);
  if (!gw) { res.status(400).json({ error: "Stripe gateway not configured" }); return; }

  // SECURITY: bind paymentIntentId to this session BEFORE asking Stripe to
  // verify it. Mirrors /payments/stripe/verify — without this an attacker who
  // got hold of any other succeeded payment_intent could replay it to complete
  // this pending bundle session and get a free bundle enrollment.
  if (!payment.paymentId || payment.paymentId !== paymentIntentId) {
    console.warn("[bundles stripe verify] paymentIntentId mismatch", {
      sessionId, expected: payment.paymentId, received: paymentIntentId,
    });
    res.status(400).json({ error: "Payment intent does not belong to this session" });
    return;
  }

  const r = await gatewayFetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
    headers: { Authorization: `Bearer ${gw.secretKey}` },
  });
  const intent = await r.json() as {
    status: string;
    amount?: number;
    currency?: string;
    error?: { message: string };
  };
  if (!r.ok) { res.status(400).json({ error: (intent as { error?: { message: string } }).error?.message ?? "Failed to verify Stripe payment" }); return; }

  if (intent.status !== "succeeded") {
    res.status(400).json({ error: `Payment not completed. Stripe status: ${intent.status}` }); return;
  }

  // SECURITY: enforce amount + currency match against DB row.
  const expectedAmountMinor = Math.round(parseFloat(String(payment.amount)) * 100);
  if (typeof intent.amount !== "number" || intent.amount !== expectedAmountMinor) {
    console.warn("[bundles stripe verify] amount mismatch", {
      sessionId, expected: expectedAmountMinor, received: intent.amount,
    });
    res.status(400).json({ error: "Payment amount mismatch" });
    return;
  }
  if (!intent.currency || intent.currency.toLowerCase() !== String(payment.currency).toLowerCase()) {
    console.warn("[bundles stripe verify] currency mismatch", {
      sessionId, expected: payment.currency, received: intent.currency,
    });
    res.status(400).json({ error: "Payment currency mismatch" });
    return;
  }

  // Materialise the user account NOW (deferred until payment success). After
  // this returns, payment.userId is non-null and we can safely enroll.
  const { userId: resolvedUserId } = await ensureUserForPayment(payment);
  payment.userId = resolvedUserId;

  // SECURITY: only set the auto-login cookie when allowAutoLogin is true.
  // See /payments/cashfree/create-order for full rationale.
  if (payment.allowAutoLogin) {
    const [authedUser] = await db.select().from(usersTable).where(eq(usersTable.id, resolvedUserId)).limit(1);
    if (authedUser) {
      const tk = signToken({ userId: authedUser.id, email: authedUser.email, role: authedUser.role });
      res.cookie("token", tk, authCookieOptions());
    }
  }

  if (payment.status === "completed") {
    const bundle = await getBundleWithCourses(payment.bundleId);
    const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, resolvedUserId)).limit(1);
    // SECURITY: only return DB user fields when allowAutoLogin is true; otherwise
    // hand back a display-only object built from billing info so we don't leak
    // the existing user's name/role to a guest using their email.
    const safeUser = (payment.allowAutoLogin && freshUser)
      ? (() => { const { password: _p2, ...rest } = freshUser; return rest; })()
      : { id: null, email: payment.billingEmail ?? "", name: payment.billingName ?? "", role: "student" };
    res.json({ success: true, alreadyEnrolled: true, bundleId: payment.bundleId, bundleName: bundle?.name, user: safeUser, enrolledCount: bundle?.courses.length ?? 0 });
    return;
  }

  await db.update(paymentsTable).set({ status: "completed", paymentId: paymentIntentId })
    .where(eq(paymentsTable.id, payment.id));

  const { enrolledCourses, bundleName } = await enrollInBundle(payment.bundleId, resolvedUserId, payment.affiliateRef);

  if (payment.couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, payment.couponCode)).limit(1);
    if (coupon) await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
  }

  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, resolvedUserId)).limit(1);
  // SECURITY: see above — same rationale.
  const safeUser = (payment.allowAutoLogin && freshUser)
    ? (() => { const { password: _p3, ...rest } = freshUser; return rest; })()
    : { id: null, email: payment.billingEmail ?? "", name: payment.billingName ?? "", role: "student" };
  res.json({
    success: true,
    bundleId: payment.bundleId,
    bundleName,
    enrolledCount: enrolledCourses.length,
    user: safeUser,
  });
});

export default router;
