import { Router } from "express";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  paymentsTable, coursesTable, enrollmentsTable, couponsTable, notificationsTable,
  usersTable, paymentGatewaysTable, referralsTable, affiliateClicksTable,
  affiliateApplicationsTable, platformSettingsTable, affiliatePixelTable,
  commissionGroupsTable,
} from "@workspace/db";
import { eq, and, desc, isNull, or } from "drizzle-orm";
import { bundlesTable, bundleCoursesTable } from "@workspace/db";
import { requireAuth, requireAdmin, signToken, verifyToken, authCookieOptions, type JwtPayload } from "../middlewares/auth";
import type { Request } from "express";
import { triggerAutomation, triggerFunnel, getPublicBaseUrl } from "./crm";
import { sendFbEvent } from "../lib/facebook-pixel";
import { generateGstInvoice } from "./gst";

const router = Router();
type AuthedRequest = Request & { user: JwtPayload };

// Wraps `fetch` with a 15s timeout AND a graceful non-JSON error guard.
// Two real-world failure modes this handles:
//   1. Slow/hung gateway → user used to wait 30+s for a cryptic error.
//      Now they get a clear message fast and can simply retry.
//   2. Gateway returns an HTML error page (e.g., Cashfree sandbox 504 Gateway
//      Time-out) → downstream `r.json()` used to throw "Unexpected token '<'"
//      which leaked to the user's browser as a confusing JSON-parse error.
//      Now we detect non-JSON error responses here and throw a clean message.
export async function gatewayFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error("Payment gateway is taking too long to respond. Please try a different payment method or try again in a moment.");
    }
    throw err;
  }
  if (!r.ok && !(r.headers.get("content-type") || "").includes("json")) {
    throw new Error(`Payment gateway is temporarily unavailable (status ${r.status}). Please try a different payment method or try again in a moment.`);
  }
  return r;
}

/* ── Affiliate Commission Helper ─────────────────────────────────────────── */
async function recordAffiliateCommission(
  affiliateRef: string | null | undefined,
  buyerId: number,
  courseId: number | null,
  saleAmount: number,
): Promise<void> {
  if (!affiliateRef) {
    console.info("[affiliate commission] skipped — no affiliateRef");
    return;
  }
  const purchaseType = courseId != null ? `course(${courseId})` : "bundle";
  console.info(`[affiliate commission] start | ref=${affiliateRef} buyer=${buyerId} type=${purchaseType} amount=${saleAmount}`);
  try {
    // Find referrer (include role, name, email for eligibility check + automation triggers)
    const [referrer] = await db.select({ id: usersTable.id, role: usersTable.role, name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.referralCode, affiliateRef)).limit(1);
    if (!referrer) {
      console.warn(`[affiliate commission] referrer not found for code=${affiliateRef}`);
      return;
    }

    // Prevent self-referral
    if (referrer.id === buyerId) {
      console.info(`[affiliate commission] self-referral skipped referrerId=${referrer.id}`);
      return;
    }

    // Get commission rate: check application for commission override; admins/affiliates both eligible
    const [settings] = await db.select({ commissionRate: platformSettingsTable.commissionRate }).from(platformSettingsTable).limit(1);
    const defaultRate = settings?.commissionRate ?? 20;

    let rate = defaultRate;

    if (referrer.role === "affiliate") {
      // Affiliates must have an approved, non-blocked application
      const [app] = await db.select({
        commissionOverride: affiliateApplicationsTable.commissionOverride,
        commissionGroupId: affiliateApplicationsTable.commissionGroupId,
        isBlocked: affiliateApplicationsTable.isBlocked,
      })
        .from(affiliateApplicationsTable)
        .where(and(eq(affiliateApplicationsTable.userId, referrer.id), eq(affiliateApplicationsTable.status, "approved")))
        .limit(1);
      if (!app) {
        console.warn(`[affiliate commission] affiliate referrerId=${referrer.id} has no approved application — skipping`);
        return;
      }
      if (app.isBlocked) {
        console.warn(`[affiliate commission] affiliate referrerId=${referrer.id} is blocked — skipping`);
        return;
      }
      if (app.commissionOverride != null) {
        rate = app.commissionOverride; // Individual override takes highest priority
      } else if (app.commissionGroupId != null) {
        const [grp] = await db.select({ commissionRate: commissionGroupsTable.commissionRate })
          .from(commissionGroupsTable).where(eq(commissionGroupsTable.id, app.commissionGroupId)).limit(1);
        if (grp) rate = grp.commissionRate; // Group rate second priority
      }
    } else if (referrer.role === "admin") {
      // Admins can always earn commission — use platform default (no block check)
      const [app] = await db.select({
        commissionOverride: affiliateApplicationsTable.commissionOverride,
        commissionGroupId: affiliateApplicationsTable.commissionGroupId,
      })
        .from(affiliateApplicationsTable)
        .where(eq(affiliateApplicationsTable.userId, referrer.id))
        .limit(1);
      if (app?.commissionOverride != null) {
        rate = app.commissionOverride;
      } else if (app?.commissionGroupId != null) {
        const [grp] = await db.select({ commissionRate: commissionGroupsTable.commissionRate })
          .from(commissionGroupsTable).where(eq(commissionGroupsTable.id, app.commissionGroupId)).limit(1);
        if (grp) rate = grp.commissionRate;
      }
    } else {
      // Students and other roles cannot earn commission without an application
      console.warn(`[affiliate commission] referrerId=${referrer.id} role=${referrer.role} is ineligible — skipping`);
      return;
    }

    const commission = parseFloat(((saleAmount * rate) / 100).toFixed(2));
    console.info(`[affiliate commission] rate=${rate}% commission=₹${commission} referrerId=${referrer.id}`);

    // Find the most recent click referral for this referrer+course that isn't yet a purchase.
    // First try exact courseId match; if not found, fall back to a generic click (courseId IS NULL)
    // which is what gets created when someone clicks a bare affiliate link (no specific course).
    const [clickRef] = await db.select()
      .from(referralsTable)
      .where(and(
        eq(referralsTable.referrerId, referrer.id),
        courseId != null ? eq(referralsTable.courseId, courseId) : isNull(referralsTable.courseId),
        isNull(referralsTable.referredUserId),
        eq(referralsTable.status, "click"),
      ))
      .orderBy(desc(referralsTable.createdAt))
      .limit(1);

    // If no exact-course click, look for ANY generic (courseId=null) click referral to upgrade
    const [genericClickRef] = clickRef ? [null] : await db.select()
      .from(referralsTable)
      .where(and(
        eq(referralsTable.referrerId, referrer.id),
        isNull(referralsTable.courseId),
        isNull(referralsTable.referredUserId),
        eq(referralsTable.status, "click"),
      ))
      .orderBy(desc(referralsTable.createdAt))
      .limit(1);

    const refToUpgrade = clickRef ?? genericClickRef;

    if (refToUpgrade) {
      console.info(`[affiliate commission] upgrading click referral id=${refToUpgrade.id} → purchase`);
      // Update createdAt to NOW so dashboard time-based filters (today, last 7 days, etc.)
      // reflect WHEN the commission was earned, not when the affiliate link was clicked.
      await db.update(referralsTable)
        .set({ status: "purchase", referredUserId: buyerId, courseId: courseId ?? refToUpgrade.courseId, commission: String(commission), createdAt: new Date() })
        .where(eq(referralsTable.id, refToUpgrade.id));
    } else {
      console.info(`[affiliate commission] no click referral found — inserting new purchase referral`);
      await db.insert(referralsTable).values({
        referrerId: referrer.id, referredUserId: buyerId, courseId, status: "purchase", commission: String(commission),
      });
    }

    // Mark affiliate click as converted (use IS NULL for courseId to avoid SQL = NULL bug)
    await db.update(affiliateClicksTable)
      .set({ convertedAt: new Date() })
      .where(and(
        eq(affiliateClicksTable.affiliateId, referrer.id),
        courseId != null
          ? or(eq(affiliateClicksTable.courseId, courseId), isNull(affiliateClicksTable.courseId))
          : isNull(affiliateClicksTable.courseId),
        isNull(affiliateClicksTable.convertedAt),
      ));

    // Notify the affiliate — context-aware message for course vs bundle
    const purchaseLabel = courseId != null ? "a course purchase" : "a bundle/package purchase";
    await db.insert(notificationsTable).values({
      userId: referrer.id,
      title: "Commission Earned! 🎉",
      message: `You earned ₹${commission.toFixed(2)} commission from ${purchaseLabel}.`,
      type: "success",
    });

    // Fire CRM automation + funnel for affiliate_commission event (non-blocking)
    const commissionVars = {
      name: referrer.name,
      commission_amount: commission.toFixed(2),
      payout_amount: commission.toFixed(2),
      
    };
    triggerAutomation("affiliate_commission", referrer.id, referrer.email, commissionVars).catch(e => console.error("[affiliate commission] triggerAutomation error:", e));
    triggerFunnel("affiliate_commission", referrer.id, commissionVars).catch(e => console.error("[affiliate commission] triggerFunnel error:", e));

    console.info(`[affiliate commission] done — commission=₹${commission} referrerId=${referrer.id} type=${purchaseType}`);

    // Fire FB Purchase event (non-blocking) — value = affiliate commission
    const [pixel] = await db.select({ facebookPixelId: affiliatePixelTable.facebookPixelId, accessToken: affiliatePixelTable.accessToken })
      .from(affiliatePixelTable).where(eq(affiliatePixelTable.userId, referrer.id)).limit(1);
    if (pixel?.facebookPixelId && pixel?.accessToken) {
      sendFbEvent(pixel.facebookPixelId, pixel.accessToken, {
        eventName: "Purchase",
        value: commission,
        currency: "INR",
      }).catch(e => console.error("[fb pixel Purchase]", e));
    }
  } catch (err) { console.error("[affiliate commission] ERROR:", err); }
}

/* ── Deferred-User Helper ─────────────────────────────────────────────────
 * For guest checkouts where the customer is NOT logged in and the email is
 * not yet in `users`, we now defer creating the user row until the gateway
 * confirms the payment. The payment row is inserted with `userId = null` and
 * a bcrypt hash of the auto-generated password in `pendingPasswordHash`.
 *
 * Every payment-completion path (verify / webhook / callback) MUST call
 * `ensureUserForPayment(payment)` BEFORE accessing `payment.userId` so that:
 *   • If userId is already set → return it as-is.
 *   • Else find the user by billingEmail (race-safe). If found → bind to the
 *     payment row and return it.
 *   • Else create the user using the stored pendingPasswordHash, fire the
 *     `user_signup` funnel, bind to the payment row and return the new id.
 *
 * The payment row is updated in-place (userId set, pendingPasswordHash
 * cleared) so callers can safely re-read it after this returns.
 */
/**
 * Ensure a purchase-created user has an active emailVerifyToken and return the
 * full {{verify_link}} for use in welcome / signup emails. If a token already
 * exists (and isn't expired) we keep it; otherwise we mint a new 7-day token
 * so the "Verify My Email" button in the Welcome template always works.
 *
 * Returns "" only if everything fails (helper is non-throwing — purchase flows
 * should never fail because of an email-link side effect).
 */
export async function getOrCreateWelcomeVerifyLink(userId: number): Promise<string> {
  try {
    const baseUrl = await getPublicBaseUrl();
    if (!baseUrl) return "";
    const [u] = await db
      .select({
        token: usersTable.emailVerifyToken,
        expiresAt: usersTable.emailVerifyTokenExpiresAt,
        verified: usersTable.emailVerified,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!u) return "";
    let token = u.token;
    const stillValid =
      !!token && !!u.expiresAt && new Date(u.expiresAt).getTime() > Date.now();
    if (!stillValid) {
      token = nanoid(40);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db
        .update(usersTable)
        .set({ emailVerifyToken: token, emailVerifyTokenExpiresAt: expiresAt })
        .where(eq(usersTable.id, userId));
    }
    return `${baseUrl}/verify-email?token=${token}`;
  } catch (e) {
    console.error("[getOrCreateWelcomeVerifyLink] error:", e);
    return "";
  }
}

export async function ensureUserForPayment(
  payment: typeof paymentsTable.$inferSelect,
): Promise<{ userId: number; isNewUser: boolean }> {
  if (payment.userId) {
    return { userId: payment.userId, isNewUser: false };
  }
  const email = payment.billingEmail?.toLowerCase().trim();
  if (!email) {
    throw new Error(`ensureUserForPayment: payment ${payment.id} has no billingEmail`);
  }
  const name = payment.billingName?.trim() || "Customer";

  // Try to find existing user by email first (handles repeat customers + races).
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  let userId: number;
  let isNewUser = false;

  if (existing) {
    userId = existing.id;
  } else {
    const passwordHash = payment.pendingPasswordHash || (await bcrypt.hash(nanoid(10), 10));
    try {
      const [created] = await db.insert(usersTable).values({
        email,
        password: passwordHash,
        name,
        referralCode: nanoid(8).toUpperCase(),
        role: "student",
      }).returning();
      userId = created.id;
      isNewUser = true;
    } catch (err) {
      // Likely a unique-violation race — re-read by email.
      const [u] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (!u) throw err;
      userId = u.id;
    }
    if (isNewUser) {
      const verifyLink = await getOrCreateWelcomeVerifyLink(userId);
      const baseUrl = await getPublicBaseUrl();
      triggerAutomation("welcome", userId, email, {
        name,
        email,
        verify_link: verifyLink,
      }).catch(() => {});
      triggerFunnel("user_signup", userId, {
        verify_link: verifyLink,
        
        name,
        email,
      }).catch(e => console.error("[ensureUserForPayment] triggerFunnel error:", e));
    }
  }

  // Bind user to payment row + clear the now-redundant hash.
  await db.update(paymentsTable).set({ userId, pendingPasswordHash: null })
    .where(eq(paymentsTable.id, payment.id));

  return { userId, isNewUser };
}

router.post("/checkout", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { courseId, couponCode, gateway, affiliateRef, state, mobile } = req.body;
  if (!courseId || !gateway) { res.status(400).json({ error: "courseId and gateway are required" }); return; }

  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  const [user] = await db.select({ name: usersTable.name, email: usersTable.email, phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, authedReq.user.userId)).limit(1);

  let amount = parseFloat(course.price);

  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date()) && (!coupon.maxUses || coupon.usedCount < coupon.maxUses)) {
      if (!coupon.courseId || coupon.courseId === courseId) {
        const discount = parseFloat(String(coupon.discountValue));
        if (coupon.discountType === "percentage") amount = amount * (1 - discount / 100);
        else amount = Math.max(0, amount - discount);
      }
    }
  }

  const sessionId = nanoid(32);
  await db.insert(paymentsTable).values({
    userId: authedReq.user.userId,
    courseId,
    amount: String(amount.toFixed(2)),
    currency: "INR",
    status: "pending",
    gateway,
    sessionId,
    couponCode: couponCode || null,
    affiliateRef: affiliateRef || null,
    billingName: user?.name || null,
    billingEmail: user?.email || null,
    billingMobile: mobile?.trim() || user?.phone || null,
    billingState: state || null,
  });

  res.json({ sessionId, amount, currency: "INR", gateway, redirectUrl: null, razorpayOrderId: null, razorpayKey: null });
});

router.post("/verify", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const { sessionId } = req.body;
  if (!sessionId) { res.status(400).json({ error: "sessionId is required" }); return; }

  const [payment] = await db.select().from(paymentsTable).where(and(eq(paymentsTable.sessionId, sessionId), eq(paymentsTable.userId, authedReq.user.userId))).limit(1);
  if (!payment) { res.status(404).json({ error: "Payment session not found" }); return; }

  await db.update(paymentsTable).set({ status: "completed", paymentId: `sim_${nanoid(12)}` }).where(eq(paymentsTable.id, payment.id));
  generateGstInvoice(payment.id).catch(() => {});

  const existing = await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, authedReq.user.userId), eq(enrollmentsTable.courseId, payment.courseId))).limit(1);
  let enrollmentId: number | null = null;
  if (existing.length === 0) {
    const [enrollment] = await db.insert(enrollmentsTable).values({ userId: authedReq.user.userId, courseId: payment.courseId }).returning();
    enrollmentId = enrollment.id;
    const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
    await db.insert(notificationsTable).values({ userId: authedReq.user.userId, title: "Enrollment Confirmed!", message: `You are now enrolled in ${course?.title ?? "the course"}`, type: "success" });
    const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, authedReq.user.userId)).limit(1);
    if (buyer) {
      triggerAutomation("purchase", buyer.id, buyer.email, { name: buyer.name, email: buyer.email, course_name: course?.title ?? "", amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
      triggerFunnel("new_purchase", buyer.id, { course_name: course?.title ?? "", amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
    }
    await recordAffiliateCommission(payment.affiliateRef, authedReq.user.userId, payment.courseId, parseFloat(String(payment.amount)));
  } else {
    enrollmentId = existing[0].id;
  }

  if (payment.couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, payment.couponCode)).limit(1);
    if (coupon) await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
  }

  res.json({ success: true, enrollmentId, message: "Payment verified and enrolled" });
});

router.get("/history", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.userId, authedReq.user.userId)).orderBy(paymentsTable.createdAt);
  const enriched = await Promise.all(payments.map(async (p) => {
    if (p.bundleId) {
      const [bundle] = await db.select().from(bundlesTable).where(eq(bundlesTable.id, p.bundleId)).limit(1);
      return { ...p, amount: parseFloat(String(p.amount)), course: null, bundle: bundle ? { id: bundle.id, name: bundle.name, thumbnailUrl: bundle.thumbnailUrl } : null };
    }
    const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, p.courseId)).limit(1);
    return { ...p, amount: parseFloat(String(p.amount)), bundle: null, course: course ? { ...course, price: parseFloat(course.price), moduleCount: 0, lessonCount: 0, enrollmentCount: 0 } : null };
  }));
  res.json(enriched);
});

router.get("/my-bundles", requireAuth, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const userId = authedReq.user.userId;

  // Only consider completed (non-refunded) bundle payments
  const bundlePayments = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "completed")))
    .orderBy(paymentsTable.createdAt);
  const bundleIds = [...new Set(bundlePayments.filter(p => p.bundleId).map(p => p.bundleId!))];

  const result = await Promise.all(bundleIds.map(async (bid) => {
    const [bundle] = await db.select().from(bundlesTable).where(eq(bundlesTable.id, bid)).limit(1);
    if (!bundle) return null;

    const bundleCourseRows = await db
      .select({
        id: coursesTable.id, title: coursesTable.title, description: coursesTable.description,
        thumbnailUrl: coursesTable.thumbnailUrl, price: coursesTable.price,
        category: coursesTable.category, level: coursesTable.level, tag: coursesTable.tag, durationMinutes: coursesTable.durationMinutes,
      })
      .from(bundleCoursesTable)
      .leftJoin(coursesTable, eq(bundleCoursesTable.courseId, coursesTable.id))
      .where(eq(bundleCoursesTable.bundleId, bid));

    const validCourses = bundleCourseRows.filter(c => c.id !== null);

    // Secondary guard: verify the user still has at least one active enrollment
    // in the bundle's courses. This ensures refunded bundles (where enrollments
    // are deleted) are hidden even if the payment status check somehow passes.
    if (validCourses.length > 0) {
      const courseIds = validCourses.map(c => c.id!);
      const [anyEnrollment] = await db
        .select({ id: enrollmentsTable.id })
        .from(enrollmentsTable)
        .where(and(
          eq(enrollmentsTable.userId, userId),
          courseIds.length === 1
            ? eq(enrollmentsTable.courseId, courseIds[0])
            : or(...courseIds.map(cid => eq(enrollmentsTable.courseId, cid)))
        ))
        .limit(1);
      if (!anyEnrollment) return null; // Refunded / access revoked
    }

    const payment = bundlePayments.find(p => p.bundleId === bid);
    return {
      ...bundle,
      price: parseFloat(String(bundle.price)),
      compareAtPrice: bundle.compareAtPrice ? parseFloat(String(bundle.compareAtPrice)) : null,
      purchasedAt: payment?.createdAt,
      amount: payment ? parseFloat(String(payment.amount)) : null,
      courses: validCourses.map(c => ({ ...c, price: parseFloat(String(c.price)) })),
    };
  }));
  res.json(result.filter(Boolean));
});

// ── Guest / Auto-register Checkout ───────────────────────────────────────────
router.post("/checkout/guest", async (req, res): Promise<void> => {
  const { courseId, email, fullName, state, mobile, gateway, couponCode, affiliateRef } = req.body;
  if (!courseId || !email || !fullName || !gateway) {
    res.status(400).json({ error: "courseId, email, fullName, and gateway are required" }); return;
  }

  // Determine user (logged-in or find/create by email)
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
    } catch {
      /* invalid token — treat as guest */
    }
  }

  if (!userId) {
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Auto-create account
      tempPassword = nanoid(10);
      const hashed = await bcrypt.hash(tempPassword, 10);
      const referralCode = nanoid(8).toUpperCase();
      const [newUser] = await db.insert(usersTable).values({
        email: email.toLowerCase().trim(),
        password: hashed,
        name: fullName.trim(),
        referralCode,
        role: "student",
      }).returning();
      userId = newUser.id;
      isNewUser = true;
    }
  }

  // Coupon
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, parseInt(courseId))).limit(1);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  let amount = parseFloat(course.price);
  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date()) && (!coupon.maxUses || coupon.usedCount < coupon.maxUses)) {
      if (!coupon.courseId || coupon.courseId === parseInt(courseId)) {
        const discount = parseFloat(String(coupon.discountValue));
        amount = coupon.discountType === "percentage" ? amount * (1 - discount / 100) : Math.max(0, amount - discount);
        await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
      }
    }
  }

  // Payment + Enrollment
  const sessionId = nanoid(32);
  const [newPayment] = await db.insert(paymentsTable).values({
    userId, courseId: parseInt(courseId),
    amount: String(amount.toFixed(2)), currency: "INR",
    status: "completed", gateway,
    sessionId, paymentId: `sim_${nanoid(12)}`,
    couponCode: couponCode || null,
    affiliateRef: affiliateRef || null,
    billingName: fullName?.trim() || null,
    billingEmail: email?.toLowerCase().trim() || null,
    billingMobile: mobile?.trim() || null,
    billingState: state || null,
  }).returning({ id: paymentsTable.id });
  if (newPayment) generateGstInvoice(newPayment.id).catch(() => {});

  const [existing] = await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, userId), eq(enrollmentsTable.courseId, parseInt(courseId)))).limit(1);
  if (!existing) {
    await db.insert(enrollmentsTable).values({ userId, courseId: parseInt(courseId) });
    await db.insert(notificationsTable).values({ userId, title: "Enrollment Confirmed!", message: `You are now enrolled in ${course.title}`, type: "success" });
    await recordAffiliateCommission(affiliateRef, userId, parseInt(courseId), amount);
  }

  // Auto-login: set JWT cookie
  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (freshUser) {
    if (isNewUser) {
      const verifyLink = await getOrCreateWelcomeVerifyLink(freshUser.id);
      const baseUrl = await getPublicBaseUrl();
      triggerAutomation("welcome", freshUser.id, freshUser.email, { name: freshUser.name, email: freshUser.email, verify_link: verifyLink }).catch(() => {});
      triggerFunnel("user_signup", freshUser.id, { verify_link: verifyLink, name: freshUser.name, email: freshUser.email }).catch(e => console.error("[course payment new user] triggerFunnel error:", e));
    }
    if (!existing) {
      triggerAutomation("purchase", freshUser.id, freshUser.email, { name: freshUser.name, email: freshUser.email, course_name: course.title, amount: String(amount.toFixed(2)) }).catch(() => {});
      triggerFunnel("new_purchase", freshUser.id, { course_name: course.title, amount: String(amount.toFixed(2)) }).catch(() => {});
    }
  }
  const token = signToken({ userId: freshUser!.id, email: freshUser!.email, role: freshUser!.role });
  res.cookie("token", token, authCookieOptions());

  const { password: _, ...safeUser } = freshUser!;
  res.json({ success: true, isNewUser, tempPassword, user: safeUser, courseId: parseInt(courseId), courseTitle: course.title });
});

// ── Cashfree: Create Order + Pre-register User ───────────────────────────────
router.post("/cashfree/create-order", async (req, res): Promise<void> => {
  const { courseId, email, fullName, state, mobile, couponCode, affiliateRef } = req.body;
  if (!courseId || !email || !fullName) {
    res.status(400).json({ error: "courseId, email, and fullName are required" }); return;
  }

  // Find the Cashfree gateway config
  const [gw] = await db.select().from(paymentGatewaysTable).where(
    and(eq(paymentGatewaysTable.name, "cashfree"), eq(paymentGatewaysTable.isActive, true))
  ).limit(1);
  if (!gw?.apiKey || !gw?.secretKey) {
    res.status(400).json({ error: "Cashfree is not configured or inactive" }); return;
  }

  // Resolve user — defer creation for brand-new emails until payment success.
  // SECURITY: `wasAlreadyLoggedIn` is true ONLY when the request arrived with a
  // valid auth cookie. Matching an existing user by email alone does NOT count
  // as authenticated — otherwise anyone could enter a known email at checkout
  // and silently get logged in as that user without paying.
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
      // NEW email → don't create the user yet; only stash a hashed password
      // for ensureUserForPayment() to use after the gateway confirms payment.
      tempPassword = nanoid(10);
      pendingPasswordHash = await bcrypt.hash(tempPassword, 10);
      isNewUser = true;
    }
  }

  // Apply coupon
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, parseInt(courseId))).limit(1);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  let amount = parseFloat(course.price);
  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon?.isActive && (!coupon.maxUses || coupon.usedCount < coupon.maxUses)) {
      const d = parseFloat(String(coupon.discountValue));
      amount = coupon.discountType === "percentage" ? amount * (1 - d / 100) : Math.max(0, amount - d);
    }
  }

  // Insert payment record first to get the auto-incremented DB id
  const sessionId = nanoid(32);
  const host = gw.isTestMode ? "https://sandbox.cashfree.com" : "https://api.cashfree.com";
  const [pendingPayment] = await db.insert(paymentsTable).values({
    userId, courseId: parseInt(courseId),
    amount: String(amount.toFixed(2)), currency: "INR",
    status: "pending", gateway: "cashfree",
    sessionId, gatewayOrderId: sessionId, // temp placeholder
    couponCode: couponCode || null,
    affiliateRef: affiliateRef || null,
    billingName: fullName?.trim() || null,
    billingEmail: email?.toLowerCase().trim() || null,
    billingMobile: mobile?.trim() || null,
    billingState: state || null,
    pendingPasswordHash,
    // SECURITY: auto-login is allowed only for already-logged-in customers and
    // for brand-new emails (where we own the temp password). Guests using an
    // existing user's email get the course/bundle but never the cookie.
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
          // userId may be null for guests — fall back to the payment row id.
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

  // SECURITY: only refresh the auth cookie for users who were already logged in
  // when they submitted checkout. Guests (including ones whose typed-in email
  // happens to match an existing account) MUST NOT be auto-logged-in here —
  // the cookie is set later by the verify/webhook handlers, after the gateway
  // confirms the payment was actually captured.
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
    courseId: parseInt(courseId),
    courseTitle: course.title,
  });
});

// ── Cashfree: Verify Payment & Complete Enrollment ────────────────────────────
router.post("/cashfree/verify", async (req, res): Promise<void> => {
  const { orderId } = req.body;
  if (!orderId) { res.status(400).json({ error: "orderId is required" }); return; }

  // Find the pending payment record
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.gatewayOrderId, orderId)).limit(1);
  if (!payment) { res.status(404).json({ error: "Payment record not found" }); return; }
  if (payment.status === "completed") {
    // Payment was already processed (by webhook or previous verify call) — show success.
    // SECURITY: only set the auto-login cookie when the payment was tagged
    // `allowAutoLogin` at create-order time (logged-in customer OR brand-new
    // email). Guests using an existing user's email get the success page but
    // never the cookie — see /cashfree/create-order for full rationale.
    if (payment.allowAutoLogin && payment.userId) {
      const [authedUser] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);
      if (authedUser) {
        const tk = signToken({ userId: authedUser.id, email: authedUser.email, role: authedUser.role });
        res.cookie("token", tk, authCookieOptions());
      }
    }
    if (payment.bundleId && !payment.courseId) {
      const [bundle] = await db.select().from(bundlesTable).where(eq(bundlesTable.id, payment.bundleId)).limit(1);
      const bundleCourses = await db.select({ courseId: bundleCoursesTable.courseId }).from(bundleCoursesTable).where(eq(bundleCoursesTable.bundleId, payment.bundleId));
      res.json({ success: true, enrolled: true, bundleId: payment.bundleId, bundleName: bundle?.name, courseCount: bundleCourses.length, amount: parseFloat(String(payment.amount)), currency: "INR" });
    } else {
      const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
      res.json({ success: true, enrolled: true, courseId: payment.courseId, courseTitle: course?.title, amount: parseFloat(String(payment.amount)), currency: "INR" });
    }
    return;
  }

  // Get Cashfree gateway config
  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, "cashfree")).limit(1);
  if (!gw) { res.status(400).json({ error: "Cashfree not configured" }); return; }

  // Verify with Cashfree API
  const host = gw.isTestMode ? "https://sandbox.cashfree.com" : "https://api.cashfree.com";
  try {
    const r = await gatewayFetch(`${host}/pg/orders/${orderId}`, {
      headers: { "x-api-version": "2023-08-01", "x-client-id": gw.apiKey, "x-client-secret": gw.secretKey },
    });
    const order = await r.json();

    const status: string = order.order_status ?? "";
    if (status === "PAID") {
      // Materialise the user account NOW (deferred until payment success).
      // After this returns, `userId` is guaranteed non-null and bound to the payment.
      const { userId: resolvedUserId, isNewUser } = await ensureUserForPayment(payment);
      payment.userId = resolvedUserId;

      // SECURITY: only set the auto-login cookie when the payment was tagged
      // `allowAutoLogin` at create-order time. Guests who paid using an
      // existing user's email get the course but never the cookie.
      if (payment.allowAutoLogin) {
        const [authedUser] = await db.select().from(usersTable).where(eq(usersTable.id, resolvedUserId)).limit(1);
        if (authedUser) {
          const tk = signToken({ userId: authedUser.id, email: authedUser.email, role: authedUser.role });
          res.cookie("token", tk, authCookieOptions());
        }
      }
      void isNewUser; // (frontend already has tempPassword from create-order time)

      // Fetch the actual Cashfree transaction ID (cf_payment_id) from the payments list
      let cfTxnId: string = order.cf_order_id ? String(order.cf_order_id) : `cf_${nanoid(12)}`;
      try {
        const pr = await gatewayFetch(`${host}/pg/orders/${orderId}/payments`, {
          headers: { "x-api-version": "2023-08-01", "x-client-id": gw.apiKey, "x-client-secret": gw.secretKey },
        });
        const pList = await pr.json();
        const successPay = Array.isArray(pList) ? pList.find((p: { payment_status?: string; cf_payment_id?: number | string }) => p.payment_status === "SUCCESS") ?? pList[0] : null;
        if (successPay?.cf_payment_id) cfTxnId = String(successPay.cf_payment_id);
      } catch { /* fallback to cf_order_id already set */ }
      await db.update(paymentsTable).set({ status: "completed", paymentId: cfTxnId }).where(eq(paymentsTable.id, payment.id));
      generateGstInvoice(payment.id).catch(() => {});

      // Bundle payment
      if (payment.bundleId && !payment.courseId) {
        const [bundle] = await db.select().from(bundlesTable).where(eq(bundlesTable.id, payment.bundleId)).limit(1);
        const bundleCourses = await db.select({ courseId: bundleCoursesTable.courseId }).from(bundleCoursesTable).where(eq(bundleCoursesTable.bundleId, payment.bundleId));
        for (const { courseId } of bundleCourses) {
          if (!courseId) continue;
          const [ex] = await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, payment.userId), eq(enrollmentsTable.courseId, courseId))).limit(1);
          if (!ex) await db.insert(enrollmentsTable).values({ userId: payment.userId, courseId });
        }
        await db.insert(notificationsTable).values({ userId: payment.userId, title: "Package Enrolled! 🎉", message: `You now have access to all courses in "${bundle?.name ?? "the package"}".`, type: "success" });
        triggerFunnel("new_purchase", payment.userId, { course_name: bundle?.name ?? "", amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
        if (payment.couponCode) {
          const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, payment.couponCode)).limit(1);
          if (coupon) await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
        }
        await recordAffiliateCommission(payment.affiliateRef, payment.userId, null, parseFloat(String(payment.amount)));
        res.json({ success: true, enrolled: true, bundleId: payment.bundleId, bundleName: bundle?.name, courseCount: bundleCourses.length, amount: parseFloat(String(payment.amount)), currency: "INR" });
        return;
      }

      // Single course payment
      const [existing] = await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, payment.userId), eq(enrollmentsTable.courseId, payment.courseId))).limit(1);
      if (!existing) {
        await db.insert(enrollmentsTable).values({ userId: payment.userId, courseId: payment.courseId });
        const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
        await db.insert(notificationsTable).values({ userId: payment.userId, title: "Enrollment Confirmed!", message: `You are now enrolled in ${course?.title ?? "the course"}`, type: "success" });
        if (payment.couponCode) {
          const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, payment.couponCode)).limit(1);
          if (coupon) await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
        }
        const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);
        if (buyer && course) {
          triggerAutomation("purchase", buyer.id, buyer.email, { name: buyer.name, email: buyer.email, course_name: course.title, amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
          triggerFunnel("new_purchase", buyer.id, { course_name: course.title, amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
        }
        await recordAffiliateCommission(payment.affiliateRef, payment.userId, payment.courseId, parseFloat(String(payment.amount)));
      }

      const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
      res.json({ success: true, enrolled: true, courseId: payment.courseId, courseTitle: course?.title, amount: parseFloat(String(payment.amount)), currency: "INR" });
    } else if (status === "ACTIVE") {
      res.json({ success: false, pending: true, status, message: "Payment is pending. Please wait." });
    } else {
      await db.update(paymentsTable).set({ status: "failed" }).where(eq(paymentsTable.id, payment.id));
      res.json({ success: false, failed: true, status, message: `Payment ${status}. Please try again.` });
    }
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Cashfree: Webhook ─────────────────────────────────────────────────────────
router.post("/cashfree/webhook", async (req, res): Promise<void> => {
  // SECURITY: signature verification is MANDATORY. Cashfree always sends
  // x-webhook-timestamp + x-webhook-signature on real S2S calls; missing
  // headers or a misconfigured gateway means we cannot trust the payload, so
  // we reject. The previous "if both headers present, verify" pattern let an
  // attacker forge paid events simply by omitting the headers.
  const timestamp = req.headers["x-webhook-timestamp"] as string | undefined;
  const signature = req.headers["x-webhook-signature"] as string | undefined;
  const rawBody = (req as { rawBody?: string }).rawBody ?? "";

  if (!timestamp || !signature) {
    res.status(401).json({ error: "Missing webhook signature headers" });
    return;
  }

  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, "cashfree")).limit(1);
  if (!gw?.secretKey) {
    res.status(503).json({ error: "Cashfree gateway not configured" });
    return;
  }

  const computed = crypto
    .createHmac("sha256", gw.secretKey)
    .update(timestamp + rawBody)
    .digest("base64");
  if (computed !== signature) {
    console.warn("[cashfree webhook] signature mismatch");
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  // 2. Process event
  const event = req.body;

  // Support both v2023-08-01 and v2025-01-01 formats
  const orderId: string | undefined =
    event?.data?.order?.order_id ??   // v2025-01-01
    event?.data?.order?.orderId;       // fallback

  const orderStatus: string | undefined =
    event?.data?.order?.order_status ??
    event?.data?.payment?.payment_status;

  const isPaid = orderStatus === "PAID" || event?.type === "PAYMENT_SUCCESS_WEBHOOK";

  if (!orderId || !isPaid) { res.json({ received: true }); return; }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.gatewayOrderId, orderId)).limit(1);
  if (!payment || payment.status === "completed") { res.json({ received: true }); return; }

  // Materialise the user account NOW (deferred until payment success).
  // After this returns, payment.userId is guaranteed non-null.
  try {
    const { userId: resolvedUserId } = await ensureUserForPayment(payment);
    payment.userId = resolvedUserId;
  } catch (err) {
    console.error("[cashfree webhook] ensureUserForPayment failed:", err);
    res.json({ received: true });
    return;
  }

  const cfPaymentId: string = event?.data?.payment?.cf_payment_id
    ? String(event.data.payment.cf_payment_id)
    : `cf_wh_${nanoid(10)}`;

  await db.update(paymentsTable).set({ status: "completed", paymentId: cfPaymentId }).where(eq(paymentsTable.id, payment.id));
  generateGstInvoice(payment.id).catch(() => {});

  if (payment.bundleId && !payment.courseId) {
    const [bundle] = await db.select().from(bundlesTable).where(eq(bundlesTable.id, payment.bundleId)).limit(1);
    const bundleCourses = await db.select({ courseId: bundleCoursesTable.courseId }).from(bundleCoursesTable).where(eq(bundleCoursesTable.bundleId, payment.bundleId));
    for (const { courseId } of bundleCourses) {
      if (!courseId) continue;
      const [ex] = await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, payment.userId), eq(enrollmentsTable.courseId, courseId))).limit(1);
      if (!ex) await db.insert(enrollmentsTable).values({ userId: payment.userId, courseId });
    }
    await db.insert(notificationsTable).values({ userId: payment.userId, title: "Package Enrolled! 🎉", message: `You now have access to all courses in "${bundle?.name ?? "the package"}".`, type: "success" });
    triggerFunnel("new_purchase", payment.userId, { course_name: bundle?.name ?? "", amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
    if (payment.couponCode) {
      const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, payment.couponCode)).limit(1);
      if (coupon) await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
    }
    await recordAffiliateCommission(payment.affiliateRef, payment.userId, null, parseFloat(String(payment.amount)));
  } else {
    const [existing] = await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, payment.userId), eq(enrollmentsTable.courseId, payment.courseId))).limit(1);
    if (!existing) {
      await db.insert(enrollmentsTable).values({ userId: payment.userId, courseId: payment.courseId });
      const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
      await db.insert(notificationsTable).values({ userId: payment.userId, title: "Enrollment Confirmed!", message: `You are now enrolled in ${course?.title ?? "the course"}`, type: "success" });
      const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);
      if (buyer && course) {
        triggerAutomation("purchase", buyer.id, buyer.email, { name: buyer.name, email: buyer.email, course_name: course.title, amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
        triggerFunnel("new_purchase", buyer.id, { course_name: course.title, amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
      }
      if (payment.couponCode) {
        const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, payment.couponCode)).limit(1);
        if (coupon) await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
      }
      await recordAffiliateCommission(payment.affiliateRef, payment.userId, payment.courseId, parseFloat(String(payment.amount)));
    }
  }
  res.json({ received: true });
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PaytmChecksum = require("paytmchecksum");

// ── Paytm: Create Order + Pre-register User ──────────────────────────────────
router.post("/paytm/create-order", async (req, res): Promise<void> => {
  const { courseId, email, fullName, state, mobile, couponCode, affiliateRef } = req.body;
  if (!courseId || !email || !fullName) {
    res.status(400).json({ error: "courseId, email, and fullName are required" }); return;
  }

  const [gw] = await db.select().from(paymentGatewaysTable).where(
    and(eq(paymentGatewaysTable.name, "paytm"), eq(paymentGatewaysTable.isActive, true))
  ).limit(1);
  if (!gw?.apiKey || !gw?.secretKey) {
    res.status(400).json({ error: "Paytm is not configured or inactive" }); return;
  }

  const mid = gw.apiKey;           // Merchant ID
  const merchantKey = gw.secretKey; // Merchant Key

  // Resolve user — defer creation for brand-new emails until payment success.
  // SECURITY: see /cashfree/create-order for rationale on `wasAlreadyLoggedIn`.
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
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, parseInt(courseId))).limit(1);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  let amount = parseFloat(course.price);
  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon?.isActive && (!coupon.maxUses || coupon.usedCount < coupon.maxUses)) {
      const d = parseFloat(String(coupon.discountValue));
      amount = coupon.discountType === "percentage" ? amount * (1 - d / 100) : Math.max(0, amount - d);
    }
  }

  // Paytm v3 Initiate Transaction API flow (modern, currently supported on production).
  // Step 1: backend posts signed JSON to /theia/api/v1/initiateTransaction → receives txnToken
  // Step 2: frontend posts mid+orderId+txnToken to /theia/api/v1/showPaymentPage → Paytm hosted page
  // IMPORTANT: v3 API is hosted on secure.paytmpayments.com (NEW domain), NOT securegw.paytm.in (legacy /order/process only).
  // Verified from official paytm-pg-node-sdk v1.0.6 source (constants/MerchantProperties.js).
  const orderId = `PT_${nanoid(14)}`;
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
    // SecureRequestHeader per official paytm-pg-node-sdk: must include version, channelId, requestTimestamp, signature
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
    console.log("[paytm create-order] initiate response:", JSON.stringify(data));
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
    console.error("[paytm create-order] initiate error:", err);
    res.status(500).json({ error: (err as Error).message });
    return;
  }

  // Store pending payment
  const sessionId = nanoid(32);
  await db.insert(paymentsTable).values({
    userId, courseId: parseInt(courseId),
    amount: String(amount.toFixed(2)), currency: "INR",
    status: "pending", gateway: "paytm",
    sessionId, gatewayOrderId: orderId,
    couponCode: couponCode || null,
    affiliateRef: affiliateRef || null,
    billingName: fullName?.trim() || null,
    billingEmail: email?.toLowerCase().trim() || null,
    billingMobile: mobile?.trim() || null,
    billingState: state || null,
    pendingPasswordHash,
    // SECURITY: see /cashfree/create-order for rationale.
    allowAutoLogin: wasAlreadyLoggedIn || isNewUser,
  });

  // SECURITY: only refresh the auth cookie for users who were already logged in
  // when they submitted checkout. See /cashfree/create-order for full rationale.
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
    isNewUser,
    tempPassword,
    userId,
    courseId: parseInt(courseId),
    courseTitle: course.title,
  });
});

// ── DIAGNOSTIC: Verify what credentials are saved (admin only, no secrets exposed)
router.get("/paytm/diag-key-fingerprint", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, "paytm")).limit(1);
  if (!gw) { res.status(404).json({ error: "Paytm not configured" }); return; }

  const key = gw.secretKey || "";
  const sha = crypto.createHash("sha256").update(key).digest("hex");
  const bytes = Array.from(key).map(c => c.charCodeAt(0));

  // Test the key against both Paytm staging and production with a minimal valid request
  const testParams = {
    MID: gw.apiKey, ORDER_ID: `DIAG_${Date.now()}`, CUST_ID: "diag",
    INDUSTRY_TYPE_ID: "Retail", CHANNEL_ID: "WEB", TXN_AMOUNT: "1.00",
    WEBSITE: (gw.webhookSecret || "").startsWith("WS:") ? gw.webhookSecret!.slice(3).trim() : "DEFAULT",
    CALLBACK_URL: "https://example.com/cb",
  };
  const cs = await PaytmChecksum.generateSignature(testParams, key);
  const probe = async (url: string) => {
    const r = await gatewayFetch(url, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...testParams, CHECKSUMHASH: cs }).toString(), redirect: "manual",
    });
    const t = await r.text();
    return (t.match(/name='RESPMSG' value='([^']+)'/) || [])[1] || "(none)";
  };

  const stagingParams = { ...testParams, ORDER_ID: `DIAG2_${Date.now()}`, WEBSITE: "WEBSTAGING" };
  const csStg = await PaytmChecksum.generateSignature(stagingParams, key);
  const probeStg = async () => {
    const r = await gatewayFetch("https://securegw-stage.paytm.in/order/process", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...stagingParams, CHECKSUMHASH: csStg }).toString(), redirect: "manual",
    });
    const t = await r.text();
    return (t.match(/name='RESPMSG' value='([^']+)'/) || [])[1] || "(none)";
  };

  // Probe production with multiple common WEBSITE values
  const probeProdWithWebsite = async (website: string) => {
    const p = { ...testParams, ORDER_ID: `DIAG_${website}_${Date.now()}`, WEBSITE: website };
    const c = await PaytmChecksum.generateSignature(p, key);
    const r = await gatewayFetch("https://securegw.paytm.in/order/process", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...p, CHECKSUMHASH: c }).toString(), redirect: "manual",
    });
    const t = await r.text();
    return (t.match(/name='RESPMSG' value='([^']+)'/) || [])[1] || "(none)";
  };

  // Also call the v3 order status API on production — if checksum passes, MID exists on production
  const orderStatusProbe = async (host: string) => {
    const body = { mid: gw.apiKey, orderId: `DIAG_NONEXISTENT_${Date.now()}` };
    const sig = await PaytmChecksum.generateSignature(JSON.stringify(body), key);
    const r = await gatewayFetch(`${host}/v3/order/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, head: { signature: sig } }),
    });
    const j = await r.json().catch(() => ({}));
    return (j as any)?.body?.resultInfo || j;
  };

  // v3 Initiate Transaction API — the modern flow Paytm pushes.
  // Uses the FULL SecureRequestHeader (matching production code + official paytm-pg-node-sdk).
  const initiateTxnProbe = async (host: string, websiteName: string) => {
    const orderId = `DIAG_INIT_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const body = {
      requestType: "Payment",
      mid: gw.apiKey,
      websiteName,
      orderId,
      txnAmount: { value: "1.00", currency: "INR" },
      userInfo: { custId: "diag_user" },
      callbackUrl: "https://example.com/cb",
    };
    const sig = await PaytmChecksum.generateSignature(JSON.stringify(body), key);
    const head = {
      version: "v1",
      channelId: "WEB",
      requestTimestamp: Date.now().toString(),
      signature: sig,
    };
    const url = `${host}/theia/api/v1/initiateTransaction?mid=${gw.apiKey}&orderId=${orderId}`;
    const r = await gatewayFetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, head }),
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ...((j as any)?.body?.resultInfo || j) };
  };

  const [stgMsg, prodDefault, prodWebProd, prodRetail, prodCustom, statusProd, statusStg, initProdDefault, initStgWebStaging, initProdAlt, initNewProdDefault, initNewProdAlt, initNewStgWebstaging] = await Promise.all([
    probeStg(),
    probeProdWithWebsite("DEFAULT"),
    probeProdWithWebsite("WEBPROD"),
    probeProdWithWebsite("Retail"),
    probeProdWithWebsite("vipulkumaracademy"),
    orderStatusProbe("https://securegw.paytm.in"),
    orderStatusProbe("https://securegw-stage.paytm.in"),
    initiateTxnProbe("https://securegw.paytm.in", "DEFAULT"),
    initiateTxnProbe("https://securegw-stage.paytm.in", "WEBSTAGING"),
    initiateTxnProbe("https://securegw.paytm.in", "Default"),
    // NEW: secure.paytmpayments.com — the domain used by official paytm-pg-node-sdk
    initiateTxnProbe("https://secure.paytmpayments.com", "DEFAULT"),
    initiateTxnProbe("https://secure.paytmpayments.com", "Default"),
    initiateTxnProbe("https://securestage.paytmpayments.com", "WEBSTAGING"),
  ]);
  const prodMsg = prodDefault;

  res.json({
    mid: gw.apiKey,
    midLength: gw.apiKey.length,
    keyLength: key.length,
    keySha256First16: sha.slice(0, 16), // identifies the key without revealing it
    keyFirstChar: key.charAt(0),
    keyLastChar: key.slice(-1),
    hasWhitespace: bytes.some(b => b === 32 || b === 9 || b === 10 || b === 13),
    isAllPrintableAscii: bytes.every(b => b >= 32 && b <= 126),
    isTestMode: gw.isTestMode,
    websiteName: (gw.webhookSecret || "").startsWith("WS:") ? gw.webhookSecret!.slice(3).trim() : "DEFAULT",
    diagnosis: {
      productionResp_DEFAULT: prodDefault,
      productionResp_WEBPROD: prodWebProd,
      productionResp_Retail: prodRetail,
      productionResp_vipulkumaracademy: prodCustom,
      stagingResp_WEBSTAGING: stgMsg,
      orderStatus_production: statusProd,
      orderStatus_staging: statusStg,
      initiateTxn_production_DEFAULT: initProdDefault,
      initiateTxn_staging_WEBSTAGING: initStgWebStaging,
      initiateTxn_production_WEBPROD: initProdAlt,
      verdict:
        prodMsg === "Invalid checksum" && stgMsg !== "Invalid checksum"
          ? "❌ Key/MID NOT activated on Paytm production server. Either WEBSITE name is wrong, or merchant account is staging-only. Check 'orderStatus_production' — if it also says 'Invalid Checksum', the MID itself isn't on production."
          : prodMsg !== "Invalid checksum"
            ? "✅ Key is accepted by production — checksum validates correctly."
            : prodMsg === "Invalid checksum" && stgMsg === "Invalid checksum"
              ? "❌ Key is invalid for BOTH environments. Wrong key entirely."
              : `Production says: ${prodMsg}`,
    },
    updatedAt: gw.updatedAt,
  });
});

// ── Paytm: Complete payment + enrollment (idempotent helper) ──────────────────
async function completePaytmPayment(payment: typeof paymentsTable.$inferSelect, txnId: string): Promise<void> {
  // Materialise the user account NOW (deferred until payment success).
  // After this returns, payment.userId is guaranteed non-null and bound to row.
  const { userId: resolvedUserId } = await ensureUserForPayment(payment);
  payment.userId = resolvedUserId;

  await db.update(paymentsTable).set({ status: "completed", paymentId: txnId }).where(eq(paymentsTable.id, payment.id));
  generateGstInvoice(payment.id).catch(() => {});

  // Bundle payment
  if (payment.bundleId && !payment.courseId) {
    const [bundle] = await db.select().from(bundlesTable).where(eq(bundlesTable.id, payment.bundleId)).limit(1);
    const bundleCourses = await db.select({ courseId: bundleCoursesTable.courseId }).from(bundleCoursesTable).where(eq(bundleCoursesTable.bundleId, payment.bundleId));
    for (const { courseId } of bundleCourses) {
      if (!courseId) continue;
      const [ex] = await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, payment.userId), eq(enrollmentsTable.courseId, courseId))).limit(1);
      if (!ex) await db.insert(enrollmentsTable).values({ userId: payment.userId, courseId });
    }
    await db.insert(notificationsTable).values({ userId: payment.userId, title: "Package Enrolled! 🎉", message: `You now have access to all courses in "${bundle?.name ?? "the package"}".`, type: "success" });
    triggerFunnel("new_purchase", payment.userId, { course_name: bundle?.name ?? "", amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
    if (payment.couponCode) {
      const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, payment.couponCode)).limit(1);
      if (coupon) await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
    }
    await recordAffiliateCommission(payment.affiliateRef, payment.userId, null, parseFloat(String(payment.amount)));
    return;
  }

  // Single course payment
  const [existing] = await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, payment.userId), eq(enrollmentsTable.courseId, payment.courseId))).limit(1);
  if (!existing) {
    await db.insert(enrollmentsTable).values({ userId: payment.userId, courseId: payment.courseId });
    const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
    await db.insert(notificationsTable).values({ userId: payment.userId, title: "Enrollment Confirmed!", message: `You are now enrolled in ${course?.title ?? "the course"}`, type: "success" });
    if (payment.couponCode) {
      const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, payment.couponCode)).limit(1);
      if (coupon) await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
    }
    const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);
    if (buyer && course) {
      triggerAutomation("purchase", buyer.id, buyer.email, { name: buyer.name, email: buyer.email, course_name: course.title, amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
      triggerFunnel("new_purchase", buyer.id, { course_name: course.title, amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
    }
    await recordAffiliateCommission(payment.affiliateRef, payment.userId, payment.courseId, parseFloat(String(payment.amount)));
  }
}

// ── Paytm: Verify Payment status (called by frontend after redirect) ──────────
router.post("/paytm/verify", async (req, res): Promise<void> => {
  const { orderId } = req.body;
  if (!orderId) { res.status(400).json({ error: "orderId is required" }); return; }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.gatewayOrderId, orderId)).limit(1);
  if (!payment) { res.status(404).json({ error: "Payment record not found" }); return; }

  // If already marked complete by callback / webhook, return success immediately.
  // SECURITY: only set the auto-login cookie when the payment was tagged
  // `allowAutoLogin` at create-order time. Guests who paid using an existing
  // user's email get the success response but never the cookie — see
  // /cashfree/create-order for full rationale.
  if (payment.status === "completed") {
    if (payment.allowAutoLogin && payment.userId) {
      const [authedUser] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);
      if (authedUser) {
        const tk = signToken({ userId: authedUser.id, email: authedUser.email, role: authedUser.role });
        res.cookie("token", tk, authCookieOptions());
      }
    }
    if (payment.bundleId && !payment.courseId) {
      const [bundle] = await db.select().from(bundlesTable).where(eq(bundlesTable.id, payment.bundleId)).limit(1);
      const bundleCourses = await db.select({ courseId: bundleCoursesTable.courseId }).from(bundleCoursesTable).where(eq(bundleCoursesTable.bundleId, payment.bundleId));
      res.json({ success: true, enrolled: true, bundleId: payment.bundleId, bundleName: bundle?.name, courseCount: bundleCourses.length, amount: parseFloat(String(payment.amount)), currency: "INR" });
      return;
    }
    const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
    res.json({ success: true, enrolled: true, courseId: payment.courseId, courseTitle: course?.title, amount: parseFloat(String(payment.amount)), currency: "INR" });
    return;
  }

  if (payment.status === "failed") {
    res.json({ success: false, failed: true, message: "Payment failed. Please try again." });
    return;
  }

  // Pending — Paytm callback may not have arrived yet OR it failed checksum verification.
  // Fall back to the server-to-server status check API.
  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, "paytm")).limit(1);
  if (!gw) { res.status(400).json({ error: "Paytm not configured" }); return; }

  const mid = gw.apiKey;
  const merchantKey = gw.secretKey;
  const host = gw.isTestMode ? "https://securestage.paytmpayments.com" : "https://secure.paytmpayments.com";

  const statusBody = { mid, orderId };
  const statusSignature = await PaytmChecksum.generateSignature(JSON.stringify(statusBody), merchantKey);

  try {
    const r = await gatewayFetch(`${host}/v3/order/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        head: {
          version: "v1",
          channelId: "WEB",
          requestTimestamp: Date.now().toString(),
          signature: statusSignature,
        },
        body: statusBody,
      }),
    });
    const result = await r.json();
    const resultStatus: string = result.body?.resultInfo?.resultStatus ?? result.body?.status ?? "";

    if (resultStatus === "TXN_SUCCESS") {
      const txnId: string = result.body?.txnId ?? `ptm_${nanoid(12)}`;
      await completePaytmPayment(payment, txnId);
      // payment.userId is guaranteed non-null after completePaytmPayment().
      // SECURITY: only set the auto-login cookie when allowAutoLogin is true.
      // See /cashfree/create-order for full rationale.
      if (payment.allowAutoLogin && payment.userId) {
        const [authedUser] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);
        if (authedUser) {
          const tk = signToken({ userId: authedUser.id, email: authedUser.email, role: authedUser.role });
          res.cookie("token", tk, authCookieOptions());
        }
      }
      if (payment.bundleId && !payment.courseId) {
        const [bundle] = await db.select().from(bundlesTable).where(eq(bundlesTable.id, payment.bundleId)).limit(1);
        const bundleCourses = await db.select({ courseId: bundleCoursesTable.courseId }).from(bundleCoursesTable).where(eq(bundleCoursesTable.bundleId, payment.bundleId));
        res.json({ success: true, enrolled: true, bundleId: payment.bundleId, bundleName: bundle?.name, courseCount: bundleCourses.length, amount: parseFloat(String(payment.amount)), currency: "INR" });
        return;
      }
      const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
      res.json({ success: true, enrolled: true, courseId: payment.courseId, courseTitle: course?.title, amount: parseFloat(String(payment.amount)), currency: "INR" });
    } else if (resultStatus === "PENDING") {
      res.json({ success: false, pending: true, status: resultStatus, message: "Payment is pending. Please wait a moment and try again." });
    } else {
      await db.update(paymentsTable).set({ status: "failed" }).where(eq(paymentsTable.id, payment.id));
      res.json({ success: false, failed: true, status: resultStatus, message: `Payment ${resultStatus || "failed"}. Please try again.` });
    }
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Paytm: Callback (Paytm POSTs back here after payment on hosted page) ─────
// Verifies CHECKSUMHASH, marks payment complete + enrolls user, then redirects
// the browser to the frontend verify page.
router.post("/paytm/callback", async (req, res): Promise<void> => {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    params[k] = String(v ?? "");
  }
  const receivedChecksum = params.CHECKSUMHASH || "";
  delete params.CHECKSUMHASH;

  const orderId = params.ORDERID || "";
  const status = params.STATUS || "";
  const txnId = params.TXNID || `ptm_${nanoid(10)}`;
  const respMsg = params.RESPMSG || "";

  const forwardedProto = req.get("x-forwarded-proto") || req.protocol;
  const origin = `${forwardedProto}://${req.get("host")}`;
  const redirectTo = `${origin}/payment/verify?gateway=paytm&order_id=${encodeURIComponent(orderId)}`;

  console.log("[paytm callback] orderId:", orderId, "status:", status, "txnId:", txnId, "respMsg:", respMsg);

  try {
    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.gatewayOrderId, orderId)).limit(1);
    const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, "paytm")).limit(1);

    if (!payment || !gw) {
      console.warn("[paytm callback] payment or gateway missing — redirecting anyway");
      res.redirect(303, redirectTo); return;
    }

    const isVerified: boolean = receivedChecksum
      ? PaytmChecksum.verifySignature(params, gw.secretKey, receivedChecksum)
      : false;
    console.log("[paytm callback] checksum verified:", isVerified);

    if (isVerified && status === "TXN_SUCCESS" && payment.status !== "completed") {
      await completePaytmPayment(payment, txnId);
      // SECURITY: only set the auto-login cookie when allowAutoLogin is true.
      // payment.userId is guaranteed non-null after completePaytmPayment().
      if (payment.allowAutoLogin) {
        const [authedUser] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId!)).limit(1);
        if (authedUser) {
          const tk = signToken({ userId: authedUser.id, email: authedUser.email, role: authedUser.role });
          res.cookie("token", tk, authCookieOptions());
        }
      }
    } else if (isVerified && status !== "TXN_SUCCESS" && payment.status === "pending") {
      await db.update(paymentsTable).set({ status: "failed" }).where(eq(paymentsTable.id, payment.id));
    }
  } catch (err) {
    console.error("[paytm callback] error:", err);
  }

  // 303 ensures the browser switches POST → GET when redirecting
  res.redirect(303, redirectTo);
});

// ── Paytm: Webhook (server-to-server payment notification) ────────────────────
// SECURITY: Paytm S2S webhooks include CHECKSUMHASH signed with the merchant
// secret key. Without verification ANY caller could POST {ORDERID, STATUS:
// "TXN_SUCCESS"} and complete a pending payment for free. We compute and
// compare the signature exactly like the /paytm/callback handler before any
// state change.
router.post("/paytm/webhook", async (req, res): Promise<void> => {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    params[k] = String(v ?? "");
  }
  const receivedChecksum = params.CHECKSUMHASH || "";
  delete params.CHECKSUMHASH;

  const orderId = params.ORDERID || "";
  const txnStatus = params.STATUS || "";

  if (!orderId) { res.status(400).json({ error: "ORDERID required" }); return; }

  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, "paytm")).limit(1);
  if (!gw) { res.status(503).json({ error: "Paytm gateway not configured" }); return; }

  const isVerified: boolean = receivedChecksum
    ? PaytmChecksum.verifySignature(params, gw.secretKey, receivedChecksum)
    : false;
  if (!isVerified) {
    console.warn("[paytm webhook] signature verification FAILED for orderId:", orderId);
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  if (txnStatus !== "TXN_SUCCESS") { res.json({ received: true }); return; }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.gatewayOrderId, orderId)).limit(1);
  if (!payment || payment.status === "completed") { res.json({ received: true }); return; }

  const txnId: string = params.TXNID || `ptm_wh_${nanoid(10)}`;
  // Delegate to the shared completion helper so user materialisation, enrollment,
  // notification, automation, funnel and affiliate-commission logic stay in sync
  // with the callback / verify paths and avoid the prior null-userId hazard.
  try {
    await completePaytmPayment(payment, txnId);
  } catch (err) {
    console.error("[paytm webhook] completePaytmPayment failed:", err);
  }
  res.json({ received: true });
});

// ── Public: Active Gateways for Checkout ─────────────────────────────────────
router.get("/gateways/active", async (req, res): Promise<void> => {
  const gateways = await db.select({
    id: paymentGatewaysTable.id,
    name: paymentGatewaysTable.name,
    displayName: paymentGatewaysTable.displayName,
    apiKey: paymentGatewaysTable.apiKey,
    isTestMode: paymentGatewaysTable.isTestMode,
  }).from(paymentGatewaysTable).where(eq(paymentGatewaysTable.isActive, true));
  res.json(gateways);
});

// ── Initiate Real Payment ─────────────────────────────────────────────────────
router.post("/initiate", async (req, res): Promise<void> => {
  const { courseId, gateway: gatewayName, couponCode, amount: reqAmount } = req.body;
  if (!courseId || !gatewayName) { res.status(400).json({ error: "courseId and gateway required" }); return; }

  const [gw] = await db.select().from(paymentGatewaysTable).where(
    and(eq(paymentGatewaysTable.name, gatewayName), eq(paymentGatewaysTable.isActive, true))
  ).limit(1);
  if (!gw) { res.status(400).json({ error: "Gateway not configured or inactive" }); return; }

  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, parseInt(courseId))).limit(1);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  let amount = reqAmount ?? parseFloat(course.price);
  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon?.isActive && (!coupon.maxUses || coupon.usedCount < coupon.maxUses)) {
      const d = parseFloat(String(coupon.discountValue));
      amount = coupon.discountType === "percentage" ? amount * (1 - d / 100) : Math.max(0, amount - d);
    }
  }

  const amountInPaise = Math.round(amount * 100);

  try {
    if (gatewayName === "razorpay") {
      const creds = Buffer.from(`${gw.apiKey}:${gw.secretKey}`).toString("base64");
      const r = await gatewayFetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountInPaise, currency: "INR", receipt: `rcpt_${nanoid(8)}` }),
      });
      const order = await r.json();
      if (!r.ok) throw new Error(order.error?.description ?? "Razorpay order failed");
      res.json({ gateway: "razorpay", orderId: order.id, keyId: gw.apiKey, amount: amountInPaise, currency: "INR", courseName: course.title });

    } else if (gatewayName === "stripe") {
      const body = new URLSearchParams({ amount: String(amountInPaise), currency: "usd", "payment_method_types[]": "card" });
      const r = await gatewayFetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: { Authorization: `Bearer ${gw.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const intent = await r.json();
      if (!r.ok) throw new Error(intent.error?.message ?? "Stripe PaymentIntent failed");
      res.json({ gateway: "stripe", clientSecret: intent.client_secret, publishableKey: gw.apiKey, amount: amountInPaise, currency: "usd", courseName: course.title });

    } else if (gatewayName === "cashfree") {
      const host = gw.isTestMode ? "https://sandbox.cashfree.com" : "https://api.cashfree.com";
      const r = await gatewayFetch(`${host}/pg/orders`, {
        method: "POST",
        headers: { "x-api-version": "2023-08-01", "x-client-id": gw.apiKey, "x-client-secret": gw.secretKey, "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: `ord_${nanoid(12)}`, order_amount: amount, order_currency: "INR", customer_details: { customer_id: "cust_01", customer_email: "buyer@example.com", customer_phone: "9999999999" } }),
      });
      const order = await r.json();
      if (!r.ok) throw new Error(order.message ?? "Cashfree order failed");
      res.json({ gateway: "cashfree", paymentSessionId: order.payment_session_id, orderId: order.order_id, amount, currency: "INR", appId: gw.apiKey, isTestMode: gw.isTestMode });

    } else if (gatewayName === "payu" || gatewayName === "paytm") {
      res.json({ gateway: gatewayName, amount, note: "Redirect gateway — use hosted checkout", keyId: gw.apiKey });
    } else {
      res.status(400).json({ error: "Unsupported gateway" });
    }
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Stripe: Create Order ──────────────────────────────────────────────────────
router.post("/stripe/create-order", async (req, res): Promise<void> => {
  const { courseId, email, fullName, state, mobile, couponCode, affiliateRef } = req.body;
  if (!courseId || !email || !fullName) {
    res.status(400).json({ error: "courseId, email, and fullName are required" }); return;
  }

  const [gw] = await db.select().from(paymentGatewaysTable).where(
    and(eq(paymentGatewaysTable.name, "stripe"), eq(paymentGatewaysTable.isActive, true))
  ).limit(1);
  if (!gw) { res.status(400).json({ error: "Stripe is not configured or inactive" }); return; }

  // Resolve user — defer creation for brand-new emails until payment success.
  // SECURITY: see /cashfree/create-order for rationale on `wasAlreadyLoggedIn`.
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
    const [existingUser] = await db.select().from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      tempPassword = nanoid(10);
      pendingPasswordHash = await bcrypt.hash(tempPassword, 10);
      isNewUser = true;
    }
  }

  const [course] = await db.select().from(coursesTable)
    .where(eq(coursesTable.id, parseInt(courseId))).limit(1);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  let amount = parseFloat(course.price);
  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable)
      .where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
    if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date()) &&
        (!coupon.maxUses || coupon.usedCount < coupon.maxUses)) {
      if (!coupon.courseId || coupon.courseId === parseInt(courseId)) {
        const discount = parseFloat(String(coupon.discountValue));
        amount = coupon.discountType === "percentage"
          ? amount * (1 - discount / 100)
          : Math.max(0, amount - discount);
      }
    }
  }

  const amountInPaise = Math.round(amount * 100);

  try {
    const body = new URLSearchParams({
      amount: String(amountInPaise),
      currency: "inr",
      "payment_method_types[]": "card",
      description: course.title,
      "metadata[course_id]": String(course.id),
      "metadata[course_title]": course.title,
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
      userId, courseId: parseInt(courseId),
      amount: String(amount.toFixed(2)), currency: "INR",
      status: "pending", gateway: "stripe",
      sessionId, paymentId: intent.id,
      couponCode: couponCode || null, affiliateRef: affiliateRef || null,
      billingName: fullName?.trim() || null, billingEmail: email?.toLowerCase().trim() || null,
      billingMobile: mobile?.trim() || null, billingState: state || null,
      pendingPasswordHash,
      // SECURITY: see /cashfree/create-order for rationale.
      allowAutoLogin: wasAlreadyLoggedIn || isNewUser,
    });

    // SECURITY: only refresh the auth cookie for users who were already logged
    // in when they submitted checkout. See /cashfree/create-order for full
    // rationale. Guests get a display-only `safeUser` synthesised from the form
    // — never the existing user's DB row — to avoid leaking name/role.
    let safeUser: { name: string; email: string };
    if (wasAlreadyLoggedIn && userId) {
      const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (freshUser) {
        const token = signToken({ userId: freshUser.id, email: freshUser.email, role: freshUser.role });
        res.cookie("token", token, authCookieOptions());
        safeUser = { name: freshUser.name, email: freshUser.email };
      } else {
        safeUser = { name: fullName.trim(), email: email.toLowerCase().trim() };
      }
    } else {
      // Guest (incl. existing-email-by-guest): synthesise from form data.
      safeUser = { name: fullName.trim(), email: email.toLowerCase().trim() };
    }

    res.json({
      clientSecret: intent.client_secret, publishableKey: gw.apiKey,
      sessionId, paymentIntentId: intent.id, amount,
      isNewUser, tempPassword, user: safeUser,
      courseTitle: course.title, courseId: parseInt(courseId),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Stripe: Verify Payment ────────────────────────────────────────────────────
router.post("/stripe/verify", async (req, res): Promise<void> => {
  const { paymentIntentId, sessionId } = req.body;
  if (!paymentIntentId || !sessionId) {
    res.status(400).json({ error: "paymentIntentId and sessionId are required" }); return;
  }

  const [payment] = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.sessionId, sessionId)).limit(1);
  if (!payment) { res.status(404).json({ error: "Payment session not found" }); return; }

  const [gw] = await db.select().from(paymentGatewaysTable).where(
    and(eq(paymentGatewaysTable.name, "stripe"), eq(paymentGatewaysTable.isActive, true))
  ).limit(1);
  if (!gw) { res.status(400).json({ error: "Stripe gateway not configured" }); return; }

  // SECURITY: bind paymentIntentId to this session BEFORE asking Stripe to
  // verify it. Without this check an attacker who got hold of any other
  // succeeded payment_intent (their own from a different session, or one
  // observed elsewhere) could replay it to complete this pending session and
  // get a free enrollment. paymentId was set at create-order time to the
  // intent.id we generated, so the only valid value is that one.
  if (!payment.paymentId || payment.paymentId !== paymentIntentId) {
    console.warn("[stripe verify] paymentIntentId mismatch", {
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

  // SECURITY: enforce amount + currency match. Stripe amounts are in the
  // smallest currency unit (paise / cents); our DB stores a decimal string.
  const expectedAmountMinor = Math.round(parseFloat(String(payment.amount)) * 100);
  if (typeof intent.amount !== "number" || intent.amount !== expectedAmountMinor) {
    console.warn("[stripe verify] amount mismatch", {
      sessionId, expected: expectedAmountMinor, received: intent.amount,
    });
    res.status(400).json({ error: "Payment amount mismatch" });
    return;
  }
  if (!intent.currency || intent.currency.toLowerCase() !== String(payment.currency).toLowerCase()) {
    console.warn("[stripe verify] currency mismatch", {
      sessionId, expected: payment.currency, received: intent.currency,
    });
    res.status(400).json({ error: "Payment currency mismatch" });
    return;
  }

  // Materialise the user account NOW (deferred until payment success) and
  // set auto-login cookie. After this returns, payment.userId is non-null.
  const { userId: resolvedUserId } = await ensureUserForPayment(payment);
  payment.userId = resolvedUserId;

  if (payment.status === "completed") {
    const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
    const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, resolvedUserId)).limit(1);
    // SECURITY: only set the auto-login cookie when allowAutoLogin is true.
    // See /cashfree/create-order for full rationale.
    if (payment.allowAutoLogin && freshUser) {
      const tk = signToken({ userId: freshUser.id, email: freshUser.email, role: freshUser.role });
      res.cookie("token", tk, authCookieOptions());
    }
    // Only return DB user fields when auto-login is allowed; otherwise hand back a
    // display-only object so we don't leak the existing user's name/role to a guest.
    const safeUser = (payment.allowAutoLogin && freshUser)
      ? (() => { const { password: _p2, ...rest } = freshUser; return rest; })()
      : { id: null, email: payment.billingEmail ?? "", name: payment.billingName ?? "", role: "student" };
    res.json({ success: true, alreadyEnrolled: true, courseId: payment.courseId, courseTitle: course?.title, user: safeUser });
    return;
  }

  // SECURITY: only set the auto-login cookie when allowAutoLogin is true.
  // See /cashfree/create-order for full rationale.
  if (payment.allowAutoLogin) {
    const [authedUser] = await db.select().from(usersTable).where(eq(usersTable.id, resolvedUserId)).limit(1);
    if (authedUser) {
      const tk = signToken({ userId: authedUser.id, email: authedUser.email, role: authedUser.role });
      res.cookie("token", tk, authCookieOptions());
    }
  }

  await db.update(paymentsTable).set({ status: "completed", paymentId: paymentIntentId })
    .where(eq(paymentsTable.id, payment.id));
  generateGstInvoice(payment.id).catch(() => {});

  const [existing] = await db.select().from(enrollmentsTable)
    .where(and(eq(enrollmentsTable.userId, payment.userId), eq(enrollmentsTable.courseId, payment.courseId)))
    .limit(1);

  if (!existing) {
    await db.insert(enrollmentsTable).values({ userId: payment.userId, courseId: payment.courseId });
    const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
    await db.insert(notificationsTable).values({
      userId: payment.userId, title: "Enrollment Confirmed!",
      message: `You are now enrolled in ${course?.title ?? "the course"}`, type: "success",
    });
    const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);
    if (buyer) {
      triggerAutomation("purchase", buyer.id, buyer.email, {
        name: buyer.name, email: buyer.email,
        course_name: course?.title ?? "",
        amount: String(parseFloat(String(payment.amount)).toFixed(2)),
      }).catch(() => {});
      triggerFunnel("new_purchase", buyer.id, { course_name: course?.title ?? "", amount: String(parseFloat(String(payment.amount)).toFixed(2)) }).catch(() => {});
      await recordAffiliateCommission(payment.affiliateRef, payment.userId, payment.courseId, parseFloat(String(payment.amount)));
    }
  }

  if (payment.couponCode) {
    const [coupon] = await db.select().from(couponsTable)
      .where(eq(couponsTable.code, payment.couponCode)).limit(1);
    if (coupon) await db.update(couponsTable).set({ usedCount: coupon.usedCount + 1 })
      .where(eq(couponsTable.id, coupon.id));
  }

  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
  // SECURITY: only return DB user fields when allowAutoLogin is true; otherwise
  // hand back a display-only object so we don't leak the existing user's
  // name/role to a guest using their email.
  const safeUser = (payment.allowAutoLogin && freshUser)
    ? (() => { const { password: _p3, ...rest } = freshUser; return rest; })()
    : { id: null, email: payment.billingEmail ?? "", name: payment.billingName ?? "", role: "student" };
  res.json({ success: true, courseId: payment.courseId, courseTitle: course?.title, user: safeUser });
});

export default router;
