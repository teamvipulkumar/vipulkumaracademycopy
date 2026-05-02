import { Router } from "express";
import type { Request } from "express";
import { db } from "@workspace/db";
import {
  creatorsTable, creatorCommissionsTable, creatorPayoutsTable,
  coursesTable, paymentsTable, usersTable, bundleCoursesTable, bundlesTable,
  enrollmentsTable, notificationsTable, platformSettingsTable,
} from "@workspace/db";
import { eq, and, or, desc, isNull, sql, inArray, gte, lte } from "drizzle-orm";
import { requireAuth, requireAdmin, requireCreator, requirePermission, type JwtPayload } from "../middlewares/auth";

const router = Router();
type AuthedRequest = Request & { user: JwtPayload };

/* ─────────────────────────────────────────────────────────────────────────
 * Commission engine
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Record a 25%-of-sale creator commission, split equally per course.
 *
 * Inputs:
 *   payment   — the completed payment row (must have id, userId, amount,
 *               and either courseId OR bundleId).
 *   courseIds — every course in the sale. For a single course purchase pass
 *               `[courseId]`; for a bundle pass every bundle course id.
 *
 * Behavior:
 *   • Creator pool   = 25% of payment.amount (fixed per business rule).
 *   • Per-course slice = pool / courseIds.length.
 *   • For each course whose creator_id is set AND that creator is active,
 *     insert one `creator_commissions` row with status='earned'.
 *   • Skips silently for: empty courseIds, no creator_id on a course,
 *     revoked creators, zero-amount sales.
 *   • Idempotent at the (paymentId, courseId) level — calling twice for the
 *     same payment won't double-insert (we check existing rows first).
 *   • All errors caught + logged; never throws (commissions are an audit
 *     log, NOT a hard dependency of enrollment).
 */
export async function recordCreatorCommissions(
  payment: { id: number; userId: number | null; amount: string | number; courseId?: number | null; bundleId?: number | null },
  courseIds: number[],
): Promise<void> {
  try {
    if (!courseIds.length) return;
    if (payment.userId == null) {
      console.info(`[creator commission] skipped — payment ${payment.id} has null userId (deferred guest)`);
      return;
    }
    const saleAmount = parseFloat(String(payment.amount));
    if (!isFinite(saleAmount) || saleAmount <= 0) {
      console.info(`[creator commission] skipped — non-positive sale amount for payment ${payment.id}`);
      return;
    }

    // Idempotence: if any creator_commissions row exists for this paymentId,
    // assume the helper already ran (e.g. webhook + verify both fired). This
    // is the cheapest correct check — we DON'T need to filter by courseId
    // because every code path passes the FULL course list for a payment.
    const [existing] = await db.select({ id: creatorCommissionsTable.id })
      .from(creatorCommissionsTable)
      .where(eq(creatorCommissionsTable.paymentId, payment.id))
      .limit(1);
    if (existing) {
      console.info(`[creator commission] skipped — already recorded for payment ${payment.id}`);
      return;
    }

    const pool = saleAmount * 0.25;
    const perCourseShare = saleAmount / courseIds.length;
    const perCourseCommission = pool / courseIds.length;

    // Pull all course → creator mappings in one query
    const rows = await db.select({
      courseId: coursesTable.id,
      creatorId: coursesTable.creatorId,
    }).from(coursesTable).where(inArray(coursesTable.id, courseIds));

    let insertedCount = 0;
    for (const r of rows) {
      if (r.creatorId == null) continue;
      // Verify creator is active (revoked → skip)
      const [creator] = await db.select({ id: creatorsTable.id, userId: creatorsTable.userId, status: creatorsTable.status })
        .from(creatorsTable).where(eq(creatorsTable.id, r.creatorId)).limit(1);
      if (!creator || creator.status !== "active") {
        console.info(`[creator commission] skip course=${r.courseId} creator=${r.creatorId} (not active)`);
        continue;
      }
      // Race-safe: the existing-row check above is cheap but not atomic against
      // two concurrent webhook+verify completions firing for the same payment.
      // The DB-level unique index on (payment_id, course_id) plus
      // onConflictDoNothing() guarantees we never double-insert for the same pair.
      const inserted = await db.insert(creatorCommissionsTable).values({
        creatorId: creator.id,
        userId: creator.userId,
        paymentId: payment.id,
        courseId: r.courseId,
        bundleId: payment.bundleId ?? null,
        saleAmountShare: perCourseShare.toFixed(2),
        commissionPercent: "25",
        commissionAmount: perCourseCommission.toFixed(2),
        status: "earned",
      }).onConflictDoNothing().returning({ id: creatorCommissionsTable.id });
      if (inserted.length) insertedCount++;
      // Notify the creator (one notification per course; creators with multiple
      // courses in a bundle correctly receive multiple notifications)
      await db.insert(notificationsTable).values({
        userId: creator.userId,
        title: "New Sale! 🎉",
        message: `You earned ₹${perCourseCommission.toFixed(2)} from a course sale.`,
        type: "success",
      }).catch(() => {});
    }
    console.info(`[creator commission] payment=${payment.id} recorded ${insertedCount}/${courseIds.length} rows (pool=₹${pool.toFixed(2)})`);
  } catch (err) {
    console.error("[creator commission] ERROR:", err);
  }
}

/**
 * Mark every "earned" creator commission for a refunded payment as
 * "cancelled". Called from the admin refund handler.
 *
 * Edge case: if a commission was already grouped into a payout (payoutId set)
 * AND that payout is still "pending", we ALSO unlink it from the payout — the
 * payout amount needs to be recomputed (or simply marked cancelled if it's
 * now empty). For payouts already marked "paid", we leave the row alone and
 * log a warning — the admin must manually claw back via a negative
 * adjustment (out of scope here).
 */
export async function cancelCreatorCommissionsForPayment(paymentId: number): Promise<void> {
  try {
    // Find all related commissions
    const rows = await db.select().from(creatorCommissionsTable)
      .where(eq(creatorCommissionsTable.paymentId, paymentId));
    if (!rows.length) return;

    const stillEarnedIds: number[] = [];
    const linkedPayoutIds = new Set<number>();
    const alreadyPaidIds: number[] = [];

    for (const r of rows) {
      if (r.status === "paid") {
        alreadyPaidIds.push(r.id);
        continue;
      }
      if (r.status === "cancelled") continue;
      stillEarnedIds.push(r.id);
      if (r.payoutId != null) linkedPayoutIds.add(r.payoutId);
    }

    if (stillEarnedIds.length) {
      await db.update(creatorCommissionsTable)
        .set({ status: "cancelled", payoutId: null })
        .where(inArray(creatorCommissionsTable.id, stillEarnedIds));
    }

    // Recalc any pending payouts that lost commissions — if a payout has zero
    // remaining commissions, mark it cancelled; otherwise update amount.
    for (const pid of linkedPayoutIds) {
      const [payout] = await db.select().from(creatorPayoutsTable)
        .where(eq(creatorPayoutsTable.id, pid)).limit(1);
      if (!payout || payout.status !== "pending") continue;
      const [{ total }] = await db.select({
        total: sql<string>`COALESCE(SUM(${creatorCommissionsTable.commissionAmount}), 0)::text`,
      }).from(creatorCommissionsTable)
        .where(and(eq(creatorCommissionsTable.payoutId, pid), eq(creatorCommissionsTable.status, "earned")));
      const newAmount = parseFloat(total ?? "0");
      if (newAmount <= 0) {
        await db.update(creatorPayoutsTable).set({ status: "cancelled", failureReason: "All commissions refunded" })
          .where(eq(creatorPayoutsTable.id, pid));
      } else {
        await db.update(creatorPayoutsTable).set({ amount: newAmount.toFixed(2) })
          .where(eq(creatorPayoutsTable.id, pid));
      }
    }

    if (alreadyPaidIds.length) {
      console.warn(`[creator commission] refund of payment ${paymentId} touches ${alreadyPaidIds.length} ALREADY-PAID commission rows — admin must manually claw back.`);
    }
    console.info(`[creator commission] payment ${paymentId} refunded → cancelled ${stillEarnedIds.length} rows`);
  } catch (err) {
    console.error("[creator commission cancel] ERROR:", err);
  }
}

/**
 * Group all eligible "earned" + unbatched commissions into payout rows
 * (one per creator). Used by both the Saturday auto-cycle AND admin
 * manual release.
 *
 *   opts.creatorId        — release only this creator (default: all active creators)
 *   opts.releasedByUserId — admin user id who triggered the release
 *   opts.releasedBySystem — true for the Saturday auto-cycle
 *
 * Returns the list of newly-created payout ids.
 */
export async function releaseCreatorPayoutsBatch(opts: {
  creatorId?: number;
  releasedByUserId?: number | null;
  releasedBySystem?: boolean;
} = {}): Promise<number[]> {
  const created: number[] = [];

  // First, find which creators currently have any candidate rows. We do this
  // in an unlocked read (cheap discovery scan); the actual claim happens
  // per-creator inside a transaction with row-level locks below, so a creator
  // appearing here doesn't guarantee we'll create a payout for them — a
  // concurrent runner may have just locked everything.
  const candidateCreators = await db.selectDistinct({
    creatorId: creatorCommissionsTable.creatorId,
    userId: creatorCommissionsTable.userId,
  })
    .from(creatorCommissionsTable)
    .where(and(
      eq(creatorCommissionsTable.status, "earned"),
      isNull(creatorCommissionsTable.payoutId),
      opts.creatorId ? eq(creatorCommissionsTable.creatorId, opts.creatorId) : undefined,
    ));

  for (const g of candidateCreators) {
    // Confirm creator is still active (cheap pre-check; the FOR UPDATE inside
    // the txn re-locks the actual commission rows that matter).
    const [creator] = await db.select({ status: creatorsTable.status, name: creatorsTable.name })
      .from(creatorsTable).where(eq(creatorsTable.id, g.creatorId)).limit(1);
    if (!creator || creator.status !== "active") {
      console.info(`[creator payout release] skip creator=${g.creatorId} (not active)`);
      continue;
    }

    // ─── Per-creator atomic claim ──────────────────────────────────────────
    // Wrap the (lock → sum → insert payout → link rows) sequence in a single
    // transaction with FOR UPDATE SKIP LOCKED on the candidate commission
    // rows. Two concurrent runners (admin manual release + Saturday cycle, or
    // two admins clicking Release at the same instant) cannot both grab the
    // same rows — the second one's SKIP LOCKED returns an empty set and we
    // simply produce no payout for that creator on this run. This eliminates
    // the prior race that could leave an orphaned payout row with a real
    // amount but zero linked commissions.
    const payoutId = await db.transaction(async (tx) => {
      const lockedRows = await tx.select({
        id: creatorCommissionsTable.id,
        commissionAmount: creatorCommissionsTable.commissionAmount,
      })
        .from(creatorCommissionsTable)
        .where(and(
          eq(creatorCommissionsTable.creatorId, g.creatorId),
          eq(creatorCommissionsTable.status, "earned"),
          isNull(creatorCommissionsTable.payoutId),
        ))
        .for("update", { skipLocked: true });

      if (lockedRows.length === 0) return null;

      const total = lockedRows.reduce((s, r) => s + parseFloat(r.commissionAmount), 0);
      if (!isFinite(total) || total <= 0) return null;

      const [payout] = await tx.insert(creatorPayoutsTable).values({
        creatorId: g.creatorId,
        userId: g.userId,
        amount: total.toFixed(2),
        status: "pending",
        releaseDate: new Date(),
        releasedBy: opts.releasedByUserId ?? null,
        releasedBySystem: !!opts.releasedBySystem,
      }).returning();

      await tx.update(creatorCommissionsTable)
        .set({ payoutId: payout.id })
        .where(inArray(creatorCommissionsTable.id, lockedRows.map(r => r.id)));

      console.info(`[creator payout release] creator=${g.creatorId} amount=₹${total.toFixed(2)} payout_id=${payout.id} rows=${lockedRows.length}`);
      return payout.id;
    });

    if (payoutId == null) {
      console.info(`[creator payout release] skip creator=${g.creatorId} — no rows claimed (concurrent runner won)`);
      continue;
    }

    // Notify creator (outside the txn — notification failure must not roll
    // back a successful payout).
    await db.insert(notificationsTable).values({
      userId: g.userId,
      title: "Payout Released",
      message: `Your payout has been released and is awaiting transfer.`,
      type: "info",
    }).catch(() => {});

    created.push(payoutId);
  }

  return created;
}

/**
 * IST helpers — IST is fixed UTC+5:30 (no DST). We compute "is today
 * Saturday in IST?" and "midnight today IST as a UTC Date" without any
 * external date library.
 */
function istShifted(d: Date): Date {
  return new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
}

function isSaturdayIST(d: Date = new Date()): boolean {
  return istShifted(d).getUTCDay() === 6;
}

function startOfTodayIST(d: Date = new Date()): Date {
  const ist = istShifted(d);
  const midUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 0, 0, 0, 0);
  return new Date(midUtc - (5 * 60 + 30) * 60 * 1000);
}

/**
 * Saturday auto-cycle. Idempotent per IST-day:
 *   1. Quick guard: not Saturday IST → return.
 *   2. Read platform_settings.last_creator_payout_cycle_at; if it's already
 *      ≥ start-of-today-IST, return (some other tick already ran today).
 *   3. Run releaseCreatorPayoutsBatch for ALL active creators.
 *   4. Persist last_creator_payout_cycle_at = now.
 *
 * Safe to call from an hourly setInterval — only the first tick of any
 * given Saturday actually does work.
 */
export async function runCreatorPayoutCycle(): Promise<{ ran: boolean; payoutIds?: number[]; reason?: string }> {
  const now = new Date();
  if (!isSaturdayIST(now)) return { ran: false, reason: "not Saturday IST" };

  const todayIst = startOfTodayIST(now);
  const [settings] = await db.select({ id: platformSettingsTable.id, last: platformSettingsTable.lastCreatorPayoutCycleAt }).from(platformSettingsTable).limit(1);
  if (settings?.last && new Date(settings.last) >= todayIst) {
    return { ran: false, reason: "already ran today" };
  }

  // Race-safe claim: try to atomically advance lastCreatorPayoutCycleAt to `now`
  // ONLY IF it is still < start-of-today IST (or NULL). If two ticks fire within
  // the same hour, only the one whose UPDATE actually changed a row proceeds.
  let claimed = false;
  if (settings === undefined) {
    // Singleton row doesn't exist yet — try to create it with our timestamp. If
    // a concurrent tick wins this insert first, ours becomes a duplicate-key
    // error which we swallow.
    try {
      await db.insert(platformSettingsTable).values({ lastCreatorPayoutCycleAt: now });
      claimed = true;
    } catch {
      claimed = false;
    }
  } else {
    const updated = await db.update(platformSettingsTable)
      .set({ lastCreatorPayoutCycleAt: now })
      .where(and(
        eq(platformSettingsTable.id, settings.id),
        sql`(${platformSettingsTable.lastCreatorPayoutCycleAt} IS NULL OR ${platformSettingsTable.lastCreatorPayoutCycleAt} < ${todayIst})`,
      ))
      .returning({ id: platformSettingsTable.id });
    claimed = updated.length > 0;
  }
  if (!claimed) {
    return { ran: false, reason: "already ran today (lost race)" };
  }

  const payoutIds = await releaseCreatorPayoutsBatch({ releasedBySystem: true });
  console.info(`[creator payout cycle] Saturday IST cycle ran — ${payoutIds.length} payouts created`);
  return { ran: true, payoutIds };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Admin routes — mounted at /api/admin/creators and /api/admin/creator-payouts
 * (registered via routes/index.ts)
 * ───────────────────────────────────────────────────────────────────────── */

export const adminCreatorsRouter: Router = Router();

// GET /api/admin/creators — list all creators (active + revoked)
adminCreatorsRouter.get("/", requirePermission("creators"), async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: creatorsTable.id,
    userId: creatorsTable.userId,
    name: creatorsTable.name,
    email: creatorsTable.email,
    kycStatus: creatorsTable.kycStatus,
    status: creatorsTable.status,
    createdAt: creatorsTable.createdAt,
  }).from(creatorsTable).orderBy(desc(creatorsTable.createdAt));

  // Enrich: course count + lifetime earnings + pending balance per creator
  const enriched = await Promise.all(rows.map(async (c) => {
    const [{ courseCount }] = await db.select({ courseCount: sql<string>`COUNT(*)::text` })
      .from(coursesTable).where(eq(coursesTable.creatorId, c.id));
    const [agg] = await db.select({
      lifetime: sql<string>`COALESCE(SUM(CASE WHEN ${creatorCommissionsTable.status} <> 'cancelled' THEN ${creatorCommissionsTable.commissionAmount} ELSE 0 END), 0)::text`,
      pending: sql<string>`COALESCE(SUM(CASE WHEN ${creatorCommissionsTable.status} = 'earned' THEN ${creatorCommissionsTable.commissionAmount} ELSE 0 END), 0)::text`,
    }).from(creatorCommissionsTable).where(eq(creatorCommissionsTable.creatorId, c.id));
    return {
      ...c,
      notes: null as string | null,
      courseCount: parseInt(courseCount ?? "0", 10),
      totalEarnings: parseFloat(agg?.lifetime ?? "0"),
      pendingAmount: parseFloat(agg?.pending ?? "0"),
    };
  }));
  res.json(enriched);
});

// POST /api/admin/creators — mark an existing user as a creator (by email)
adminCreatorsRouter.post("/", requirePermission("creators"), async (req, res): Promise<void> => {
  const authReq = req as AuthedRequest;
  const { email, notes } = req.body as { email?: string; notes?: string };
  if (!email) { res.status(400).json({ error: "email is required" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);
  if (!user) { res.status(404).json({ error: "No user found with that email. The person must register a normal account first." }); return; }

  // Already a creator? Reactivate if revoked, error if active.
  const [existing] = await db.select().from(creatorsTable).where(eq(creatorsTable.userId, user.id)).limit(1);
  if (existing) {
    if (existing.status === "active") { res.status(400).json({ error: "User is already an active creator" }); return; }
    const [restored] = await db.update(creatorsTable)
      .set({ status: "active", notes: notes ?? existing.notes })
      .where(eq(creatorsTable.id, existing.id))
      .returning();
    res.json({ creator: restored, message: "Creator reactivated" });
    return;
  }

  const [created] = await db.insert(creatorsTable).values({
    userId: user.id,
    name: user.name,
    email: user.email,
    invitedBy: authReq.user.userId,
    notes: notes ?? null,
    status: "active",
    kycStatus: "pending",
  }).returning();

  await db.insert(notificationsTable).values({
    userId: user.id,
    title: "You're now a Creator! 🎓",
    message: "An admin has granted you creator access. Sign in and visit /creator/dashboard to view your sales and complete your KYC + bank details.",
    type: "success",
  }).catch(() => {});

  res.status(201).json({ creator: created, message: "Creator added" });
});

// GET /api/admin/creators/:id — detail with courses, recent commissions, payouts
adminCreatorsRouter.get("/:id", requirePermission("creators"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [creator] = await db.select().from(creatorsTable).where(eq(creatorsTable.id, id)).limit(1);
  if (!creator) { res.status(404).json({ error: "Creator not found" }); return; }

  const coursesRaw = await db.select({
    id: coursesTable.id, title: coursesTable.title, status: coursesTable.status, price: coursesTable.price,
  }).from(coursesTable).where(eq(coursesTable.creatorId, id));

  const courses = await Promise.all(coursesRaw.map(async (co) => {
    const [a] = await db.select({
      sales: sql<string>`COUNT(*) FILTER (WHERE ${creatorCommissionsTable.status} <> 'cancelled')::text`,
      earnings: sql<string>`COALESCE(SUM(CASE WHEN ${creatorCommissionsTable.status} <> 'cancelled' THEN ${creatorCommissionsTable.commissionAmount} ELSE 0 END), 0)::text`,
    }).from(creatorCommissionsTable)
      .where(and(eq(creatorCommissionsTable.creatorId, id), eq(creatorCommissionsTable.courseId, co.id)));
    return {
      ...co,
      price: parseFloat(co.price),
      salesCount: parseInt(a?.sales ?? "0", 10),
      totalEarnings: parseFloat(a?.earnings ?? "0"),
    };
  }));

  const commissionsRaw = await db.select({
    id: creatorCommissionsTable.id,
    courseId: creatorCommissionsTable.courseId,
    courseTitle: coursesTable.title,
    bundleId: creatorCommissionsTable.bundleId,
    bundleName: bundlesTable.name,
    saleAmountShare: creatorCommissionsTable.saleAmountShare,
    commissionAmount: creatorCommissionsTable.commissionAmount,
    commissionPercent: creatorCommissionsTable.commissionPercent,
    status: creatorCommissionsTable.status,
    createdAt: creatorCommissionsTable.createdAt,
  })
    .from(creatorCommissionsTable)
    .leftJoin(coursesTable, eq(creatorCommissionsTable.courseId, coursesTable.id))
    .leftJoin(bundlesTable, eq(creatorCommissionsTable.bundleId, bundlesTable.id))
    .where(eq(creatorCommissionsTable.creatorId, id))
    .orderBy(desc(creatorCommissionsTable.createdAt))
    .limit(50);

  const payouts = await db.select().from(creatorPayoutsTable)
    .where(eq(creatorPayoutsTable.creatorId, id))
    .orderBy(desc(creatorPayoutsTable.createdAt))
    .limit(50);

  res.json({
    creator: {
      ...creator,
      kyc: {
        panName: creator.panName,
        panNumber: creator.panNumber,
        panFrontUrl: creator.panFrontUrl,
        idProofUrl: creator.idProofUrl,
        addressProofUrl: creator.addressProofUrl,
        status: creator.kycStatus,
        adminNote: creator.kycAdminNote,
        reviewedAt: creator.kycReviewedAt,
      },
      bank: {
        accountHolderName: creator.accountHolderName,
        accountNumber: creator.accountNumber,
        ifscCode: creator.ifscCode,
        bankName: creator.bankName,
        upiId: creator.upiId,
      },
    },
    courses,
    commissions: commissionsRaw.map(c => ({
      id: c.id,
      courseTitle: c.courseTitle,
      bundleName: c.bundleName,
      saleAmount: parseFloat(c.saleAmountShare),
      commissionAmount: parseFloat(c.commissionAmount),
      status: c.status,
      createdAt: c.createdAt,
    })),
    payouts: payouts.map(p => ({ ...p, amount: parseFloat(p.amount) })),
  });
});

// PATCH /api/admin/creators/:id — update notes / revoke
adminCreatorsRouter.patch("/:id", requirePermission("creators"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { notes, status, kycStatus, kycAdminNote } = req.body as {
    notes?: string; status?: "active" | "revoked"; kycStatus?: "pending" | "approved" | "rejected"; kycAdminNote?: string;
  };
  // Load current row so we can compute the FINAL state (status+note) the
  // request would leave the creator in. The note-required invariant must
  // hold against that final state — not just against fields named in this
  // request — otherwise an admin could first reject with a valid note,
  // then PATCH only `kycAdminNote: ""` (no kycStatus) and silently strip
  // the rejection reason.
  const [current] = await db.select().from(creatorsTable).where(eq(creatorsTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "Creator not found" }); return; }
  const finalKycStatus = kycStatus ?? current.kycStatus;
  const finalKycNote = (kycAdminNote !== undefined ? kycAdminNote : current.kycAdminNote ?? "").toString().trim();
  if (finalKycStatus === "rejected" && finalKycNote.length < 5) {
    res.status(400).json({ error: "Rejection reason is required (at least 5 characters) and cannot be cleared while KYC is rejected." });
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {};
  if (notes !== undefined) updates.notes = notes;
  if (status !== undefined) updates.status = status;
  if (kycStatus !== undefined) {
    updates.kycStatus = kycStatus;
    updates.kycReviewedAt = new Date();
  }
  if (kycAdminNote !== undefined) updates.kycAdminNote = kycAdminNote;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [updated] = await db.update(creatorsTable).set(updates).where(eq(creatorsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Creator not found" }); return; }
  res.json({ creator: updated });
});

/* ── Admin: payouts management ─────────────────────────────────────────── */
export const adminCreatorPayoutsRouter: Router = Router();

// GET /api/admin/creator-payouts — list with filters (status, creatorId)
adminCreatorPayoutsRouter.get("/", requirePermission("creators"), async (req, res): Promise<void> => {
  const { status, creatorId } = req.query as { status?: string; creatorId?: string };
  const conds = [] as ReturnType<typeof eq>[];
  if (status && status !== "all") conds.push(eq(creatorPayoutsTable.status, status as "pending" | "paid" | "failed" | "cancelled"));
  if (creatorId) conds.push(eq(creatorPayoutsTable.creatorId, parseInt(creatorId, 10)));

  const rows = await db.select({
    id: creatorPayoutsTable.id,
    creatorId: creatorPayoutsTable.creatorId,
    creatorName: creatorsTable.name,
    creatorEmail: creatorsTable.email,
    amount: creatorPayoutsTable.amount,
    status: creatorPayoutsTable.status,
    releaseDate: creatorPayoutsTable.releaseDate,
    paidAt: creatorPayoutsTable.paidAt,
    paymentMethod: creatorPayoutsTable.paymentMethod,
    paymentReference: creatorPayoutsTable.paymentReference,
    releasedBySystem: creatorPayoutsTable.releasedBySystem,
    createdAt: creatorPayoutsTable.createdAt,
  })
    .from(creatorPayoutsTable)
    .leftJoin(creatorsTable, eq(creatorPayoutsTable.creatorId, creatorsTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(creatorPayoutsTable.createdAt));

  res.json(rows.map(r => ({
    ...r,
    amount: parseFloat(r.amount),
    releasedBy: r.releasedBySystem ? "system" : "admin",
  })));
});

// POST /api/admin/creator-payouts/release — manual release (all creators or one)
adminCreatorPayoutsRouter.post("/release", requirePermission("creators"), async (req, res): Promise<void> => {
  const authReq = req as AuthedRequest;
  const { creatorId } = req.body as { creatorId?: number };
  const ids = await releaseCreatorPayoutsBatch({
    creatorId: creatorId ? parseInt(String(creatorId), 10) : undefined,
    releasedByUserId: authReq.user.userId,
    releasedBySystem: false,
  });
  let totalAmount = 0;
  if (ids.length) {
    const [agg] = await db.select({
      total: sql<string>`COALESCE(SUM(${creatorPayoutsTable.amount}), 0)::text`,
    }).from(creatorPayoutsTable).where(inArray(creatorPayoutsTable.id, ids));
    totalAmount = parseFloat(agg?.total ?? "0");
  }
  res.json({ payoutCount: ids.length, totalAmount, payoutIds: ids });
});

// POST /api/admin/creator-payouts/run-cycle — manually fire the Saturday cycle (testing)
adminCreatorPayoutsRouter.post("/run-cycle", requirePermission("creators"), async (_req, res): Promise<void> => {
  const result = await runCreatorPayoutCycle();
  res.json(result);
});

// PATCH /api/admin/creator-payouts/:id — mark paid (with txn ref) / failed
adminCreatorPayoutsRouter.patch("/:id", requirePermission("creators"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { status, paymentMethod, paymentReference, failureReason, notes } = req.body as {
    status?: "pending" | "paid" | "failed" | "cancelled";
    paymentMethod?: "bank" | "upi" | "manual";
    paymentReference?: string;
    failureReason?: string;
    notes?: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {};
  if (status !== undefined) {
    updates.status = status;
    if (status === "paid") {
      if (!paymentReference?.trim()) { res.status(400).json({ error: "paymentReference is required when marking paid" }); return; }
      updates.paidAt = new Date();
    }
  }
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
  if (paymentReference !== undefined) updates.paymentReference = paymentReference;
  if (failureReason !== undefined) updates.failureReason = failureReason;
  if (notes !== undefined) updates.notes = notes;

  const [updated] = await db.update(creatorPayoutsTable).set(updates).where(eq(creatorPayoutsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Payout not found" }); return; }

  // Cascade commission status: paid → all linked commissions = paid; cancelled/failed → release them
  if (status === "paid") {
    await db.update(creatorCommissionsTable)
      .set({ status: "paid" })
      .where(and(eq(creatorCommissionsTable.payoutId, id), eq(creatorCommissionsTable.status, "earned")));
    await db.insert(notificationsTable).values({
      userId: updated.userId,
      title: "Payout Sent! 💸",
      message: `Your payout of ₹${parseFloat(updated.amount).toFixed(2)} has been transferred. Reference: ${paymentReference}`,
      type: "success",
    }).catch(() => {});
  } else if (status === "cancelled" || status === "failed") {
    // Unlink commissions so they roll into the next batch
    await db.update(creatorCommissionsTable)
      .set({ payoutId: null })
      .where(and(eq(creatorCommissionsTable.payoutId, id), eq(creatorCommissionsTable.status, "earned")));
  }

  res.json({ payout: { ...updated, amount: parseFloat(updated.amount) } });
});

/* ─────────────────────────────────────────────────────────────────────────
 * Creator self-service routes — mounted at /api/creator
 * ───────────────────────────────────────────────────────────────────────── */

// Helper: load the creator row for the JWT user; respond 403 if missing
async function loadCreatorForRequest(req: AuthedRequest, res: Parameters<Parameters<Router["get"]>[1]>[1]) {
  const [creator] = await db.select().from(creatorsTable)
    .where(and(eq(creatorsTable.userId, req.user.userId), eq(creatorsTable.status, "active")))
    .limit(1);
  if (!creator) {
    res.status(403).json({ error: "Forbidden: creator only" });
    return null;
  }
  return creator;
}

// GET /api/creator/me
router.get("/me", requireCreator, async (req, res): Promise<void> => {
  const c = await loadCreatorForRequest(req as AuthedRequest, res);
  if (!c) return;
  res.json({ creator: c });
});

// GET /api/creator/dashboard — totals + recent sales
router.get("/dashboard", requireCreator, async (req, res): Promise<void> => {
  const c = await loadCreatorForRequest(req as AuthedRequest, res);
  if (!c) return;

  // Date boundaries (IST anchor not required — month is calendar-month UTC for simplicity)
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [totals] = await db.select({
    lifetime: sql<string>`COALESCE(SUM(CASE WHEN ${creatorCommissionsTable.status} <> 'cancelled' THEN ${creatorCommissionsTable.commissionAmount} ELSE 0 END), 0)::text`,
    pending:  sql<string>`COALESCE(SUM(CASE WHEN ${creatorCommissionsTable.status} = 'earned'    THEN ${creatorCommissionsTable.commissionAmount} ELSE 0 END), 0)::text`,
    paid:     sql<string>`COALESCE(SUM(CASE WHEN ${creatorCommissionsTable.status} = 'paid'      THEN ${creatorCommissionsTable.commissionAmount} ELSE 0 END), 0)::text`,
    salesCount: sql<string>`COUNT(*) FILTER (WHERE ${creatorCommissionsTable.status} <> 'cancelled')::text`,
  }).from(creatorCommissionsTable).where(eq(creatorCommissionsTable.creatorId, c.id));

  const [thisMonth] = await db.select({
    amount: sql<string>`COALESCE(SUM(CASE WHEN ${creatorCommissionsTable.status} <> 'cancelled' THEN ${creatorCommissionsTable.commissionAmount} ELSE 0 END), 0)::text`,
  }).from(creatorCommissionsTable)
    .where(and(eq(creatorCommissionsTable.creatorId, c.id), gte(creatorCommissionsTable.createdAt, startOfMonth)));

  // Recent sales (most recent 10 commissions with course title)
  const recent = await db.select({
    id: creatorCommissionsTable.id,
    courseId: creatorCommissionsTable.courseId,
    courseTitle: coursesTable.title,
    bundleId: creatorCommissionsTable.bundleId,
    saleAmountShare: creatorCommissionsTable.saleAmountShare,
    commissionAmount: creatorCommissionsTable.commissionAmount,
    status: creatorCommissionsTable.status,
    createdAt: creatorCommissionsTable.createdAt,
  })
    .from(creatorCommissionsTable)
    .leftJoin(coursesTable, eq(creatorCommissionsTable.courseId, coursesTable.id))
    .where(eq(creatorCommissionsTable.creatorId, c.id))
    .orderBy(desc(creatorCommissionsTable.createdAt))
    .limit(10);

  res.json({
    creator: { id: c.id, name: c.name, status: c.status },
    totals: {
      lifetimeEarnings: parseFloat(totals?.lifetime ?? "0"),
      pending:  parseFloat(totals?.pending  ?? "0"),
      paid:     parseFloat(totals?.paid     ?? "0"),
      salesCount: parseInt(totals?.salesCount ?? "0", 10),
      thisMonth: parseFloat(thisMonth?.amount ?? "0"),
    },
    recentSales: recent.map(r => ({
      id: r.id,
      courseTitle: r.courseTitle,
      bundleName: null as string | null,
      saleAmount: parseFloat(r.saleAmountShare),
      commissionAmount: parseFloat(r.commissionAmount),
      status: r.status,
      createdAt: r.createdAt,
    })),
  });
});

// GET /api/creator/sales — paginated commission ledger
router.get("/sales", requireCreator, async (req, res): Promise<void> => {
  const c = await loadCreatorForRequest(req as AuthedRequest, res);
  if (!c) return;
  const pageSize = Math.min(parseInt(String(req.query.pageSize ?? req.query.limit ?? "20"), 10) || 20, 100);
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const offset = (page - 1) * pageSize;
  const status = String(req.query.status ?? "all");

  const conds = [eq(creatorCommissionsTable.creatorId, c.id)];
  if (status !== "all") conds.push(eq(creatorCommissionsTable.status, status as "earned" | "paid" | "cancelled"));

  const rows = await db.select({
    id: creatorCommissionsTable.id,
    courseId: creatorCommissionsTable.courseId,
    courseTitle: coursesTable.title,
    bundleId: creatorCommissionsTable.bundleId,
    bundleName: bundlesTable.name,
    saleAmountShare: creatorCommissionsTable.saleAmountShare,
    commissionPercent: creatorCommissionsTable.commissionPercent,
    commissionAmount: creatorCommissionsTable.commissionAmount,
    status: creatorCommissionsTable.status,
    payoutId: creatorCommissionsTable.payoutId,
    createdAt: creatorCommissionsTable.createdAt,
  })
    .from(creatorCommissionsTable)
    .leftJoin(coursesTable, eq(creatorCommissionsTable.courseId, coursesTable.id))
    .leftJoin(bundlesTable, eq(creatorCommissionsTable.bundleId, bundlesTable.id))
    .where(and(...conds))
    .orderBy(desc(creatorCommissionsTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db.select({ total: sql<string>`COUNT(*)::text` })
    .from(creatorCommissionsTable).where(and(...conds));

  res.json({
    rows: rows.map(r => ({
      id: r.id,
      courseTitle: r.courseTitle,
      bundleName: r.bundleName,
      saleAmount: parseFloat(r.saleAmountShare),
      commissionPercent: parseFloat(r.commissionPercent),
      commissionAmount: parseFloat(r.commissionAmount),
      status: r.status,
      payoutId: r.payoutId,
      createdAt: r.createdAt,
    })),
    total: parseInt(total ?? "0", 10),
    pageSize,
    page,
  });
});

// GET /api/creator/payouts — payout history
router.get("/payouts", requireCreator, async (req, res): Promise<void> => {
  const c = await loadCreatorForRequest(req as AuthedRequest, res);
  if (!c) return;
  const rows = await db.select().from(creatorPayoutsTable)
    .where(eq(creatorPayoutsTable.creatorId, c.id))
    .orderBy(desc(creatorPayoutsTable.createdAt));
  res.json(rows.map(p => ({ ...p, amount: parseFloat(p.amount) })));
});

// GET /api/creator/courses — assigned courses with sale stats
router.get("/courses", requireCreator, async (req, res): Promise<void> => {
  const c = await loadCreatorForRequest(req as AuthedRequest, res);
  if (!c) return;
  const courses = await db.select({
    id: coursesTable.id,
    title: coursesTable.title,
    status: coursesTable.status,
    price: coursesTable.price,
    thumbnailUrl: coursesTable.thumbnailUrl,
    createdAt: coursesTable.createdAt,
  }).from(coursesTable).where(eq(coursesTable.creatorId, c.id)).orderBy(desc(coursesTable.createdAt));

  const enriched = await Promise.all(courses.map(async (course) => {
    const [agg] = await db.select({
      sales: sql<string>`COUNT(*) FILTER (WHERE ${creatorCommissionsTable.status} <> 'cancelled')::text`,
      earnings: sql<string>`COALESCE(SUM(CASE WHEN ${creatorCommissionsTable.status} <> 'cancelled' THEN ${creatorCommissionsTable.commissionAmount} ELSE 0 END), 0)::text`,
    }).from(creatorCommissionsTable)
      .where(and(eq(creatorCommissionsTable.creatorId, c.id), eq(creatorCommissionsTable.courseId, course.id)));
    return {
      ...course,
      price: parseFloat(course.price),
      isPublished: course.status === "published",
      salesCount: parseInt(agg?.sales ?? "0", 10),
      totalEarnings: parseFloat(agg?.earnings ?? "0"),
    };
  }));
  res.json(enriched);
});

// GET /api/creator/kyc
router.get("/kyc", requireCreator, async (req, res): Promise<void> => {
  const c = await loadCreatorForRequest(req as AuthedRequest, res);
  if (!c) return;
  // Locked = creator has actually submitted KYC docs AND it's either awaiting
  // review (pending) or already approved. Default `kycStatus='pending'` on
  // a fresh row WITHOUT any submitted PAN data is treated as "not submitted yet"
  // so the very first submission isn't accidentally blocked.
  const hasSubmittedKyc = !!(c.panNumber || c.panName || c.panFrontUrl);
  const kycLocked = hasSubmittedKyc && (c.kycStatus === "pending" || c.kycStatus === "approved");
  res.json({
    kyc: {
      panName: c.panName,
      panNumber: c.panNumber,
      panFrontUrl: c.panFrontUrl,
      idProofUrl: c.idProofUrl,
      addressProofUrl: c.addressProofUrl,
      status: c.kycStatus,
      adminNote: c.kycAdminNote,
      reviewedAt: c.kycReviewedAt,
      locked: kycLocked,
      submitted: hasSubmittedKyc,
    },
    bank: {
      accountHolderName: c.accountHolderName,
      accountNumber: c.accountNumber,
      ifscCode: c.ifscCode,
      bankName: c.bankName,
      upiId: c.upiId,
    },
  });
});

// PATCH /api/creator/kyc — only editable endpoint for creators
router.patch("/kyc", requireCreator, async (req, res): Promise<void> => {
  const c = await loadCreatorForRequest(req as AuthedRequest, res);
  if (!c) return;
  // Accept BOTH a flat body { panNumber, ... } and a nested body { kyc: {...}, bank: {...} }
  // (the frontend KYC form sends nested; admin-side flows can keep using flat).
  const raw = req.body as Record<string, unknown>;
  const flat: Record<string, string | null | undefined> = {};
  if (raw && typeof raw === "object" && (raw.kyc || raw.bank)) {
    const k = (raw.kyc ?? {}) as Record<string, string | null | undefined>;
    const b = (raw.bank ?? {}) as Record<string, string | null | undefined>;
    flat.panName = k.panName;
    flat.panNumber = k.panNumber;
    flat.panFrontUrl = k.panFrontUrl;
    flat.idProofUrl = k.idProofUrl;
    flat.addressProofUrl = k.addressProofUrl;
    flat.accountHolderName = b.accountHolderName;
    flat.accountNumber = b.accountNumber;
    flat.ifscCode = b.ifscCode;
    flat.bankName = b.bankName;
    flat.upiId = b.upiId;
  } else {
    Object.assign(flat, raw);
  }
  const {
    panName, panNumber, panFrontUrl, idProofUrl, addressProofUrl,
    accountHolderName, accountNumber, ifscCode, bankName, upiId,
    preferredPaymentMethod,
  } = flat;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {};
  if (panName !== undefined) updates.panName = panName ? panName.trim() : null;
  if (panNumber !== undefined) updates.panNumber = panNumber ? panNumber.toUpperCase().trim() : null;
  if (panFrontUrl !== undefined) updates.panFrontUrl = panFrontUrl || null;
  if (idProofUrl !== undefined) updates.idProofUrl = idProofUrl || null;
  if (addressProofUrl !== undefined) updates.addressProofUrl = addressProofUrl || null;
  if (accountHolderName !== undefined) updates.accountHolderName = accountHolderName || null;
  if (accountNumber !== undefined) updates.accountNumber = accountNumber || null;
  if (ifscCode !== undefined) updates.ifscCode = ifscCode ? ifscCode.toUpperCase() : null;
  if (bankName !== undefined) updates.bankName = bankName || null;
  if (upiId !== undefined) updates.upiId = upiId || null;
  if (preferredPaymentMethod !== undefined && (preferredPaymentMethod === "bank" || preferredPaymentMethod === "upi")) {
    updates.preferredPaymentMethod = preferredPaymentMethod;
  }
  // KYC fields that count as "submission documents" (changing any of these
  // means the creator is (re)submitting their PAN). Bank fields are NOT
  // included — bank account stays editable independently of KYC review.
  const kycDocFields = ["panName", "panNumber", "panFrontUrl", "idProofUrl", "addressProofUrl"];
  const kycFieldsTouched = kycDocFields.some(k => updates[k] !== undefined);

  // Lock check: if this creator has previously submitted KYC and it's
  // currently pending/approved, we must NOT let them silently overwrite
  // the documents while admin is reviewing or after approval. Bank-only
  // edits still pass through.
  const hasSubmittedKyc = !!(c.panNumber || c.panName || c.panFrontUrl);
  const kycLocked = hasSubmittedKyc && (c.kycStatus === "pending" || c.kycStatus === "approved");
  if (kycLocked && kycFieldsTouched) {
    res.status(409).json({
      error: c.kycStatus === "approved"
        ? "Your KYC is already approved and locked. Contact admin to change it."
        : "Your KYC is under review. Wait for admin decision before re-submitting.",
    });
    return;
  }

  if (kycFieldsTouched) {
    // Validate required submission fields (final post-update state must have all three).
    const finalPanName = (updates.panName ?? c.panName)?.toString().trim();
    const finalPanNumber = (updates.panNumber ?? c.panNumber)?.toString().trim();
    const finalPanFront = (updates.panFrontUrl ?? c.panFrontUrl)?.toString().trim();
    if (!finalPanName || !finalPanNumber || !finalPanFront) {
      res.status(400).json({ error: "Name as per PAN, PAN number and PAN front image are all required." });
      return;
    }
    // Basic PAN format check: 5 letters + 4 digits + 1 letter
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(finalPanNumber)) {
      res.status(400).json({ error: "PAN number format invalid. Expected 10 chars (e.g. ABCDE1234F)." });
      return;
    }
    // Submitting / re-submitting → set status back to pending review and clear prior notes.
    updates.kycStatus = "pending";
    updates.kycAdminNote = null;
    updates.kycReviewedAt = null;
  }

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  // Atomic write: when KYC fields are involved, the lock check above used a
  // pre-loaded snapshot. To prevent two concurrent resubmits from racing
  // (both observe status='rejected' before either updates), re-assert the
  // unlocked condition INSIDE the WHERE clause. If admin flipped the row
  // to 'pending'/'approved' between our SELECT and UPDATE, or another
  // resubmit got there first, this UPDATE returns 0 rows and we 409.
  let updated;
  if (kycFieldsTouched) {
    const rows = await db.update(creatorsTable).set(updates).where(
      and(
        eq(creatorsTable.id, c.id),
        // unlocked condition: never-submitted-yet OR currently rejected
        or(
          and(
            isNull(creatorsTable.panNumber),
            isNull(creatorsTable.panName),
            isNull(creatorsTable.panFrontUrl),
          ),
          eq(creatorsTable.kycStatus, "rejected"),
        ),
      ),
    ).returning();
    updated = rows[0];
    if (!updated) {
      res.status(409).json({ error: "KYC state changed — please refresh and try again." });
      return;
    }
  } else {
    [updated] = await db.update(creatorsTable).set(updates).where(eq(creatorsTable.id, c.id)).returning();
  }
  res.json({ creator: updated });
});

export default router;
