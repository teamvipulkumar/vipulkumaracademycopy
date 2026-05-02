import { Router } from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "@workspace/db";
import { usersTable, platformSettingsTable, adminStaffTable, creatorsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { signToken, requireAuth, authCookieOptions, clearAuthCookieOptions, type JwtPayload } from "../middlewares/auth";
import type { Request } from "express";
import { triggerAutomation, triggerFunnel, sendTransactionalEmail, getPublicBaseUrl, publicSiteUrlFromRequest } from "./crm";
import { OAuth2Client } from "google-auth-library";

const router = Router();

/**
 * Resolves the public site URL used in outgoing emails (verify, reset, login
 * confirmation, etc.) and external redirects. Precedence (highest first):
 *
 *   1. The live incoming request's protocol + hostname. With `trust proxy = 1`
 *      in app.ts, req.protocol + req.hostname honor X-Forwarded-Proto and
 *      X-Forwarded-Host so this is the *exact* public domain the user is
 *      currently on. This is the right default: if the user is signing up at
 *      vipulkumar.online, their verification link should land at
 *      vipulkumar.online (not at some other hostname the admin once configured
 *      and forgot about). Localhost / unset hostnames are skipped so this
 *      never poisons emails triggered from server-to-server callers.
 *   2. `getPublicBaseUrl()` — admin-configured Site URL → auto-learned
 *      last-observed host → SITE_URL env. This is the fallback for the rare
 *      case where the request hostname is local/missing.
 *   3. Final fallback: reconstruct from the request as-is.
 *
 * Net effect for the admin: zero configuration required. Connect any custom
 * domain via Replit Deployments and every email link follows automatically.
 */
async function resolvePublicSiteUrl(req: Request): Promise<string> {
  const fromReq = publicSiteUrlFromRequest(req);
  if (fromReq) return fromReq;
  const fromHelper = await getPublicBaseUrl();
  if (fromHelper) return fromHelper.replace(/\/+$/, "");
  return `${req.protocol}://${req.hostname}`;
}

/* ── Build the HTML body for verification emails ── */
function buildVerificationEmailHtml(name: string, verifyLink: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:40px;box-sizing:border-box;">
<tr><td>
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Verify your email address</h1>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">Hi ${name},</p>
  <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#374151;">
    Thanks for signing up for <strong>Vipul Kumar Academy</strong>! Please verify your email address to activate your account.
  </p>
  <p style="text-align:center;margin:0 0 28px;">
    <a href="${verifyLink}" style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:600;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;">
      Verify My Email
    </a>
  </p>
  <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Or copy and paste this link in your browser:</p>
  <p style="margin:0 0 28px;font-size:12px;color:#2563eb;word-break:break-all;">${verifyLink}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
  <p style="margin:0;font-size:12px;color:#9ca3af;">This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

router.post("/register", async (req, res): Promise<void> => {
  const { email, password, name, phone, referralCode: referredBy } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ error: "email, password, and name are required" });
    return;
  }
  if (!phone || !phone.trim()) {
    res.status(400).json({ error: "Mobile number is required" });
    return;
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }
  const hashed = await bcrypt.hash(password, 10);
  const referralCode = nanoid(8).toUpperCase();
  const verifyToken = nanoid(40);
  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [user] = await db.insert(usersTable).values({
    email,
    password: hashed,
    name,
    phone: phone.trim(),
    referralCode,
    role: "student",
    emailVerified: false,
    emailVerifyToken: verifyToken,
    emailVerifyTokenExpiresAt: verifyExpiresAt,
  }).returning();

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  res.cookie("token", token, authCookieOptions());
  const { password: _, emailVerifyToken: _vt, emailVerifyTokenExpiresAt: _vte, resetToken: _rt, resetTokenExpiresAt: _rte, ...safeUser } = user;
  res.status(201).json({ user: safeUser, message: "Registered successfully" });

  // Fire off both welcome automation and verification email (don't block response)
  const origin = await resolvePublicSiteUrl(req);
  const verifyLink = `${origin}/verify-email?token=${verifyToken}`;
  triggerAutomation("welcome", user.id, user.email, { name: user.name, email: user.email, verify_link: verifyLink }).catch(e => console.error("[register] triggerAutomation error:", e));
  triggerFunnel("user_signup", user.id, { verify_link: verifyLink, site_url: origin, name: user.name, email: user.email }).catch(e => console.error("[register] triggerFunnel error:", e));
  sendTransactionalEmail(
    user.email,
    "Please verify your email — Vipul Kumar Academy",
    buildVerificationEmailHtml(user.name, verifyLink),
  ).catch(() => {});
});

router.post("/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (user.isBanned) {
    res.status(403).json({ error: "Account is banned" });
    return;
  }
  const [staffRecord] = await db.select().from(adminStaffTable)
    .where(and(eq(adminStaffTable.userId, user.id), eq(adminStaffTable.status, "active")))
    .limit(1);
  const isStaff = !!staffRecord;
  const staffPermissions = staffRecord?.permissions ?? null;
  const [creatorRecord] = await db.select({ id: creatorsTable.id }).from(creatorsTable)
    .where(and(eq(creatorsTable.userId, user.id), eq(creatorsTable.status, "active")))
    .limit(1);
  const isCreator = !!creatorRecord;
  const token = signToken({ userId: user.id, email: user.email, role: user.role, isStaff, staffPermissions, isCreator });
  res.cookie("token", token, authCookieOptions());
  const { password: _, emailVerifyToken: _vt, emailVerifyTokenExpiresAt: _vte, resetToken: _rt, resetTokenExpiresAt: _rte, ...safeUser } = user;
  res.json({ user: { ...safeUser, isStaff, staffPermissions, isCreator }, message: "Login successful" });
  const loginOrigin = await resolvePublicSiteUrl(req);
  triggerFunnel("user_login", user.id, { site_url: loginOrigin }).catch(() => {});
});

router.post("/logout", (req, res): void => {
  res.clearCookie("token", clearAuthCookieOptions());
  res.json({ message: "Logged out successfully" });
});

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as Request & { user: JwtPayload }).user;
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId)).limit(1);
  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [staffRecord] = await db.select().from(adminStaffTable)
    .where(and(eq(adminStaffTable.userId, dbUser.id), eq(adminStaffTable.status, "active")))
    .limit(1);
  const isStaff = !!staffRecord;
  const staffPermissions = staffRecord?.permissions ?? null;
  const [creatorRecord] = await db.select({ id: creatorsTable.id }).from(creatorsTable)
    .where(and(eq(creatorsTable.userId, dbUser.id), eq(creatorsTable.status, "active")))
    .limit(1);
  const isCreator = !!creatorRecord;
  const { password: _, emailVerifyToken: _vt, emailVerifyTokenExpiresAt: _vte, resetToken: _rt, resetTokenExpiresAt: _rte, ...safeUser } = dbUser;
  res.json({ ...safeUser, isStaff, staffPermissions, isCreator });
});

/* ── Verify email via token from link ── */
router.get("/verify-email", async (req, res): Promise<void> => {
  const { token } = req.query as { token?: string };
  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.emailVerifyToken, token)).limit(1);
  if (!user) {
    res.status(400).json({ error: "Invalid verification link" });
    return;
  }
  if (user.emailVerified) {
    res.json({ message: "Email already verified" });
    return;
  }
  if (!user.emailVerifyTokenExpiresAt || user.emailVerifyTokenExpiresAt < new Date()) {
    res.status(400).json({ error: "This verification link has expired. Please request a new one." });
    return;
  }
  await db.update(usersTable).set({
    emailVerified: true,
    emailVerifyToken: null,
    emailVerifyTokenExpiresAt: null,
  }).where(eq(usersTable.id, user.id));
  res.json({ message: "Email verified successfully! You can now access all features." });
});

/* ── Resend verification email (must be logged in) ── */
router.post("/resend-verify-email", requireAuth, async (req, res): Promise<void> => {
  const auth = (req as Request & { user: JwtPayload }).user;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.emailVerified) {
    res.json({ message: "Your email is already verified." });
    return;
  }
  const verifyToken = nanoid(40);
  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.update(usersTable).set({ emailVerifyToken: verifyToken, emailVerifyTokenExpiresAt: verifyExpiresAt }).where(eq(usersTable.id, user.id));

  const origin = await resolvePublicSiteUrl(req);
  const verifyLink = `${origin}/verify-email?token=${verifyToken}`;
  sendTransactionalEmail(
    user.email,
    "Please verify your email — Vipul Kumar Academy",
    buildVerificationEmailHtml(user.name, verifyLink),
  ).catch(() => {});
  res.json({ message: "Verification email sent. Please check your inbox." });
});

router.post("/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (user) {
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.update(usersTable).set({ resetToken: token, resetTokenExpiresAt: expiresAt }).where(eq(usersTable.id, user.id));
    const origin = await resolvePublicSiteUrl(req);
    const resetLink = `${origin}/reset-password?token=${token}`;
    triggerAutomation("forgot_password", user.id, user.email, { name: user.name, email: user.email, reset_link: resetLink }).catch(() => {});
    triggerFunnel("forgot_password", user.id, { reset_link: resetLink, name: user.name, email: user.email }).catch(() => {});
  }
  res.json({ message: "If that email exists, a reset link has been sent" });
});

router.post("/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body;
  if (!token || !password) {
    res.status(400).json({ error: "token and password are required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.resetToken, token)).limit(1);
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }
  const hashed = await bcrypt.hash(password, 10);
  await db.update(usersTable).set({ password: hashed, resetToken: null, resetTokenExpiresAt: null }).where(eq(usersTable.id, user.id));
  res.json({ message: "Password reset successfully" });
});

/* ── Change password while logged in.
 *
 * Requires the user to prove ownership of the current password before we
 * accept a new one — this prevents an attacker who hijacks an active session
 * (open laptop, stolen cookie, etc.) from silently replacing the password and
 * locking the real owner out. If the user can't remember their current
 * password they should use the public /forgot-password flow instead.
 *
 * Notes:
 *  - We use bcrypt.compare to verify the current password against the stored
 *    hash; never compare plaintext directly.
 *  - We re-fetch the user from the DB rather than trusting the JWT payload,
 *    so a stale token can't bypass a recent ban or password rotation.
 *  - We intentionally use a generic "Current password is incorrect" error to
 *    avoid leaking which field failed.
 */
router.post("/change-password", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as Request & { user?: JwtPayload };
  if (!authReq.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { currentPassword, newPassword } = req.body ?? {};
  // Hardened type checks: reject any non-string payloads up-front so a
  // malformed/JSON-injected body can never reach bcrypt.compare (which throws
  // on non-string input and would surface as a 500).
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "Current and new password are required" });
    return;
  }
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(400).json({ error: "New password must be different from current password" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, authReq.user.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({
    password: hashed,
    // Clear any pending reset token so a previously-emailed reset link from
    // before this change can no longer be used.
    resetToken: null,
    resetTokenExpiresAt: null,
  }).where(eq(usersTable.id, user.id));

  // Re-issue the auth cookie on the current device so the active session
  // gets a freshly-issued JWT (issued AFTER the password change). Other
  // existing sessions are not invalidated by this alone — full multi-device
  // revocation would require a DB-backed token-version check in requireAuth,
  // which is intentionally out of scope here. Refreshing the current cookie
  // still helps in the common case where the user just changed their
  // password from a single device.
  const [staffRecord] = await db.select().from(adminStaffTable)
    .where(and(eq(adminStaffTable.userId, user.id), eq(adminStaffTable.status, "active")))
    .limit(1);
  const isStaff = !!staffRecord;
  const staffPermissions = staffRecord?.permissions ?? null;
  const [creatorRecord] = await db.select({ id: creatorsTable.id }).from(creatorsTable)
    .where(and(eq(creatorsTable.userId, user.id), eq(creatorsTable.status, "active")))
    .limit(1);
  const isCreator = !!creatorRecord;
  const newToken = signToken({ userId: user.id, email: user.email, role: user.role, isStaff, staffPermissions, isCreator });
  res.cookie("token", newToken, authCookieOptions());

  res.json({ message: "Password changed successfully" });
});

/* ── Update own profile (phone, name, avatarUrl) ── */
router.patch("/profile", requireAuth, async (req, res): Promise<void> => {
  const { phone, name, avatarUrl } = req.body;
  const authReq = req as Request & { user?: JwtPayload };
  if (!authReq.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const updates: Record<string, unknown> = {};
  if (name !== undefined && name.trim()) updates.name = name.trim();
  if (phone !== undefined) updates.phone = phone.trim() || null;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl || null;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, authReq.user.userId)).returning();
  const { password: _, emailVerifyToken: _vt, emailVerifyTokenExpiresAt: _vte, resetToken: _rt, resetTokenExpiresAt: _rte, ...safeUser } = updated;
  res.json(safeUser);
});

/* ── Public: returns whether Google Sign-In is enabled and the clientId ── */
router.get("/google-config", async (_req, res): Promise<void> => {
  const [settings] = await db.select({
    googleSignInEnabled: platformSettingsTable.googleSignInEnabled,
    googleClientId: platformSettingsTable.googleClientId,
  }).from(platformSettingsTable).limit(1);
  if (!settings || !settings.googleSignInEnabled || !settings.googleClientId?.trim()) {
    res.json({ enabled: false });
    return;
  }
  res.json({ enabled: true, clientId: settings.googleClientId.trim() });
});

/* ── Google OAuth Sign-In ── */
router.post("/google-login", async (req, res): Promise<void> => {
  const { accessToken } = req.body;
  if (!accessToken) {
    res.status(400).json({ error: "accessToken is required" });
    return;
  }

  let gUser: { email?: string; name?: string; picture?: string } = {};
  try {
    const infoRes = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!infoRes.ok) throw new Error("Failed to fetch Google user info");
    gUser = await infoRes.json();
  } catch {
    res.status(401).json({ error: "Invalid or expired Google access token" });
    return;
  }

  if (!gUser.email) {
    res.status(401).json({ error: "Could not retrieve email from Google account" });
    return;
  }

  const email = gUser.email.toLowerCase();
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  let isNewUser = false;
  if (!user) {
    isNewUser = true;
    const referralCode = nanoid(8).toUpperCase();
    const randomPassword = await bcrypt.hash(nanoid(32), 10);
    const [created] = await db.insert(usersTable).values({
      email,
      password: randomPassword,
      name: gUser.name ?? email.split("@")[0],
      avatarUrl: gUser.picture ?? null,
      referralCode,
      role: "student",
      emailVerified: true,
    }).returning();
    user = created;
    const googleOrigin = await resolvePublicSiteUrl(req);
    triggerAutomation("welcome", user.id, user.email, { name: user.name, email: user.email, verify_link: "" }).catch(() => {});
    triggerFunnel("user_signup", user.id, { verify_link: "", site_url: googleOrigin, name: user.name, email: user.email }).catch(e => console.error("[google signup] triggerFunnel error:", e));
  } else if (user.isBanned) {
    res.status(403).json({ error: "Account is banned" });
    return;
  }

  const jwtToken = signToken({ userId: user.id, email: user.email, role: user.role });
  res.cookie("token", jwtToken, authCookieOptions());
  const { password: _, emailVerifyToken: _vt, emailVerifyTokenExpiresAt: _vte, resetToken: _rt, resetTokenExpiresAt: _rte, ...safeUser } = user;
  res.json({ user: safeUser, isNewUser, message: "Signed in with Google" });
});

export default router;
