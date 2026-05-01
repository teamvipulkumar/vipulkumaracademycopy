import { Router } from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "@workspace/db";
import { usersTable, adminStaffTable } from "@workspace/db";
import { DEFAULT_PERMISSIONS } from "@workspace/db";
import type { StaffPermissions } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin, type JwtPayload } from "../middlewares/auth";
import type { Request } from "express";

const router = Router();
type AuthedRequest = Request & { user: JwtPayload };

router.get("/", requireAdmin, async (req, res): Promise<void> => {
  const staff = await db
    .select()
    .from(adminStaffTable)
    .orderBy(desc(adminStaffTable.createdAt));
  res.json(staff);
});

router.post("/", requireAdmin, async (req: Request, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const { email, name, roleName, permissions, notes } = req.body as {
    email: string; name: string; roleName: string;
    permissions: StaffPermissions; notes?: string;
  };

  if (!email || !name || !roleName || !permissions) {
    res.status(400).json({ error: "email, name, roleName, and permissions are required" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  let targetUser = existing[0];
  let generatedPassword: string | null = null;

  if (targetUser) {
    if (targetUser.role === "admin") {
      res.status(400).json({ error: "This user is already a super admin and cannot be added as staff." });
      return;
    }
    const alreadyStaff = await db.select().from(adminStaffTable).where(eq(adminStaffTable.userId, targetUser.id)).limit(1);
    if (alreadyStaff.length > 0) {
      res.status(400).json({ error: "This user is already a staff member." });
      return;
    }
  } else {
    // Generate a friendly temp password (12 chars, mixed case + digits) and
    // RETURN it once so the admin can share it with the new staff member.
    // Without this, the new account is unusable until the staff member uses
    // the forgot-password flow.
    generatedPassword = nanoid(12);
    const hashed = await bcrypt.hash(generatedPassword, 10);
    const referralCode = nanoid(8).toUpperCase();
    const [created] = await db.insert(usersTable).values({
      email: email.toLowerCase(),
      password: hashed,
      name,
      referralCode,
      role: "student",
      emailVerified: true,
    }).returning();
    targetUser = created;
  }

  // Source of truth for staff status is the admin_staff table, NOT the
  // user's `role` column. We deliberately do NOT mutate user.role anymore
  // because (a) the role enum doesn't include "staff" so the previous TS
  // cast was a hack, and (b) overwriting "affiliate" to "staff" silently
  // broke affiliate features for that user. The requireAdmin middleware
  // now checks the JWT `isStaff` flag instead.
  const previousRole = targetUser.role;

  const [staffRecord] = await db.insert(adminStaffTable).values({
    userId: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    roleName,
    permissions: permissions ?? DEFAULT_PERMISSIONS,
    previousRole,
    status: "active",
    invitedBy: authed.user.userId,
    notes: notes ?? null,
  }).returning();

  res.status(201).json({ ...staffRecord, generatedPassword });
});

router.patch("/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { roleName, permissions, notes } = req.body as {
    roleName?: string; permissions?: StaffPermissions; notes?: string;
  };

  const updates: Partial<typeof adminStaffTable.$inferInsert> = { updatedAt: new Date() };
  if (roleName !== undefined) updates.roleName = roleName;
  if (permissions !== undefined) updates.permissions = permissions;
  if (notes !== undefined) updates.notes = notes;

  const [updated] = await db.update(adminStaffTable).set(updates).where(eq(adminStaffTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Staff member not found" }); return; }
  res.json(updated);
});

router.post("/:id/revoke", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [staff] = await db.select().from(adminStaffTable).where(eq(adminStaffTable.id, id)).limit(1);
  if (!staff) { res.status(404).json({ error: "Staff member not found" }); return; }

  // user.role is left untouched — see notes in the create handler. The
  // staff "active" flag alone determines admin-panel access.
  const [updated] = await db.update(adminStaffTable).set({ status: "revoked", updatedAt: new Date() }).where(eq(adminStaffTable.id, id)).returning();
  res.json(updated);
});

router.post("/:id/restore", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [staff] = await db.select().from(adminStaffTable).where(eq(adminStaffTable.id, id)).limit(1);
  if (!staff) { res.status(404).json({ error: "Staff member not found" }); return; }

  const [updated] = await db.update(adminStaffTable).set({ status: "active", updatedAt: new Date() }).where(eq(adminStaffTable.id, id)).returning();
  res.json(updated);
});

router.delete("/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [staff] = await db.select().from(adminStaffTable).where(eq(adminStaffTable.id, id)).limit(1);
  if (!staff) { res.status(404).json({ error: "Staff member not found" }); return; }

  await db.delete(adminStaffTable).where(eq(adminStaffTable.id, id));
  res.json({ success: true });
});

export default router;
