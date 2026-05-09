import { Router } from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "@workspace/db";
import {
  usersTable, coursesTable, modulesTable, enrollmentsTable, paymentsTable, referralsTable,
  payoutRequestsTable, platformSettingsTable, lessonCompletionsTable, lessonsTable,
  paymentGatewaysTable, bundlesTable, bundleCoursesTable, adminStaffTable, creatorsTable
} from "@workspace/db";
import { eq, count, sum, gte, and, ilike, or, sql, desc, ne, inArray, isNotNull, isNull } from "drizzle-orm";
import { requireAdmin, verifyToken, type JwtPayload } from "../middlewares/auth";
import type { Request } from "express";
import { triggerAutomation, invalidatePublicBaseUrlCache } from "./crm";
import { cancelCreatorCommissionsForPayment } from "./creators";

const router = Router();
type AuthedRequest = Request & { user: JwtPayload };

router.get("/users", requireAdmin, async (req, res): Promise<void> => {
  const { search, role, status, limit = "50", offset = "0" } = req.query as Record<string, string>;

  // The `users.role` enum is intentionally limited to admin/student/affiliate
  // (staff status lives in admin_staff, creator status lives in creators). To
  // surface "staff" and "creator" in the Users page we LEFT JOIN both tables
  // and derive the displayed role at query time. Priority: staff > creator >
  // underlying users.role (so an admin who is also a creator stays "admin").
  const derivedRole = sql<string>`
    CASE
      WHEN ${adminStaffTable.status} = 'active' THEN 'staff'
      WHEN ${usersTable.role} <> 'admin' AND ${creatorsTable.status} = 'active' THEN 'creator'
      ELSE ${usersTable.role}
    END
  `;

  const conditions = [];
  if (search) conditions.push(or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`))!);
  if (role === "staff") {
    conditions.push(eq(adminStaffTable.status, "active"));
  } else if (role === "creator") {
    // Active creators (but not admins, who keep priority) appear under
    // "creator". Also exclude active staff to mirror the derived priority.
    conditions.push(eq(creatorsTable.status, "active"));
    conditions.push(ne(usersTable.role, "admin"));
    conditions.push(or(isNull(adminStaffTable.id), ne(adminStaffTable.status, "active"))!);
  } else if (role === "admin") {
    conditions.push(eq(usersTable.role, "admin"));
  } else if (role === "student" || role === "affiliate") {
    // Active staff users display as "staff" and active creators display as
    // "creator", so exclude them from their underlying role bucket to avoid
    // double-counting / duplicate rows.
    conditions.push(eq(usersTable.role, role));
    conditions.push(or(isNull(adminStaffTable.id), ne(adminStaffTable.status, "active"))!);
    conditions.push(or(isNull(creatorsTable.id), ne(creatorsTable.status, "active"))!);
  }
  if (status === "active") conditions.push(eq(usersTable.isBanned, false));
  if (status === "banned") conditions.push(eq(usersTable.isBanned, true));

  let query = db.select({
    id: usersTable.id, email: usersTable.email, name: usersTable.name,
    role: derivedRole.as("role"),
    baseRole: usersTable.role,
    isStaff: sql<boolean>`COALESCE(${adminStaffTable.status} = 'active', false)`.as("is_staff"),
    isCreator: sql<boolean>`COALESCE(${creatorsTable.status} = 'active', false)`.as("is_creator"),
    avatarUrl: usersTable.avatarUrl, referralCode: usersTable.referralCode,
    isBanned: usersTable.isBanned, createdAt: usersTable.createdAt,
    phone: (usersTable as any).phone,
  })
    .from(usersTable)
    .leftJoin(adminStaffTable, eq(adminStaffTable.userId, usersTable.id))
    .leftJoin(creatorsTable, eq(creatorsTable.userId, usersTable.id))
    .$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));

  const [rawUsers, totalResult] = await Promise.all([
    query.orderBy(desc(usersTable.createdAt)).limit(parseInt(limit)).offset(parseInt(offset)),
    db.select({ count: count() })
      .from(usersTable)
      .leftJoin(adminStaffTable, eq(adminStaffTable.userId, usersTable.id))
      .leftJoin(creatorsTable, eq(creatorsTable.userId, usersTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);
  const users = rawUsers.map(u => {
    const roles: string[] = [u.baseRole];
    if (u.isStaff) roles.push("staff");
    if (u.isCreator) roles.push("creator");
    return { id: u.id, email: u.email, name: u.name, role: u.role, roles, avatarUrl: u.avatarUrl, referralCode: u.referralCode, isBanned: u.isBanned, createdAt: u.createdAt, phone: u.phone };
  });
  res.json({ users, total: totalResult[0]?.count ?? 0, limit: parseInt(limit), offset: parseInt(offset) });
});

router.get("/users/export", requireAdmin, async (req, res): Promise<void> => {
  // Derive role same as the list endpoint so exported CSV matches what the
  // admin sees on screen (active staff → "staff", active creator → "creator").
  const derivedRole = sql<string>`
    CASE
      WHEN ${adminStaffTable.status} = 'active' THEN 'staff'
      WHEN ${usersTable.role} <> 'admin' AND ${creatorsTable.status} = 'active' THEN 'creator'
      ELSE ${usersTable.role}
    END
  `;
  const users = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
    role: derivedRole.as("role"), isBanned: usersTable.isBanned,
    phone: (usersTable as any).phone,
    referralCode: usersTable.referralCode, createdAt: usersTable.createdAt,
  })
    .from(usersTable)
    .leftJoin(adminStaffTable, eq(adminStaffTable.userId, usersTable.id))
    .leftJoin(creatorsTable, eq(creatorsTable.userId, usersTable.id))
    .orderBy(desc(usersTable.createdAt));

  const allEnrollments = await db
    .select({ userId: enrollmentsTable.userId, courseTitle: coursesTable.title, enrolledAt: enrollmentsTable.enrolledAt })
    .from(enrollmentsTable)
    .innerJoin(coursesTable, eq(enrollmentsTable.courseId, coursesTable.id));

  const enrollMap = new Map<number, Array<{ title: string; enrolledAt: Date }>>();
  for (const e of allEnrollments) {
    if (!enrollMap.has(e.userId)) enrollMap.set(e.userId, []);
    enrollMap.get(e.userId)!.push({ title: e.courseTitle, enrolledAt: new Date(e.enrolledAt) });
  }

  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const header = ["ID", "Name", "Email", "Role", "Status", "Phone", "Referral Code", "Joined Date", "Enrolled Courses", "Enrollment Count", "Enrollment Dates"];
  const rows = users.map(u => {
    const courses = enrollMap.get(u.id) ?? [];
    const titles = courses.map(c => c.title).join(" | ");
    const dates = courses.map(c => c.enrolledAt.toISOString().split("T")[0]).join(" | ");
    return [
      u.id, u.name, u.email, u.role,
      u.isBanned ? "banned" : "active",
      u.phone ?? "",
      u.referralCode ?? "",
      new Date(u.createdAt).toISOString().split("T")[0],
      titles,
      courses.length,
      dates,
    ].map(escape).join(",");
  });

  const csv = [header.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="users-${new Date().toISOString().split("T")[0]}.csv"`);
  res.send(csv);
});

router.get("/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId);
  const derivedRole = sql<string>`
    CASE
      WHEN ${adminStaffTable.status} = 'active' THEN 'staff'
      WHEN ${usersTable.role} <> 'admin' AND ${creatorsTable.status} = 'active' THEN 'creator'
      ELSE ${usersTable.role}
    END
  `;
  const [rawUser] = await db.select({
    id: usersTable.id, email: usersTable.email, name: usersTable.name,
    role: derivedRole.as("role"),
    baseRole: usersTable.role,
    isStaff: sql<boolean>`COALESCE(${adminStaffTable.status} = 'active', false)`.as("is_staff"),
    isCreator: sql<boolean>`COALESCE(${creatorsTable.status} = 'active', false)`.as("is_creator"),
    avatarUrl: usersTable.avatarUrl, referralCode: usersTable.referralCode,
    isBanned: usersTable.isBanned, createdAt: usersTable.createdAt,
    phone: (usersTable as any).phone,
  })
    .from(usersTable)
    .leftJoin(adminStaffTable, eq(adminStaffTable.userId, usersTable.id))
    .leftJoin(creatorsTable, eq(creatorsTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!rawUser) { res.status(404).json({ error: "User not found" }); return; }
  const userRoles: string[] = [rawUser.baseRole];
  if (rawUser.isStaff) userRoles.push("staff");
  if (rawUser.isCreator) userRoles.push("creator");
  const user = { id: rawUser.id, email: rawUser.email, name: rawUser.name, role: rawUser.role, roles: userRoles, avatarUrl: rawUser.avatarUrl, referralCode: rawUser.referralCode, isBanned: rawUser.isBanned, createdAt: rawUser.createdAt, phone: rawUser.phone };

  const [spentResult] = await db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "completed")));
  const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, userId));
  const affiliateEarnings = referrals.reduce((acc, r) => acc + parseFloat(String(r.commission ?? 0)), 0);

  const enrolledCourses = await db
    .select({ id: coursesTable.id, title: coursesTable.title, enrolledAt: enrollmentsTable.enrolledAt })
    .from(enrollmentsTable)
    .innerJoin(coursesTable, eq(enrollmentsTable.courseId, coursesTable.id))
    .where(eq(enrollmentsTable.userId, userId))
    .orderBy(desc(enrollmentsTable.enrolledAt));

  const bundlePayments = await db
    .select({
      bundleId: bundlesTable.id,
      bundleName: bundlesTable.name,
      amount: paymentsTable.amount,
      purchasedAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .innerJoin(bundlesTable, eq(paymentsTable.bundleId, bundlesTable.id))
    .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "completed"), isNotNull(paymentsTable.bundleId)))
    .orderBy(desc(paymentsTable.createdAt));

  const purchasedBundles = await Promise.all(bundlePayments.map(async (bp) => {
    const courses = await db
      .select({ id: coursesTable.id, title: coursesTable.title })
      .from(bundleCoursesTable)
      .innerJoin(coursesTable, eq(bundleCoursesTable.courseId, coursesTable.id))
      .where(eq(bundleCoursesTable.bundleId, bp.bundleId));
    return { ...bp, courses };
  }));

  res.json({ ...user, enrollmentCount: enrolledCourses.length, totalSpent: parseFloat(String(spentResult?.total ?? 0)), affiliateEarnings, enrolledCourses, purchasedBundles });
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const { name, email, password, role = "student" } = req.body;
  if (!name || !email || !password) { res.status(400).json({ error: "name, email, and password are required" }); return; }
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (existing) { res.status(409).json({ error: "Email already registered" }); return; }
  const hashed = await bcrypt.hash(password, 10);
  const referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  const [user] = await db.insert(usersTable).values({ name, email: email.toLowerCase(), password: hashed, role, referralCode }).returning({
    id: usersTable.id, email: usersTable.email, name: usersTable.name,
    role: usersTable.role, avatarUrl: usersTable.avatarUrl, referralCode: usersTable.referralCode,
    isBanned: usersTable.isBanned, createdAt: usersTable.createdAt,
  });
  res.status(201).json(user);
});

router.put("/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId);
  const authReq = req as AuthedRequest;
  const { name, email, role, isBanned, password, phone, grantCreator, revokeCreator } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email.toLowerCase();
  if (role !== undefined && role !== "staff" && role !== "creator") updates.role = role;
  if (isBanned !== undefined) updates.isBanned = isBanned;
  if (password !== undefined && password.length > 0) updates.password = await bcrypt.hash(password, 10);
  if (phone !== undefined) updates.phone = phone.trim() || null;

  const [userRow] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!userRow) { res.status(404).json({ error: "User not found" }); return; }

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(usersTable).set(updates).where(eq(usersTable.id, userId));
    }
    if (grantCreator) {
      const [existing] = await tx.select().from(creatorsTable).where(eq(creatorsTable.userId, userId)).limit(1);
      if (existing) {
        if (existing.status !== "active") {
          await tx.update(creatorsTable).set({ status: "active" }).where(eq(creatorsTable.id, existing.id));
        }
      } else {
        await tx.insert(creatorsTable).values({
          userId,
          name: name ?? userRow.name,
          email: (email ?? userRow.email).toLowerCase(),
          invitedBy: authReq.user.userId,
          status: "active",
          kycStatus: "pending",
        });
      }
    }
    if (revokeCreator) {
      await tx.update(creatorsTable).set({ status: "revoked" }).where(eq(creatorsTable.userId, userId));
    }
  });

  const derivedRole = sql<string>`
    CASE
      WHEN ${adminStaffTable.status} = 'active' THEN 'staff'
      WHEN ${usersTable.role} <> 'admin' AND ${creatorsTable.status} = 'active' THEN 'creator'
      ELSE ${usersTable.role}
    END
  `;
  const [final] = await db.select({
    id: usersTable.id, email: usersTable.email, name: usersTable.name,
    role: derivedRole.as("role"),
    baseRole: usersTable.role,
    isStaff: sql<boolean>`COALESCE(${adminStaffTable.status} = 'active', false)`.as("is_staff"),
    isCreator: sql<boolean>`COALESCE(${creatorsTable.status} = 'active', false)`.as("is_creator"),
    avatarUrl: usersTable.avatarUrl, referralCode: usersTable.referralCode,
    isBanned: usersTable.isBanned, createdAt: usersTable.createdAt,
    phone: (usersTable as any).phone,
  })
    .from(usersTable)
    .leftJoin(adminStaffTable, eq(adminStaffTable.userId, usersTable.id))
    .leftJoin(creatorsTable, eq(creatorsTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  const roles: string[] = [final.baseRole];
  if (final.isStaff) roles.push("staff");
  if (final.isCreator) roles.push("creator");
  res.json({ id: final.id, email: final.email, name: final.name, role: final.role, roles, avatarUrl: final.avatarUrl, referralCode: final.referralCode, isBanned: final.isBanned, createdAt: final.createdAt, phone: final.phone });
});

// ── Bulk delete users ─────────────────────────────────────────────────────────
router.delete("/users/bulk", requireAdmin, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const ids: number[] = req.body?.ids ?? [];
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "Provide a non-empty ids array" }); return; }
  const safeIds = ids.filter(id => id !== authedReq.user?.id);
  if (safeIds.length === 0) { res.status(400).json({ error: "Cannot delete your own account" }); return; }
  await db.delete(usersTable).where(inArray(usersTable.id, safeIds));
  res.json({ deleted: safeIds.length });
});

// ── Bulk ban/unban users ──────────────────────────────────────────────────────
router.post("/users/bulk-ban", requireAdmin, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const ids: number[] = req.body?.ids ?? [];
  const banned: boolean = req.body?.banned ?? true;
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "Provide a non-empty ids array" }); return; }
  const safeIds = ids.filter(id => id !== authedReq.user?.id);
  if (safeIds.length === 0) { res.status(400).json({ error: "Cannot ban your own account" }); return; }
  await db.update(usersTable).set({ isBanned: banned }).where(inArray(usersTable.id, safeIds));
  res.json({ updated: safeIds.length });
});

router.delete("/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId);
  const authedReq = req as AuthedRequest;
  if (authedReq.user?.id === userId) { res.status(400).json({ error: "Cannot delete your own account" }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.json({ message: "User deleted" });
});

router.post("/users/:userId/ban", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId);
  const { banned } = req.body;
  await db.update(usersTable).set({ isBanned: banned }).where(eq(usersTable.id, userId));
  res.json({ message: `User ${banned ? "banned" : "unbanned"}` });
});

// ── Import users from CSV/JSON ────────────────────────────────────────────────
router.post("/users/import", requireAdmin, async (req, res): Promise<void> => {
  const rows: Array<{ name: string; email: string; password: string; role?: string; phone?: string }> = req.body?.users;
  const enrollCourseId: number | null = req.body?.enrollCourseId ? parseInt(req.body.enrollCourseId) : null;
  const updateExisting: boolean = !!req.body?.updateExisting;

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "Provide a non-empty users array" }); return;
  }

  if (enrollCourseId) {
    const [course] = await db.select({ id: coursesTable.id }).from(coursesTable).where(eq(coursesTable.id, enrollCourseId)).limit(1);
    if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  }

  const errors: Array<{ row: number; email: string; error: string }> = [];

  // 1. Validate all rows upfront
  type ValidRow = { idx: number; name: string; email: string; password: string; role: "admin" | "student" | "affiliate"; phone: string | null };
  const valid: ValidRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.name?.trim() || !r.email?.trim()) {
      errors.push({ row: i + 1, email: r.email ?? "", error: "name and email are required" }); continue;
    }
    // password required only for new users — when updateExisting is true, we allow missing password (update will skip it)
    if (!updateExisting && !r.password?.trim()) {
      errors.push({ row: i + 1, email: r.email ?? "", error: "password is required" }); continue;
    }
    const role = (["admin", "student", "affiliate"].includes(r.role ?? "")) ? r.role as "admin" | "student" | "affiliate" : "student";
    const phone = r.phone?.trim() || null;
    valid.push({ idx: i + 1, name: r.name.trim(), email: r.email.trim().toLowerCase(), password: r.password?.trim() ?? "", role, phone });
  }

  // 2. Bulk check existing emails in one query
  type ToUpdate = ValidRow & { userId: number };
  const toCreate: ValidRow[] = [];
  const toUpdate: ToUpdate[] = [];

  if (valid.length > 0) {
    const emailList = valid.map(r => r.email);
    const existing = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(inArray(usersTable.email, emailList));
    const existingMap = new Map(existing.map(e => [e.email, e.id]));

    for (const r of valid) {
      const existingId = existingMap.get(r.email);
      if (existingId) {
        if (updateExisting) {
          toUpdate.push({ ...r, userId: existingId });
        } else {
          errors.push({ row: r.idx, email: r.email, error: "Email already exists" });
        }
      } else {
        // New users always need a password
        if (!r.password) {
          errors.push({ row: r.idx, email: r.email, error: "password is required" });
        } else {
          toCreate.push(r);
        }
      }
    }
  }

  const CONCURRENCY = 20;

  // 3. Hash passwords for new users & bulk insert
  type HashedRow = ValidRow & { hashed: string };
  const hashed: HashedRow[] = [];
  for (let i = 0; i < toCreate.length; i += CONCURRENCY) {
    const chunk = toCreate.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async r => ({ ...r, hashed: await bcrypt.hash(r.password, 8) })));
    hashed.push(...results);
  }

  const created: number[] = [];
  if (hashed.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < hashed.length; i += CHUNK) {
      const chunk = hashed.slice(i, i + CHUNK);
      const inserted = await db.insert(usersTable).values(
        chunk.map(r => ({ name: r.name, email: r.email, password: r.hashed, role: r.role, phone: r.phone, referralCode: Math.random().toString(36).substring(2, 10).toUpperCase() }))
      ).returning({ id: usersTable.id });
      inserted.forEach(u => created.push(u.id));
    }
  }

  // 4. Update existing users (one-at-a-time for safety, batched concurrently)
  let updated = 0;
  if (toUpdate.length > 0) {
    for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
      const chunk = toUpdate.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async r => {
        const updateSet: Partial<typeof usersTable.$inferInsert> = { name: r.name, role: r.role, phone: r.phone };
        if (r.password) updateSet.password = await bcrypt.hash(r.password, 8);
        await db.update(usersTable).set(updateSet).where(eq(usersTable.id, r.userId));
      }));
      updated += chunk.length;
    }
  }

  // 5. Bulk enroll newly created users
  let enrolled = 0;
  if (enrollCourseId && created.length > 0) {
    try {
      await db.insert(enrollmentsTable).values(created.map(userId => ({ userId, courseId: enrollCourseId }))).onConflictDoNothing();
      enrolled = created.length;
    } catch { /* enrollment failed silently — users still created */ }
  }

  res.json({ created: created.length, updated, enrolled, errors, total: rows.length });
});

router.get("/analytics", requireAdmin, async (req, res): Promise<void> => {
  const now = new Date();
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    [totalUsers], [totalCourses], [totalEnrollments],
    [totalRevenueResult], [newUsersResult], [newEnrollmentsResult], [monthRevenueResult]
  ] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(coursesTable),
    db.select({ count: count() }).from(enrollmentsTable),
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(eq(paymentsTable.status, "completed")),
    db.select({ count: count() }).from(usersTable).where(gte(usersTable.createdAt, monthAgo)),
    db.select({ count: count() }).from(enrollmentsTable).where(gte(enrollmentsTable.enrolledAt, monthAgo)),
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(and(eq(paymentsTable.status, "completed"), gte(paymentsTable.createdAt, monthAgo))),
  ]);

  const topCourses = await db.select({
    id: coursesTable.id, title: coursesTable.title,
    enrollmentCount: count(enrollmentsTable.id),
  }).from(coursesTable).leftJoin(enrollmentsTable, eq(coursesTable.id, enrollmentsTable.courseId)).groupBy(coursesTable.id).orderBy(sql`count(${enrollmentsTable.id}) DESC`).limit(5);

  const recentPayments = await db.select().from(paymentsTable).where(eq(paymentsTable.status, "completed")).orderBy(paymentsTable.createdAt).limit(5);
  const enrichedPayments = await Promise.all(recentPayments.map(async (p) => {
    const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, p.courseId)).limit(1);
    return { ...p, amount: parseFloat(String(p.amount)), course: course ? { ...course, price: parseFloat(course.price), moduleCount: 0, lessonCount: 0, enrollmentCount: 0 } : null };
  }));

  res.json({
    totalUsers: totalUsers?.count ?? 0,
    totalCourses: totalCourses?.count ?? 0,
    totalEnrollments: totalEnrollments?.count ?? 0,
    totalRevenue: parseFloat(String(totalRevenueResult?.total ?? 0)),
    activeUsers: totalUsers?.count ?? 0,
    newUsersThisMonth: newUsersResult?.count ?? 0,
    newEnrollmentsThisMonth: newEnrollmentsResult?.count ?? 0,
    revenueThisMonth: parseFloat(String(monthRevenueResult?.total ?? 0)),
    topCourses: topCourses.map(c => ({ id: c.id, title: c.title, enrollmentCount: c.enrollmentCount, revenue: 0 })),
    recentPayments: enrichedPayments,
  });
});

router.get("/revenue", requireAdmin, async (req, res): Promise<void> => {
  const { period = "30d" } = req.query as Record<string, string>;
  const days = period === "7d" ? 7 : period === "90d" ? 90 : period === "1y" ? 365 : 30;

  // Build the bucket window anchored at UTC midnight today so that today's
  // payments land in a bucket. The previous implementation used a rolling
  // `now - N*day` start which generated buckets [now-Nd .. now-1d] and
  // dropped any payments made today (they still counted in totalRevenue,
  // causing the chart total to mismatch the bar sum).
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDate = new Date(todayUtc.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const payments = await db.select().from(paymentsTable).where(and(eq(paymentsTable.status, "completed"), gte(paymentsTable.createdAt, startDate)));

  const byDate: Record<string, { revenue: number; enrollments: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    byDate[key] = { revenue: 0, enrollments: 0 };
  }
  for (const p of payments) {
    const key = new Date(p.createdAt).toISOString().split("T")[0];
    if (byDate[key]) {
      byDate[key].revenue += parseFloat(String(p.amount));
      byDate[key].enrollments += 1;
    }
  }

  const chartData = Object.entries(byDate).map(([date, data]) => ({ date, ...data }));
  const totalRevenue = payments.reduce((acc, p) => acc + parseFloat(String(p.amount)), 0);
  const byGateway = { stripe: 0, razorpay: 0 };
  for (const p of payments) {
    if (p.gateway === "stripe") byGateway.stripe += parseFloat(String(p.amount));
    else if (p.gateway === "razorpay") byGateway.razorpay += parseFloat(String(p.amount));
  }

  res.json({ period, totalRevenue, chartData, byGateway });
});

router.get("/period-summary", requireAdmin, async (req, res): Promise<void> => {
  const { period = "30d" } = req.query as Record<string, string>;
  const days = period === "7d" ? 7 : period === "14d" ? 14 : 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [[revenueResult], [enrollmentsResult], [newUsersResult]] = await Promise.all([
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable)
      .where(and(eq(paymentsTable.status, "completed"), gte(paymentsTable.createdAt, startDate))),
    db.select({ count: count() }).from(enrollmentsTable)
      .where(gte(enrollmentsTable.enrolledAt, startDate)),
    db.select({ count: count() }).from(usersTable)
      .where(gte(usersTable.createdAt, startDate)),
  ]);

  res.json({
    period,
    revenue: parseFloat(String(revenueResult?.total ?? 0)),
    enrollments: enrollmentsResult?.count ?? 0,
    newUsers: newUsersResult?.count ?? 0,
  });
});

router.get("/affiliates", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, referralCode: usersTable.referralCode }).from(usersTable);
  const affiliateData = await Promise.all(users.map(async (u) => {
    const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, u.id));
    const totalEarnings = referrals.reduce((acc, r) => acc + parseFloat(String(r.commission ?? 0)), 0);
    const approvedPayouts = await db.select().from(payoutRequestsTable).where(and(eq(payoutRequestsTable.userId, u.id), eq(payoutRequestsTable.status, "approved")));
    const paidEarnings = approvedPayouts.reduce((acc, p) => acc + parseFloat(String(p.amount)), 0);
    return {
      ...u,
      totalClicks: referrals.filter(r => r.status === "click").length,
      totalConversions: referrals.filter(r => r.status === "purchase").length,
      totalEarnings,
      pendingEarnings: Math.max(0, totalEarnings - paidEarnings),
    };
  }));
  res.json(affiliateData.filter(a => a.totalClicks > 0 || a.totalEarnings > 0));
});


router.get("/enrollments", requireAdmin, async (req, res): Promise<void> => {
  const { search, courseId, limit = "100", offset = "0" } = req.query as Record<string, string>;

  const rows = await db.select({
    id: enrollmentsTable.id,
    userId: enrollmentsTable.userId,
    courseId: enrollmentsTable.courseId,
    enrolledAt: enrollmentsTable.enrolledAt,
    completedAt: enrollmentsTable.completedAt,
    userName: usersTable.name,
    userEmail: usersTable.email,
    courseTitle: coursesTable.title,
    courseThumbnail: coursesTable.thumbnailUrl,
  })
  .from(enrollmentsTable)
  .innerJoin(usersTable, eq(enrollmentsTable.userId, usersTable.id))
  .innerJoin(coursesTable, eq(enrollmentsTable.courseId, coursesTable.id))
  .where(courseId ? eq(enrollmentsTable.courseId, parseInt(courseId)) : undefined)
  .orderBy(desc(enrollmentsTable.enrolledAt))
  .limit(parseInt(limit))
  .offset(parseInt(offset));

  let baseResult = rows;
  if (search) {
    const s = search.toLowerCase();
    baseResult = rows.filter(r =>
      r.userName.toLowerCase().includes(s) ||
      r.userEmail.toLowerCase().includes(s) ||
      r.courseTitle.toLowerCase().includes(s)
    );
  }

  // Progress per (user, course): two grouped queries scoped to the visible
  // result page so we avoid N+1. Total lessons per course (via modules join)
  // and completed lessons per (user, course) from lesson_completions.
  const courseIds = Array.from(new Set(baseResult.map(r => r.courseId)));
  const userIds = Array.from(new Set(baseResult.map(r => r.userId)));
  const totalMap = new Map<number, number>();
  const completedMap = new Map<string, number>();
  if (courseIds.length > 0) {
    const totalsByCourse = await db.select({
      courseId: modulesTable.courseId,
      total: count(lessonsTable.id),
    })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(lessonsTable.moduleId, modulesTable.id))
    .where(inArray(modulesTable.courseId, courseIds))
    .groupBy(modulesTable.courseId);
    for (const t of totalsByCourse) totalMap.set(t.courseId, Number(t.total));

    if (userIds.length > 0) {
      const completedRows = await db.select({
        userId: lessonCompletionsTable.userId,
        courseId: modulesTable.courseId,
        completed: count(lessonCompletionsTable.id),
      })
      .from(lessonCompletionsTable)
      .innerJoin(lessonsTable, eq(lessonCompletionsTable.lessonId, lessonsTable.id))
      .innerJoin(modulesTable, eq(lessonsTable.moduleId, modulesTable.id))
      .where(and(
        inArray(lessonCompletionsTable.userId, userIds),
        inArray(modulesTable.courseId, courseIds),
      ))
      .groupBy(lessonCompletionsTable.userId, modulesTable.courseId);
      for (const c of completedRows) completedMap.set(`${c.userId}:${c.courseId}`, Number(c.completed));
    }
  }

  const result = baseResult.map(r => {
    const totalLessons = totalMap.get(r.courseId) ?? 0;
    const completedLessons = completedMap.get(`${r.userId}:${r.courseId}`) ?? 0;
    const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    return { ...r, totalLessons, completedLessons, progressPercent };
  });

  const [totalResult] = await db.select({ total: count() }).from(enrollmentsTable);
  const [completedResult] = await db.select({ total: count() }).from(enrollmentsTable).where(sql`completed_at IS NOT NULL`);

  res.json({
    enrollments: result,
    total: totalResult?.total ?? 0,
    stats: {
      total: totalResult?.total ?? 0,
      completed: completedResult?.total ?? 0,
      active: (totalResult?.total ?? 0) - (completedResult?.total ?? 0),
    }
  });
});

router.post("/enrollments", requireAdmin, async (req, res): Promise<void> => {
  const { userId, courseId } = req.body;
  if (!userId || !courseId) { res.status(400).json({ error: "userId and courseId are required" }); return; }

  const [user] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, parseInt(userId))).limit(1);
  const [course] = await db.select({ id: coursesTable.id, title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, parseInt(courseId))).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  const [existing] = await db.select({ id: enrollmentsTable.id }).from(enrollmentsTable)
    .where(and(eq(enrollmentsTable.userId, parseInt(userId)), eq(enrollmentsTable.courseId, parseInt(courseId)))).limit(1);
  if (existing) { res.status(409).json({ error: `${user.name} is already enrolled in "${course.title}"` }); return; }

  const [enrollment] = await db.insert(enrollmentsTable).values({ userId: parseInt(userId), courseId: parseInt(courseId) }).returning();
  res.status(201).json({ ...enrollment, userName: user.name, courseTitle: course.title });
});

router.delete("/enrollments/:enrollmentId", requireAdmin, async (req, res): Promise<void> => {
  const enrollmentId = parseInt(req.params.enrollmentId);
  const [enrollment] = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.id, enrollmentId)).limit(1);
  if (!enrollment) { res.status(404).json({ error: "Enrollment not found" }); return; }

  const courseModules = await db.select({ id: modulesTable.id }).from(modulesTable).where(eq(modulesTable.courseId, enrollment.courseId));
  for (const mod of courseModules) {
    const modLessons = await db.select({ id: lessonsTable.id }).from(lessonsTable).where(eq(lessonsTable.moduleId, mod.id));
    for (const lesson of modLessons) {
      await db.delete(lessonCompletionsTable).where(and(eq(lessonCompletionsTable.userId, enrollment.userId), eq(lessonCompletionsTable.lessonId, lesson.id)));
    }
  }

  await db.delete(enrollmentsTable).where(eq(enrollmentsTable.id, enrollmentId));
  res.json({ message: "Enrollment removed" });
});

router.get("/courses", requireAdmin, async (req, res): Promise<void> => {
  const courses = await db.select().from(coursesTable).orderBy(coursesTable.createdAt);
  const enriched = await Promise.all(courses.map(async (c) => {
    const [enrollResult] = await db.select({ count: count() }).from(enrollmentsTable).where(eq(enrollmentsTable.courseId, c.id));
    return { ...c, price: parseFloat(c.price), moduleCount: 0, lessonCount: 0, enrollmentCount: enrollResult?.count ?? 0 };
  }));
  res.json(enriched);
});

router.get("/settings", requireAdmin, async (req, res): Promise<void> => {
  const settings = await db.select().from(platformSettingsTable).limit(1);
  if (settings.length === 0) {
    await db.insert(platformSettingsTable).values({});
    const [newSettings] = await db.select().from(platformSettingsTable).limit(1);
    res.json({ ...newSettings, commissionRate: newSettings.commissionRate / 100 });
    return;
  }
  res.json({ ...settings[0], commissionRate: settings[0].commissionRate / 100 });
});

router.put("/settings", requireAdmin, async (req, res): Promise<void> => {
  const { siteName, siteUrl, siteDescription, commissionRate, currency, stripeEnabled, razorpayEnabled, emailNotificationsEnabled, googleSignInEnabled, googleClientId, googleClientSecret, maintenanceMode, maintenanceMessage, orderPrefix, orderSuffix, showFeaturedCourses, showFeaturedPackages, facebookPixelEnabled, facebookPixelId, facebookAccessToken, facebookPixelBaseCode, facebookTestEventCode, siteLogo, siteLogoLight, logoSize, logoSizeMobile, favicon, metaTitle, metaDescription } = req.body;
  const existing = await db.select().from(platformSettingsTable).limit(1);
  const updates: Record<string, unknown> = {};
  if (siteName !== undefined) updates.siteName = siteName;
  if (siteUrl !== undefined) {
    // Normalise siteUrl to origin-only (e.g. "https://academy.com") so any
    // path/query/trailing-slash an admin pastes is stripped before persisting.
    // Empty / whitespace clears the value (falls back to deployment default).
    // If the input is not a valid absolute http(s) URL, we reject the request
    // so bad data never enters the DB and breaks affiliate links / emails.
    const raw = String(siteUrl).trim();
    if (raw === "") {
      updates.siteUrl = "";
    } else {
      let normalised: string | null = null;
      try {
        const u = new URL(raw);
        if (u.protocol === "http:" || u.protocol === "https:") normalised = u.origin;
      } catch { /* invalid */ }
      if (!normalised) {
        res.status(400).json({ error: "siteUrl must be a valid absolute URL starting with http:// or https://" });
        return;
      }
      updates.siteUrl = normalised;
    }
  }
  if (siteDescription !== undefined) updates.siteDescription = siteDescription;
  if (commissionRate !== undefined) updates.commissionRate = Math.round(commissionRate * 100);
  if (currency !== undefined) updates.currency = currency;
  if (stripeEnabled !== undefined) updates.stripeEnabled = stripeEnabled;
  if (razorpayEnabled !== undefined) updates.razorpayEnabled = razorpayEnabled;
  if (emailNotificationsEnabled !== undefined) updates.emailNotificationsEnabled = emailNotificationsEnabled;
  if (googleSignInEnabled !== undefined) updates.googleSignInEnabled = googleSignInEnabled;
  if (googleClientId !== undefined) updates.googleClientId = googleClientId;
  if (googleClientSecret !== undefined) updates.googleClientSecret = googleClientSecret;
  if (maintenanceMode !== undefined) updates.maintenanceMode = maintenanceMode;
  if (maintenanceMessage !== undefined) updates.maintenanceMessage = maintenanceMessage;
  if (orderPrefix !== undefined) updates.orderPrefix = orderPrefix;
  if (orderSuffix !== undefined) updates.orderSuffix = orderSuffix;
  if (showFeaturedCourses !== undefined) updates.showFeaturedCourses = showFeaturedCourses;
  if (showFeaturedPackages !== undefined) updates.showFeaturedPackages = showFeaturedPackages;
  if (facebookPixelEnabled !== undefined) updates.facebookPixelEnabled = facebookPixelEnabled;
  if (facebookPixelId !== undefined) updates.facebookPixelId = facebookPixelId;
  if (facebookAccessToken !== undefined) updates.facebookAccessToken = facebookAccessToken;
  if (facebookPixelBaseCode !== undefined) updates.facebookPixelBaseCode = facebookPixelBaseCode;
  if (facebookTestEventCode !== undefined) updates.facebookTestEventCode = facebookTestEventCode;
  if (siteLogo !== undefined) updates.siteLogo = siteLogo;
  if (siteLogoLight !== undefined) updates.siteLogoLight = siteLogoLight;
  if (logoSize !== undefined) updates.logoSize = Number(logoSize);
  if (logoSizeMobile !== undefined) updates.logoSizeMobile = Number(logoSizeMobile);
  if (favicon !== undefined) updates.favicon = favicon;
  if (metaTitle !== undefined) updates.metaTitle = metaTitle;
  if (metaDescription !== undefined) updates.metaDescription = metaDescription;

  if (existing.length === 0) {
    await db.insert(platformSettingsTable).values({});
  }
  const [updated] = await db.update(platformSettingsTable).set(updates).returning();
  // Drop the cached site URL so changes (e.g. switching to a custom domain)
  // take effect immediately for outgoing email links instead of waiting up to
  // 60s for the in-process cache TTL to expire.
  if (updates.siteUrl !== undefined) invalidatePublicBaseUrlCache();
  res.json({ ...updated, commissionRate: updated.commissionRate / 100 });
});

router.get("/orders", requireAdmin, async (req, res): Promise<void> => {
  const { search, status, gateway, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status && status !== "all") conditions.push(eq(paymentsTable.status, status as "pending" | "completed" | "failed" | "refunded"));
  if (gateway && gateway !== "all") conditions.push(eq(paymentsTable.gateway, gateway as "stripe" | "razorpay"));

  const baseQuery = db
    .select({
      id: paymentsTable.id,
      userId: paymentsTable.userId,
      courseId: paymentsTable.courseId,
      bundleId: paymentsTable.bundleId,
      amount: paymentsTable.amount,
      currency: paymentsTable.currency,
      status: paymentsTable.status,
      gateway: paymentsTable.gateway,
      couponCode: paymentsTable.couponCode,
      paymentId: paymentsTable.paymentId,
      gatewayOrderId: paymentsTable.gatewayOrderId,
      createdAt: paymentsTable.createdAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
      courseTitle: coursesTable.title,
      bundleTitle: bundlesTable.name,
      billingMobile: paymentsTable.billingMobile,
      billingState: paymentsTable.billingState,
    })
    .from(paymentsTable)
    .innerJoin(usersTable, eq(paymentsTable.userId, usersTable.id))
    .leftJoin(coursesTable, eq(paymentsTable.courseId, coursesTable.id))
    .leftJoin(bundlesTable, eq(paymentsTable.bundleId, bundlesTable.id));

  let orders = await baseQuery.where(conditions.length > 0 ? and(...conditions) : undefined).orderBy(desc(paymentsTable.createdAt)).limit(parseInt(limit)).offset(parseInt(offset));

  if (search) {
    const s = search.toLowerCase();
    orders = orders.filter(o =>
      o.userName.toLowerCase().includes(s) ||
      o.userEmail.toLowerCase().includes(s) ||
      (o.courseTitle ?? "").toLowerCase().includes(s) ||
      (o.bundleTitle ?? "").toLowerCase().includes(s) ||
      String(o.id).includes(s)
    );
  }

  const [totalResult] = await db.select({ total: count() }).from(paymentsTable).where(conditions.length > 0 ? and(...conditions) : undefined);
  const [revenueResult] = await db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(eq(paymentsTable.status, "completed"));
  const [pendingResult] = await db.select({ total: count() }).from(paymentsTable).where(eq(paymentsTable.status, "pending"));
  const [refundedResult] = await db.select({ total: count() }).from(paymentsTable).where(eq(paymentsTable.status, "refunded"));

  res.json({
    orders,
    total: totalResult?.total ?? 0,
    stats: {
      totalRevenue: parseFloat(String(revenueResult?.total ?? 0)),
      totalOrders: totalResult?.total ?? 0,
      pendingOrders: pendingResult?.total ?? 0,
      refundedOrders: refundedResult?.total ?? 0,
    }
  });
});

router.post("/orders/:orderId/refund", requireAdmin, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId);
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, orderId)).limit(1);
  if (!payment) { res.status(404).json({ error: "Order not found" }); return; }
  if (payment.status === "refunded") { res.status(400).json({ error: "Order already refunded" }); return; }
  if (payment.status !== "completed") { res.status(400).json({ error: "Only completed orders can be refunded" }); return; }

  // ── Attempt gateway-level refund ────────────────────────────────────────────
  let gatewayRefundId: string | null = null;
  let gatewayRefundWarning: string | null = null;
  const refundAmount = parseFloat(String(payment.amount));

  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, payment.gateway)).limit(1);

  if (gw && gw.apiKey && gw.secretKey) {
    try {
      if (payment.gateway === "cashfree") {
        // Use gatewayOrderId (the order_id we sent to Cashfree when creating the order)
        const cfOrderId = payment.gatewayOrderId;
        if (cfOrderId && !cfOrderId.startsWith("sim_") && !cfOrderId.startsWith("bnd_sim_")) {
          const host = gw.isTestMode ? "https://sandbox.cashfree.com" : "https://api.cashfree.com";
          const refundId = `ref_${nanoid(12)}`;
          const r = await fetch(`${host}/pg/orders/${cfOrderId}/refunds`, {
            method: "POST",
            headers: {
              "x-api-version": "2023-08-01",
              "x-client-id": gw.apiKey,
              "x-client-secret": gw.secretKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              refund_amount: refundAmount,
              refund_id: refundId,
              refund_note: "Admin initiated refund",
            }),
          });
          const data = await r.json();
          if (r.ok) {
            gatewayRefundId = data.cf_refund_id ?? data.refund_id ?? refundId;
          } else {
            gatewayRefundWarning = `Cashfree: ${data.message ?? data.error ?? "Refund API error"}`;
          }
        }

      } else if (payment.gateway === "razorpay") {
        // paymentId stores razorpay_payment_id (format: pay_xxx)
        const pid = payment.paymentId;
        if (pid && pid.startsWith("pay_")) {
          const creds = Buffer.from(`${gw.apiKey}:${gw.secretKey}`).toString("base64");
          const r = await fetch(`https://api.razorpay.com/v1/payments/${pid}/refund`, {
            method: "POST",
            headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/json" },
            body: JSON.stringify({ amount: Math.round(refundAmount * 100) }),
          });
          const data = await r.json();
          if (r.ok) {
            gatewayRefundId = data.id;
          } else {
            gatewayRefundWarning = `Razorpay: ${data.error?.description ?? "Refund API error"}`;
          }
        }

      } else if (payment.gateway === "stripe") {
        // paymentId stores payment_intent_id (format: pi_xxx)
        const pid = payment.paymentId;
        if (pid && pid.startsWith("pi_")) {
          const body = new URLSearchParams({ payment_intent: pid });
          const r = await fetch("https://api.stripe.com/v1/refunds", {
            method: "POST",
            headers: { Authorization: `Bearer ${gw.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
          });
          const data = await r.json();
          if (r.ok) {
            gatewayRefundId = data.id;
          } else {
            gatewayRefundWarning = `Stripe: ${data.error?.message ?? "Refund API error"}`;
          }
        }
      }
      // PayU and Paytm require complex checksum-based refund flows — those need to be handled via their dashboards
    } catch (err: unknown) {
      gatewayRefundWarning = `Gateway refund error: ${(err as Error).message}`;
    }
  }

  // Mark as refunded in our DB (always, regardless of gateway result)
  await db.update(paymentsTable).set({ status: "refunded" }).where(eq(paymentsTable.id, orderId));

  // Creator commission cleanup: cancel any earned/pending-payout commissions
  // tied to this payment. Already-paid rows are flagged for manual claw-back.
  await cancelCreatorCommissionsForPayment(orderId);

  const [refundUser] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);

  // Collect all course IDs to unenroll from
  const courseIdsToUnenroll: number[] = [];
  if (payment.courseId) {
    courseIdsToUnenroll.push(payment.courseId);
    // Fire refund automation for course orders
    const [refundCourse] = await db.select().from(coursesTable).where(eq(coursesTable.id, payment.courseId)).limit(1);
    if (refundUser && refundCourse) {
      triggerAutomation("refund", refundUser.id, refundUser.email, {
        name: refundUser.name,
        email: refundUser.email,
        course_name: refundCourse.title,
        amount: String(parseFloat(String(payment.amount)).toFixed(2)),
      }).catch(() => {});
    }
  } else if (payment.bundleId) {
    // Bundle refund — collect all courses in the bundle
    const bundleCourses = await db.select({ courseId: bundleCoursesTable.courseId }).from(bundleCoursesTable).where(eq(bundleCoursesTable.bundleId, payment.bundleId));
    for (const bc of bundleCourses) courseIdsToUnenroll.push(bc.courseId);
    const [refundBundle] = await db.select().from(bundlesTable).where(eq(bundlesTable.id, payment.bundleId)).limit(1);
    if (refundUser && refundBundle) {
      triggerAutomation("refund", refundUser.id, refundUser.email, {
        name: refundUser.name,
        email: refundUser.email,
        course_name: refundBundle.name,
        amount: String(parseFloat(String(payment.amount)).toFixed(2)),
      }).catch(() => {});
    }
  }

  // Remove lesson completions and enrollments for every affected course
  for (const cid of courseIdsToUnenroll) {
    const courseModules = await db.select({ id: modulesTable.id }).from(modulesTable).where(eq(modulesTable.courseId, cid));
    for (const mod of courseModules) {
      const modLessons = await db.select({ id: lessonsTable.id }).from(lessonsTable).where(eq(lessonsTable.moduleId, mod.id));
      for (const lesson of modLessons) {
        await db.delete(lessonCompletionsTable).where(and(eq(lessonCompletionsTable.userId, payment.userId), eq(lessonCompletionsTable.lessonId, lesson.id)));
      }
    }
    await db.delete(enrollmentsTable).where(and(eq(enrollmentsTable.userId, payment.userId), eq(enrollmentsTable.courseId, cid)));
  }

  const label = payment.bundleId ? "package" : "course";
  res.json({
    message: `Refund processed. User has been unenrolled from the ${label}.`,
    gatewayRefundId,
    gatewayRefundWarning,
  });
});

// ── Sync Cashfree Transaction ID for an existing order ───────────────────────
router.post("/orders/:orderId/sync-cashfree-id", requireAdmin, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, orderId)).limit(1);
  if (!payment) { res.status(404).json({ error: "Order not found" }); return; }
  if (payment.gateway !== "cashfree") { res.status(400).json({ error: "Only applicable for Cashfree orders" }); return; }
  if (!payment.gatewayOrderId) { res.status(400).json({ error: "No Cashfree order ID on record" }); return; }

  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, "cashfree")).limit(1);
  if (!gw) { res.status(400).json({ error: "Cashfree gateway not configured" }); return; }

  const host = gw.isTestMode ? "https://sandbox.cashfree.com" : "https://api.cashfree.com";
  try {
    const r = await fetch(`${host}/pg/orders/${payment.gatewayOrderId}/payments`, {
      headers: { "x-api-version": "2023-08-01", "x-client-id": gw.apiKey, "x-client-secret": gw.secretKey },
    });
    const pList = await r.json();
    if (!r.ok) { res.status(400).json({ error: pList.message ?? "Cashfree API error" }); return; }

    const successPay = Array.isArray(pList)
      ? (pList.find((p: { payment_status?: string }) => p.payment_status === "SUCCESS") ?? pList[0])
      : null;

    if (!successPay?.cf_payment_id) { res.status(404).json({ error: "No successful Cashfree payment found for this order" }); return; }

    const cfTxnId = String(successPay.cf_payment_id);
    await db.update(paymentsTable).set({ paymentId: cfTxnId }).where(eq(paymentsTable.id, orderId));
    res.json({ success: true, paymentId: cfTxnId });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Bulk delete orders ────────────────────────────────────────────────────────
router.delete("/orders/bulk", requireAdmin, async (req, res): Promise<void> => {
  const { ids } = req.body as { ids?: unknown };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array" });
    return;
  }
  const orderIds = (ids as unknown[]).map(Number).filter(n => !isNaN(n));
  if (orderIds.length === 0) { res.status(400).json({ error: "No valid order ids" }); return; }

  const payments = await db.select().from(paymentsTable).where(inArray(paymentsTable.id, orderIds));

  for (const payment of payments) {
    if (payment.status === "completed") {
      const courseIdsToRevoke: number[] = [];
      if (payment.courseId) {
        courseIdsToRevoke.push(payment.courseId);
      } else if (payment.bundleId) {
        const bundleCourses = await db.select({ courseId: bundleCoursesTable.courseId }).from(bundleCoursesTable).where(eq(bundleCoursesTable.bundleId, payment.bundleId));
        for (const bc of bundleCourses) courseIdsToRevoke.push(bc.courseId);
      }
      for (const cid of courseIdsToRevoke) {
        const courseModules = await db.select({ id: modulesTable.id }).from(modulesTable).where(eq(modulesTable.courseId, cid));
        for (const mod of courseModules) {
          const modLessons = await db.select({ id: lessonsTable.id }).from(lessonsTable).where(eq(lessonsTable.moduleId, mod.id));
          for (const lesson of modLessons) {
            await db.delete(lessonCompletionsTable).where(and(eq(lessonCompletionsTable.userId, payment.userId), eq(lessonCompletionsTable.lessonId, lesson.id)));
          }
        }
        await db.delete(enrollmentsTable).where(and(eq(enrollmentsTable.userId, payment.userId), eq(enrollmentsTable.courseId, cid)));
      }
    }
  }

  await db.delete(paymentsTable).where(inArray(paymentsTable.id, orderIds));
  res.json({ deleted: orderIds.length });
});

router.delete("/orders/:orderId", requireAdmin, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, orderId)).limit(1);
  if (!payment) { res.status(404).json({ error: "Order not found" }); return; }

  // If order was completed, revoke enrollment and lesson progress
  if (payment.status === "completed") {
    const courseIdsToRevoke: number[] = [];
    if (payment.courseId) {
      courseIdsToRevoke.push(payment.courseId);
    } else if (payment.bundleId) {
      const bundleCourses = await db.select({ courseId: bundleCoursesTable.courseId }).from(bundleCoursesTable).where(eq(bundleCoursesTable.bundleId, payment.bundleId));
      for (const bc of bundleCourses) courseIdsToRevoke.push(bc.courseId);
    }
    for (const cid of courseIdsToRevoke) {
      const courseModules = await db.select({ id: modulesTable.id }).from(modulesTable).where(eq(modulesTable.courseId, cid));
      for (const mod of courseModules) {
        const modLessons = await db.select({ id: lessonsTable.id }).from(lessonsTable).where(eq(lessonsTable.moduleId, mod.id));
        for (const lesson of modLessons) {
          await db.delete(lessonCompletionsTable).where(and(eq(lessonCompletionsTable.userId, payment.userId), eq(lessonCompletionsTable.lessonId, lesson.id)));
        }
      }
      await db.delete(enrollmentsTable).where(and(eq(enrollmentsTable.userId, payment.userId), eq(enrollmentsTable.courseId, cid)));
    }
  }

  // Delete payment (GST invoice paymentId auto-nulled via SET NULL FK)
  await db.delete(paymentsTable).where(eq(paymentsTable.id, orderId));

  res.json({ success: true });
});

// ── Payment Gateways ──────────────────────────────────────────────────────────
const SUPPORTED_GATEWAYS = [
  { name: "stripe", displayName: "Stripe", keyLabel: "Publishable Key", secretLabel: "Secret Key", supportedCountries: "Global" },
  { name: "razorpay", displayName: "Razorpay", keyLabel: "Key ID", secretLabel: "Key Secret", supportedCountries: "India" },
  { name: "cashfree", displayName: "Cashfree", keyLabel: "App ID", secretLabel: "Secret Key", supportedCountries: "India" },
  { name: "paytm", displayName: "Paytm Payments", keyLabel: "Merchant ID", secretLabel: "Merchant Key", supportedCountries: "India" },
  { name: "payu", displayName: "PayU", keyLabel: "Merchant Key", secretLabel: "Merchant Salt", supportedCountries: "India" },
];

const maskValue = (v: string | null | undefined) =>
  v ? v.replace(/./g, "•") : "";

router.get("/payment-gateways", requireAdmin, async (req, res): Promise<void> => {
  const gateways = await db.select().from(paymentGatewaysTable);
  const result = SUPPORTED_GATEWAYS.map(sg => {
    const config = gateways.find(g => g.name === sg.name);
    return {
      ...sg,
      id: config?.id ?? null,
      apiKey: config?.apiKey ?? "",
      secretKey: maskValue(config?.secretKey),
      webhookSecret: maskValue(config?.webhookSecret),
      isActive: config?.isActive ?? false,
      isTestMode: config?.isTestMode ?? true,
      isConfigured: !!(config?.apiKey && config?.secretKey),
    };
  });
  res.json(result);
});

router.put("/payment-gateways/:name", requireAdmin, async (req, res): Promise<void> => {
  const { name } = req.params;
  const supported = SUPPORTED_GATEWAYS.find(g => g.name === name);
  if (!supported) { res.status(400).json({ error: "Unsupported gateway" }); return; }

  const { apiKey, secretKey, webhookSecret, isActive, isTestMode } = req.body;

  const [existing] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, name)).limit(1);

  if (existing) {
    const update: { isActive: boolean; isTestMode: boolean; updatedAt: Date; apiKey?: string; secretKey?: string; webhookSecret?: string | null } = {
      isActive: isActive ?? existing.isActive,
      isTestMode: isTestMode ?? existing.isTestMode,
      updatedAt: new Date(),
    };
    const isBulletMask = (v: string | undefined) => typeof v === "string" && v.length > 0 && /^•+$/.test(v);
    const trimmedApiKey = typeof apiKey === "string" ? apiKey.trim() : apiKey;
    const trimmedSecretKey = typeof secretKey === "string" ? secretKey.trim() : secretKey;
    if (!isBulletMask(trimmedApiKey) && trimmedApiKey !== "") update.apiKey = trimmedApiKey;
    if (!isBulletMask(trimmedSecretKey) && trimmedSecretKey !== "") update.secretKey = trimmedSecretKey;
    if (webhookSecret !== undefined && !isBulletMask(webhookSecret)) update.webhookSecret = webhookSecret?.trim() || null;
    const [updated] = await db.update(paymentGatewaysTable).set(update).where(eq(paymentGatewaysTable.name, name)).returning();
    res.json({ ...updated, secretKey: maskValue(updated.secretKey), webhookSecret: maskValue(updated.webhookSecret) });
  } else {
    if (!apiKey || !secretKey) { res.status(400).json({ error: "API Key and Secret Key are required" }); return; }
    const [created] = await db.insert(paymentGatewaysTable).values({
      name, displayName: supported.displayName,
      apiKey, secretKey, webhookSecret: webhookSecret || null,
      isActive: isActive ?? false, isTestMode: isTestMode ?? true,
    }).returning();
    res.json({ ...created, secretKey: maskValue(created.secretKey), webhookSecret: maskValue(created.webhookSecret) });
  }
});

router.delete("/payment-gateways/:name", requireAdmin, async (req, res): Promise<void> => {
  const { name } = req.params;
  await db.delete(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, name));
  res.json({ message: "Gateway configuration removed" });
});

router.get("/payment-gateways/:name/test", requireAdmin, async (req, res): Promise<void> => {
  const { name } = req.params;
  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.name, name)).limit(1);
  if (!gw || !gw.apiKey || !gw.secretKey) { res.status(400).json({ error: "Gateway not configured" }); return; }

  try {
    if (name === "razorpay") {
      const creds = Buffer.from(`${gw.apiKey}:${gw.secretKey}`).toString("base64");
      const r = await fetch("https://api.razorpay.com/v1/orders?count=1", { headers: { Authorization: `Basic ${creds}` } });
      if (!r.ok) throw new Error(`Razorpay API error: ${r.status}`);
    } else if (name === "stripe") {
      const r = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${gw.secretKey}` } });
      if (!r.ok) throw new Error(`Stripe API error: ${r.status}`);
    } else if (name === "cashfree") {
      const r = await fetch(`https://${gw.isTestMode ? "sandbox" : "api"}.cashfree.com/pg/orders?limit=1`, {
        headers: { "x-api-version": "2023-08-01", "x-client-id": gw.apiKey, "x-client-secret": gw.secretKey }
      });
      if (r.status === 401) throw new Error("Invalid Cashfree credentials");
    } else {
      res.json({ success: true, message: `${name} credentials saved (connection test not available for this gateway)` }); return;
    }
    res.json({ success: true, message: "Connection successful! Gateway is configured correctly." });
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/* ── Public: maintenance status (no auth required) ──
 * Admins/staff bypass maintenance even when it's enabled — they can still
 * access the site to fix things. Bypass is decided server-side (via the auth
 * cookie) so the inline maintenance gate in index.html can act on the result
 * without any client-side flash.
 */
router.get("/public/maintenance", async (req, res): Promise<void> => {
  let isAdmin = false;
  try {
    const token = (req as Request & { cookies?: { token?: string } }).cookies?.token;
    if (token) {
      const payload = verifyToken(token);
      if (payload?.role === "admin" || payload?.role === "staff") isAdmin = true;
    }
  } catch { /* invalid token → treat as anonymous */ }

  const settings = await db.select({
    maintenanceMode: platformSettingsTable.maintenanceMode,
    maintenanceMessage: platformSettingsTable.maintenanceMessage,
  }).from(platformSettingsTable).limit(1);

  // Cache-bust: maintenance status must be fresh on every check
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (settings.length === 0) {
    res.json({ maintenanceMode: false, maintenanceMessage: null, isAdmin });
    return;
  }
  res.json({ ...settings[0], isAdmin });
});

/* ── Public: homepage section visibility (no auth required) ── */
router.get("/public/homepage-visibility", async (_req, res): Promise<void> => {
  const settings = await db.select({
    showFeaturedCourses: platformSettingsTable.showFeaturedCourses,
    showFeaturedPackages: platformSettingsTable.showFeaturedPackages,
  }).from(platformSettingsTable).limit(1);
  if (settings.length === 0) {
    res.json({ showFeaturedCourses: true, showFeaturedPackages: true });
    return;
  }
  res.json(settings[0]);
});

/* ── Public: site branding (no auth required) ── */
router.get("/public/branding", async (_req, res): Promise<void> => {
  const settings = await db.select({
    siteName: platformSettingsTable.siteName,
    siteLogo: platformSettingsTable.siteLogo,
    siteLogoLight: platformSettingsTable.siteLogoLight,
    logoSize: platformSettingsTable.logoSize,
    logoSizeMobile: platformSettingsTable.logoSizeMobile,
    favicon: platformSettingsTable.favicon,
    metaTitle: platformSettingsTable.metaTitle,
    metaDescription: platformSettingsTable.metaDescription,
  }).from(platformSettingsTable).limit(1);
  if (settings.length === 0) {
    res.json({ siteName: "Academy", siteLogo: null, siteLogoLight: null, logoSize: 34, logoSizeMobile: 28, favicon: null, metaTitle: null, metaDescription: null });
    return;
  }
  res.json(settings[0]);
});

export default router;
