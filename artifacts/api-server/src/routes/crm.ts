import { Router } from "express";
import nodemailer from "nodemailer";
import { randomBytes, createHmac } from "crypto";
import { db } from "@workspace/db";
import {
  smtpSettingsTable, smtpAccountsTable, emailTemplatesTable, emailCampaignsTable,
  emailAutomationRulesTable, emailSendsTable, usersTable, enrollmentsTable,
  emailListsTable, emailListMembersTable,
  contactTagsTable, contactTagAssignmentsTable,
  emailSequencesTable, emailSequenceStepsTable, emailSequenceEnrollmentsTable,
  automationFunnelsTable, automationFunnelStepsTable, platformSettingsTable,
  funnelExecutionsTable, funnelExecutionStepsTable,
} from "@workspace/db";
import { eq, count, sql, and, notInArray, inArray, asc, ilike, gte, lte, or, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

/* ── helpers ── */
export async function getSmtp() {
  const [row] = await db.select().from(smtpSettingsTable).limit(1);
  return row ?? null;
}

export async function createTransporter(smtp: typeof smtpSettingsTable.$inferSelect) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.username, pass: smtp.password },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    ...(smtp.secure ? {} : { starttls: { enable: true } }),
  } as nodemailer.TransportOptions);
}

export function buildFrom(smtp: { fromName: string; fromEmail: string }) {
  return `"${smtp.fromName}" <${smtp.fromEmail}>`;
}

/** Try sending via a single account, return error message on failure */
async function trySend(account: { host: string; port: number; secure: boolean; username: string; password: string; fromName: string; fromEmail: string }, to: string, subject: string, html: string): Promise<string | null> {
  try {
    const transporter = nodemailer.createTransport({
      host: account.host, port: account.port, secure: account.secure,
      auth: { user: account.username, pass: account.password },
      connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000,
      tls: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
      ...(account.secure ? {} : { starttls: { enable: true } }),
    } as nodemailer.TransportOptions);
    await transporter.sendMail({ from: buildFrom(account), to, subject, html });
    return null; // success
  } catch (err: any) {
    return err?.message ?? String(err);
  }
}

/** Send via primary SMTP, falling back to backup accounts in priority order if primary fails */
export async function sendEmailWithFallback(to: string, subject: string, html: string): Promise<void> {
  const primary = await getSmtp();
  if (primary?.isActive && primary.host) {
    const err = await trySend(primary, to, subject, html);
    if (!err) return; // sent OK
    console.warn("[SMTP] Primary failed, trying backups. Error:", err);
  }
  // Try backup accounts ordered by priority ascending (1 = highest priority)
  const backups = await db.select().from(smtpAccountsTable)
    .where(and(eq(smtpAccountsTable.isActive, true)))
    .orderBy(asc(smtpAccountsTable.priority));
  for (const backup of backups) {
    if (!backup.host) continue;
    const err = await trySend(backup, to, subject, html);
    if (!err) {
      await db.update(smtpAccountsTable).set({ lastError: null }).where(eq(smtpAccountsTable.id, backup.id)).catch(() => {});
      return; // sent OK via backup
    }
    console.warn(`[SMTP] Backup "${backup.name}" failed:`, err);
    await db.update(smtpAccountsTable).set({ lastError: err }).where(eq(smtpAccountsTable.id, backup.id)).catch(() => {});
  }
  throw new Error("All SMTP accounts failed");
}

/** Send a single transactional email directly via SMTP (bypasses CRM automations) */
export async function sendTransactionalEmail(to: string, subject: string, html: string): Promise<void> {
  const smtp = await getSmtp();
  if (!smtp || !smtp.isActive) return;
  await sendEmailWithFallback(to, subject, html);
}

/* ── Email tracking helpers ───────────────────────────────────────────
 * For analytics (opens / clicks / unsubscribes) we generate a per-send
 * token, inject a 1×1 pixel + rewrite anchor hrefs + add an unsubscribe
 * footer into the HTML body, then store the token alongside the send.
 * Public tracking endpoints live in routes/email-tracking.ts.
 * ──────────────────────────────────────────────────────────────────── */
/**
 * Resolves the public base URL for tracking links (open pixels, click rewrites,
 * unsubscribe URLs) injected into outgoing emails. Precedence (highest first):
 *   1. Admin-configured siteUrl from platform_settings (Admin → Settings).
 *      Highest priority so emails always carry the live/custom domain even if
 *      env vars still point at an older preview URL.
 *   2. PUBLIC_BASE_URL env (deployment-time override).
 *   3. SITE_URL env (same value used by auth.ts for verify/reset links).
 *   4. REPLIT_DEV_DOMAIN (development fallback only).
 *
 * Returns "" when nothing is configured — callers must treat this as a no-op
 * (injectEmailTracking already short-circuits when base is empty).
 *
 * Cached for 60 seconds in-process to avoid an N+1 DB lookup during large
 * campaign/sequence sends. Admin Site-URL changes propagate after the TTL.
 */
let _siteUrlCache: { value: string; expiresAt: number; gen: number } | null = null;
let _siteUrlCacheGen = 0;
let _siteUrlInflight: { promise: Promise<string>; gen: number } | null = null;
const SITE_URL_CACHE_TTL_MS = 60_000;

/**
 * Last-observed public host cache. Every public request flows through the
 * `recordPublicHost` middleware (mounted in app.ts) which writes the live
 * request's protocol + hostname here. Background email sends (purchase
 * confirmations, automations, funnels, scheduled campaigns) read it via
 * `getLastObservedPublicHost()` so they emit links rooted at whatever domain
 * the affiliate / customer is currently using — without any admin config.
 *
 * If the admin has explicitly set `platform_settings.siteUrl`, that wins over
 * the auto-learned host (admin intent is sticky). If neither exists, env var
 * fallbacks kick in (PUBLIC_BASE_URL / SITE_URL / REPLIT_DEV_DOMAIN).
 *
 * The value is in-memory only (no DB writes on the hot path). It's refreshed
 * on every request, so it survives restarts within seconds in any
 * production-traffic environment. A 24h staleness guard prevents a tiny dev
 * host from sticking forever after a long idle period.
 */
let _lastObservedHost: { host: string; proto: "http" | "https"; observedAt: number } | null = null;
const LAST_OBSERVED_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Allowlist of public hostnames the deployment is permitted to be served on.
 * In Replit Deployments this comes from `REPLIT_DOMAINS` (set by the platform,
 * not by clients — so it's a trustworthy boundary). When set, we ONLY record
 * hosts that appear in this list, which neutralizes X-Forwarded-Host header
 * poisoning attacks (a malicious client can't make us cache `evil.com`).
 *
 * In dev (no REPLIT_DOMAINS), we accept any non-local host — there's no
 * trusted edge proxy to lean on, and dev safety isn't a concern.
 */
function isAllowedPublicHost(host: string): boolean {
  const replitDomains = process.env.REPLIT_DOMAINS?.toLowerCase()
    .split(",").map(s => s.trim()).filter(Boolean);
  if (replitDomains && replitDomains.length > 0) {
    return replitDomains.includes(host);
  }
  return true; // dev mode: caller already filtered local hosts
}

export function recordPublicHost(req: { hostname?: string; protocol?: string; path?: string }): void {
  const host = String(req.hostname || "").toLowerCase();
  if (!host) return;
  // Skip non-public hosts so a dev curl on localhost doesn't poison the cache
  // for production-bound emails.
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local")) return;
  // Skip webhook paths — these come from third-party gateways (Stripe, Razorpay)
  // that may set their own Host headers unrelated to the user-facing domain.
  // We don't want a webhook hit to poison the cache for outgoing emails.
  const path = String(req.path || "").toLowerCase();
  if (path.includes("/webhook")) return;
  // Allowlist guard against X-Forwarded-Host poisoning in production.
  if (!isAllowedPublicHost(host)) return;
  const proto: "http" | "https" = req.protocol === "http" ? "http" : "https";
  _lastObservedHost = { host, proto, observedAt: Date.now() };
}

export function getLastObservedPublicHost(): string {
  if (!_lastObservedHost) return "";
  if (Date.now() - _lastObservedHost.observedAt > LAST_OBSERVED_TTL_MS) return "";
  return `${_lastObservedHost.proto}://${_lastObservedHost.host}`;
}

/**
 * Shared helper for request-driven email/redirect URL builders. Returns
 * `<proto>://<host>` derived from the live request when (a) the host is
 * non-local and (b) it passes the `isAllowedPublicHost()` allowlist (when
 * REPLIT_DOMAINS is set). Returns "" otherwise so the caller can fall back to
 * `getPublicBaseUrl()`. This prevents an attacker from poisoning per-request
 * email links via X-Forwarded-Host even if the edge proxy were
 * misconfigured.
 */
export function publicSiteUrlFromRequest(req: { hostname?: string; protocol?: string }): string {
  const host = String(req.hostname || "").toLowerCase();
  if (!host) return "";
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local")) return "";
  if (!isAllowedPublicHost(host)) return "";
  const proto: "http" | "https" = req.protocol === "http" ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * Resolves *only* the admin-configured Site URL from `platform_settings`.
 * This is the single value that is safe to cache for SITE_URL_CACHE_TTL_MS:
 * it changes only via admin UI (which calls `invalidatePublicBaseUrlCache()`).
 * Returns "" when no admin override is set; callers fall through to the
 * (uncached) `lastObservedHost` and then env vars.
 */
async function resolveStableBaseUrlUncached(): Promise<string> {
  try {
    const [ps] = await db.select({ siteUrl: platformSettingsTable.siteUrl })
      .from(platformSettingsTable).limit(1);
    const fromDb = ps?.siteUrl?.trim();
    if (fromDb) return fromDb.replace(/\/+$/, "");
  } catch { /* fall through */ }
  return "";
}

/**
 * Final fallback: env-var chain. Read fresh on each call (env doesn't change
 * mid-process, so caching gives no real benefit and would only delay the
 * `lastObservedHost` from taking precedence).
 */
function resolveEnvBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const fromSite = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (fromSite) return fromSite;
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;
  const replitDomains = process.env.REPLIT_DOMAINS?.split(",").map(s => s.trim()).filter(Boolean);
  if (replitDomains && replitDomains.length > 0) return `https://${replitDomains[0]}`;
  return "";
}

export async function getPublicBaseUrl(): Promise<string> {
  // Required precedence (highest first):
  //   1. Admin override (`platform_settings.siteUrl`) — sticky intent, cached.
  //   2. Auto-learned `lastObservedHost` — picks up the live domain from real
  //      traffic without any admin config; refreshed on every request.
  //   3. Env vars (PUBLIC_BASE_URL → SITE_URL → REPLIT_DEV_DOMAIN → REPLIT_DOMAINS).
  //
  // The auto-learned host MUST beat env vars: a stale `SITE_URL=oldsite.com`
  // env var should never override the live domain that real users are hitting.
  const stable = await getStableBaseUrl();
  if (stable) return stable;
  const observed = getLastObservedPublicHost();
  if (observed) return observed;
  return resolveEnvBaseUrl();
}

async function getStableBaseUrl(): Promise<string> {
  // Fresh cache hit: return immediately.
  if (_siteUrlCache && _siteUrlCache.expiresAt > Date.now()) {
    return _siteUrlCache.value;
  }
  // Single-flight, generation-aware: coalesce concurrent callers onto one DB
  // read so a burst of emails doesn't fan out into N queries when the cache
  // is cold. We only reuse an in-flight promise that was started under the
  // current generation; if invalidatePublicBaseUrlCache() ticked the gen
  // forward, post-invalidate callers must start a fresh resolve so they
  // don't observe the stale pre-invalidate value.
  if (_siteUrlInflight && _siteUrlInflight.gen === _siteUrlCacheGen) {
    return _siteUrlInflight.promise;
  }

  // Capture the generation BEFORE the await. If invalidatePublicBaseUrlCache()
  // is called while we're awaiting the DB, the generation will tick forward
  // and we will refuse to write a stale value back into the cache.
  const startGen = _siteUrlCacheGen;
  const promise = (async () => {
    try {
      const value = await resolveStableBaseUrlUncached();
      if (_siteUrlCacheGen === startGen) {
        _siteUrlCache = { value, expiresAt: Date.now() + SITE_URL_CACHE_TTL_MS, gen: startGen };
      }
      return value;
    } finally {
      // Only clear the inflight slot if it's still ours; a concurrent
      // invalidation may have already replaced it with a fresh-gen entry.
      if (_siteUrlInflight && _siteUrlInflight.gen === startGen) {
        _siteUrlInflight = null;
      }
    }
  })();
  _siteUrlInflight = { promise, gen: startGen };
  return promise;
}

/**
 * Drop the cached public base URL. Call this from admin routes that update
 * platform_settings.siteUrl so changes propagate immediately instead of
 * waiting for the TTL. Bumping the generation counter (a) causes any
 * in-flight resolve to be discarded rather than written into the cache, and
 * (b) prevents post-invalidate callers from being attached to a pre-invalidate
 * in-flight promise (whose value would be stale).
 */
export function invalidatePublicBaseUrlCache(): void {
  _siteUrlCache = null;
  _siteUrlInflight = null;
  _siteUrlCacheGen++;
}

/**
 * Substitute the universal {{site_url}} placeholder in subject + body with the
 * resolved public base URL. Use this in every send path BEFORE
 * `injectEmailTracking()` so click-tracking never wraps a literal `{{site_url}}`.
 * Returns the substituted [subject, html] tuple.
 */
export async function substituteSiteUrl(subject: string, html: string): Promise<[string, string]> {
  const siteUrl = await getPublicBaseUrl();
  return [
    subject.replaceAll("{{site_url}}", siteUrl),
    html.replaceAll("{{site_url}}", siteUrl),
  ];
}

export function newTrackingToken(): string {
  return randomBytes(16).toString("hex");
}

/** Sign a click target so the click endpoint can refuse tampered `to` params. */
export function signClickTarget(token: string, target: string): string {
  // SECURITY: no fallback secret — auth middleware throws at startup if SESSION_SECRET
  // is missing in production, so by the time this runs the env var is guaranteed.
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET required for HMAC signing");
  return createHmac("sha256", secret).update(`${token}:${target}`).digest("hex").slice(0, 16);
}

const escapeHtmlAttr = (s: string) => s.replace(/"/g, "&quot;");

export async function injectEmailTracking(html: string, token: string): Promise<string> {
  const base = await getPublicBaseUrl();
  if (!base || !token || !html) return html;
  const unsubUrl = `${base}/api/email/unsubscribe/${token}`;

  // Pass 1: rewrite hrefs of any existing "Unsubscribe" anchors to the tracked
  // unsubscribe URL. This handles the common case where a template ships with a
  // dead `href="#"` unsubscribe link.
  let unsubInjected = false;
  let out = html.replace(
    /<a\b([^>]*?)\shref=(["'])([^"']*)\2([^>]*)>([\s\S]*?)<\/a>/gi,
    (m, before, q, _url, after, inner) => {
      if (/unsubscribe/i.test(inner) || /unsubscribe/i.test(before + after)) {
        unsubInjected = true;
        return `<a${before} href=${q}${escapeHtmlAttr(unsubUrl)}${q}${after}>${inner}</a>`;
      }
      return m;
    },
  );

  // Pass 2: rewrite all other anchor hrefs through the click endpoint. The
  // destination is HMAC-signed so the click endpoint can refuse tampered links.
  // Security-critical, short-lived tokenized URLs (email verification, password
  // reset, magic-link login) are EXCLUDED from click tracking so users always
  // see a clean, direct URL on hover and never get blocked by a tracking-layer
  // failure (e.g. expired sig, downtime). Authors can also opt any anchor out
  // by adding `data-no-track` or `data-notrack` to it.
  const NO_TRACK_PATH_RE = /\/(verify-email|reset-password|magic-link|magic-login)(\?|#|$)/i;
  out = out.replace(/<a\b([^>]*?)\shref=(["'])([^"']+)\2([^>]*)>/gi, (m, before, q, url, after) => {
    if (!url) return m;
    if (/^(mailto:|tel:|sms:|#|javascript:)/i.test(url)) return m;
    if (url.includes("/api/email/track/") || url.includes("/api/email/unsubscribe/")) return m;
    if (NO_TRACK_PATH_RE.test(url)) return m;
    if (/\bdata-no-?track\b/i.test(before + after)) return m;
    const sig = signClickTarget(token, url);
    const tracked = `${base}/api/email/track/click/${token}?to=${encodeURIComponent(url)}&sig=${sig}`;
    return `<a${before} href=${q}${escapeHtmlAttr(tracked)}${q}${after}>`;
  });

  // Append unsubscribe footer only if no anchor was rewritten in Pass 1.
  if (!unsubInjected) {
    out += `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:-apple-system,sans-serif;font-size:11px;color:#9ca3af;text-align:center;line-height:1.6;">Don't want these emails? <a href="${escapeHtmlAttr(unsubUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></div>`;
  }

  // Append 1×1 tracking pixel (before </body> if present)
  const pixelUrl = `${base}/api/email/track/open/${token}`;
  const pixel = `<img src="${escapeHtmlAttr(pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;outline:none;text-decoration:none;height:1px;width:1px;" />`;
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${pixel}</body>`);
  } else {
    out += pixel;
  }
  return out;
}

/** Returns true if the user has previously unsubscribed and we should skip sending. */
export async function isUserUnsubscribed(userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const [u] = await db.select({ unsub: usersTable.emailUnsubscribedAt })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return !!(u?.unsub);
}

/** Public function called from other routes to fire automation emails */
export async function triggerAutomation(
  event: "welcome" | "purchase" | "refund" | "forgot_password" | "completion" | "affiliate_commission" | "affiliate_application_submitted" | "affiliate_application_approved" | "affiliate_application_rejected" | "staff_welcome",
  userId: number,
  email: string,
  variables: Record<string, string> = {},
) {
  try {
    const smtp = await getSmtp();
    if (!smtp || !smtp.isActive) return;

    const [rule] = await db.select().from(emailAutomationRulesTable)
      .where(and(eq(emailAutomationRulesTable.event, event), eq(emailAutomationRulesTable.isEnabled, true)))
      .limit(1);
    if (!rule || !rule.templateId) return;

    const [template] = await db.select().from(emailTemplatesTable)
      .where(and(eq(emailTemplatesTable.id, rule.templateId), eq(emailTemplatesTable.isActive, true)))
      .limit(1);
    if (!template) return;

    let html = template.htmlBody;
    let subject = template.subject;
    for (const [key, val] of Object.entries(variables)) {
      html = html.replaceAll(`{{${key}}}`, val);
      subject = subject.replaceAll(`{{${key}}}`, val);
    }
    // Always substitute {{site_url}} so it never reaches the click rewriter as
    // a literal placeholder, even when the caller didn't pass site_url explicitly.
    [subject, html] = await substituteSiteUrl(subject, html);

    const send = async () => {
      if (await isUserUnsubscribed(userId)) return;
      const token = newTrackingToken();
      const trackedHtml = await injectEmailTracking(html, token);
      try {
        await sendEmailWithFallback(email, subject, trackedHtml);
        await db.insert(emailSendsTable).values({ type: "automation", automationEvent: event, userId, email, subject, htmlBody: trackedHtml, status: "sent", trackingToken: token });
      } catch (err: any) {
        await db.insert(emailSendsTable).values({ type: "automation", automationEvent: event, userId, email, subject, htmlBody: trackedHtml, status: "failed", failReason: String(err?.message ?? err), trackingToken: token });
      }
    };

    if (rule.delayMinutes > 0) {
      setTimeout(send, rule.delayMinutes * 60 * 1000);
    } else {
      send();
    }
  } catch {
  }
}

/* ── SMTP ── */
router.get("/smtp", requireAdmin, async (_req, res): Promise<void> => {
  const smtp = await getSmtp();
  if (!smtp) { res.json(null); return; }
  const { password: _pw, ...safe } = smtp;
  res.json({ ...safe, passwordSet: !!_pw });
});

router.put("/smtp", requireAdmin, async (req, res): Promise<void> => {
  const { name, host, port, secure, username, password, fromName, fromEmail, isActive } = req.body;
  const existing = await getSmtp();
  const values: Record<string, unknown> = { name: name || "Primary SMTP", host, port: parseInt(String(port)) || 587, secure: !!secure, username, fromName, fromEmail, isActive: !!isActive };
  if (password) values.password = password;

  if (existing) {
    const [updated] = await db.update(smtpSettingsTable).set(values).where(eq(smtpSettingsTable.id, existing.id)).returning();
    const { password: _pw, ...safe } = updated;
    res.json({ ...safe, passwordSet: !!_pw });
  } else {
    if (!password) { res.status(400).json({ error: "Password required for first setup" }); return; }
    const [created] = await db.insert(smtpSettingsTable).values({ ...values, password } as any).returning();
    const { password: _pw, ...safe } = created;
    res.json({ ...safe, passwordSet: !!_pw });
  }
});

router.post("/smtp/test", requireAdmin, async (req, res): Promise<void> => {
  const smtp = await getSmtp();
  if (!smtp || !smtp.host) { res.status(400).json({ error: "SMTP not configured" }); return; }
  if (!smtp.password) { res.status(400).json({ error: "SMTP password not set — save your settings first" }); return; }
  const { to } = req.body;
  if (!to) { res.status(400).json({ error: "Recipient email required" }); return; }
  try {
    const transporter = await createTransporter(smtp);
    const smtpTestHtml = `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#0a0f1e;color:#e2e8f0;border-radius:12px;">
        <h2 style="color:#2563eb;">✅ SMTP Test Successful</h2>
        <p>Your SMTP configuration is working correctly.</p>
        <p style="color:#64748b;font-size:12px;">Sent from Upcalify CRM · Host: ${smtp.host}:${smtp.port}</p>
      </div>`;
    const info = await transporter.sendMail({
      from: buildFrom(smtp),
      to,
      subject: "Upcalify — SMTP Test",
      html: smtpTestHtml,
    });
    console.log("[SMTP test] Sent OK — messageId:", info.messageId);
    await db.insert(emailSendsTable).values({ type: "test", email: to, subject: "Upcalify — SMTP Test", htmlBody: smtpTestHtml, status: "sent" });
    res.json({ success: true, message: "Test email sent successfully" });
  } catch (err: any) {
    const msg = err?.message ?? "Unknown error";
    console.error("[SMTP test] Failed —", msg, "| host:", smtp.host, "port:", smtp.port, "user:", smtp.username);
    await db.insert(emailSendsTable).values({ type: "test", email: to, subject: "Upcalify — SMTP Test", status: "failed", failReason: msg }).catch(() => {});
    res.status(500).json({ error: msg });
  }
});

/* ── Live SMTP test (uses form values, not saved DB settings) ── */
router.post("/smtp/test-live", requireAdmin, async (req, res): Promise<void> => {
  const { host, port, secure, username, password, fromName, fromEmail, to } = req.body;
  if (!to) { res.status(400).json({ error: "Recipient email required" }); return; }
  if (!host) { res.status(400).json({ error: "SMTP host required" }); return; }
  if (!username) { res.status(400).json({ error: "SMTP username required" }); return; }

  // If password omitted (leave-blank-to-keep), fall back to the stored DB password
  let resolvedPassword = password;
  if (!resolvedPassword) {
    const saved = await getSmtp();
    resolvedPassword = saved?.password ?? "";
  }
  if (!resolvedPassword) { res.status(400).json({ error: "Password required — enter a password or save settings first" }); return; }

  const cfg = {
    host, port: parseInt(String(port)) || 587, secure: !!secure,
    username, password: resolvedPassword,
    fromName: fromName || "Upcalify", fromEmail: fromEmail || username,
  } as typeof smtpSettingsTable.$inferSelect;

  try {
    const transporter = await createTransporter(cfg);
    const smtpLiveTestHtml = `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#0a0f1e;color:#e2e8f0;border-radius:12px;">
        <h2 style="color:#2563eb;">✅ SMTP Live Test Successful</h2>
        <p>Your unsaved SMTP settings are working correctly.</p>
        <p style="color:#64748b;font-size:12px;">Host: ${host}:${port} · User: ${username}</p>
      </div>`;
    const info = await transporter.sendMail({
      from: buildFrom(cfg),
      to,
      subject: "Upcalify — SMTP Live Test",
      html: smtpLiveTestHtml,
    });
    console.log("[SMTP live-test] Sent OK — messageId:", info.messageId);
    await db.insert(emailSendsTable).values({ type: "test", email: to, subject: "Upcalify — SMTP Live Test", htmlBody: smtpLiveTestHtml, status: "sent" });
    res.json({ success: true, message: "Test email sent with current form settings" });
  } catch (err: any) {
    const msg = err?.message ?? "Unknown error";
    console.error("[SMTP live-test] Failed —", msg, "| host:", host, "port:", port, "user:", username);
    await db.insert(emailSendsTable).values({ type: "test", email: to, subject: "Upcalify — SMTP Live Test", status: "failed", failReason: msg }).catch(() => {});
    res.status(500).json({ error: msg });
  }
});

/* ── SMTP Backup Accounts ── */
router.get("/smtp/accounts", requireAdmin, async (_req, res): Promise<void> => {
  const accounts = await db.select().from(smtpAccountsTable).orderBy(asc(smtpAccountsTable.priority));
  res.json(accounts.map(({ password: _pw, ...safe }) => ({ ...safe, passwordSet: !!_pw })));
});

router.post("/smtp/accounts", requireAdmin, async (req, res): Promise<void> => {
  const { name, host, port, secure, username, password, fromName, fromEmail, priority, isActive } = req.body;
  if (!host || !username || !password) { res.status(400).json({ error: "Host, username and password are required" }); return; }
  const [created] = await db.insert(smtpAccountsTable).values({
    name: name || "Backup SMTP",
    host, port: parseInt(String(port)) || 587,
    secure: !!secure, username, password,
    fromName: fromName || "Upcalify",
    fromEmail: fromEmail || username,
    priority: parseInt(String(priority)) || 1,
    isActive: isActive !== false,
  }).returning();
  const { password: _pw, ...safe } = created;
  res.json({ ...safe, passwordSet: true });
});

router.put("/smtp/accounts/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, host, port, secure, username, password, fromName, fromEmail, priority, isActive } = req.body;
  const values: Record<string, unknown> = {
    name, host, port: parseInt(String(port)) || 587,
    secure: !!secure, username,
    fromName, fromEmail,
    priority: parseInt(String(priority)) || 1,
    isActive: !!isActive,
  };
  if (password) values.password = password;
  const [updated] = await db.update(smtpAccountsTable).set(values).where(eq(smtpAccountsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Account not found" }); return; }
  const { password: _pw, ...safe } = updated;
  res.json({ ...safe, passwordSet: !!_pw });
});

router.delete("/smtp/accounts/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(smtpAccountsTable).where(eq(smtpAccountsTable.id, id));
  res.json({ success: true });
});

/* Promote a backup account to primary (swaps with current primary) */
router.post("/smtp/accounts/:id/promote", requireAdmin, async (req, res): Promise<void> => {
  const backupId = parseInt(req.params.id);
  const [backup] = await db.select().from(smtpAccountsTable).where(eq(smtpAccountsTable.id, backupId)).limit(1);
  if (!backup) { res.status(404).json({ error: "Account not found" }); return; }

  const primary = await getSmtp();

  // If there's a current primary with actual config, demote it to a backup account
  if (primary?.host) {
    await db.insert(smtpAccountsTable).values({
      name: primary.name || "Previous Primary",
      host: primary.host, port: primary.port, secure: primary.secure,
      username: primary.username, password: primary.password,
      fromName: primary.fromName, fromEmail: primary.fromEmail,
      priority: 1, isActive: true,
    });
  }

  // Promote the backup to primary
  const newPrimaryValues: Record<string, unknown> = {
    name: backup.name, host: backup.host, port: backup.port, secure: backup.secure,
    username: backup.username, password: backup.password,
    fromName: backup.fromName, fromEmail: backup.fromEmail,
    isActive: backup.isActive,
  };

  if (primary) {
    await db.update(smtpSettingsTable).set(newPrimaryValues).where(eq(smtpSettingsTable.id, primary.id));
  } else {
    await db.insert(smtpSettingsTable).values(newPrimaryValues as any);
  }

  // Remove the backup (it's now primary)
  await db.delete(smtpAccountsTable).where(eq(smtpAccountsTable.id, backupId));

  res.json({ success: true });
});

router.post("/smtp/accounts/:id/test", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { to } = req.body;
  if (!to) { res.status(400).json({ error: "Recipient email required" }); return; }
  const [account] = await db.select().from(smtpAccountsTable).where(eq(smtpAccountsTable.id, id)).limit(1);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  if (!account.password) { res.status(400).json({ error: "No password saved for this account" }); return; }
  const err = await trySend(account, to, `SMTP Test — ${account.name}`,
    `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#0a0f1e;color:#e2e8f0;border-radius:12px;">
      <h2 style="color:#2563eb;">✅ Backup SMTP Test Successful</h2>
      <p>Your backup SMTP account <strong>${account.name}</strong> is working correctly.</p>
      <p style="color:#64748b;font-size:12px;">Host: ${account.host}:${account.port} · Priority: ${account.priority}</p>
    </div>`);
  if (err) {
    await db.update(smtpAccountsTable).set({ lastError: err }).where(eq(smtpAccountsTable.id, id));
    res.status(500).json({ error: err }); return;
  }
  await db.update(smtpAccountsTable).set({ lastError: null, lastTestedAt: new Date() }).where(eq(smtpAccountsTable.id, id));
  await db.insert(emailSendsTable).values({ type: "test", email: to, subject: `SMTP Test — ${account.name}`, htmlBody: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#0a0f1e;color:#e2e8f0;border-radius:12px;"><h2 style="color:#2563eb;">✅ Backup SMTP Test Successful</h2><p>Your backup SMTP account <strong>${account.name}</strong> is working correctly.</p><p style="color:#64748b;font-size:12px;">Host: ${account.host}:${account.port} · Priority: ${account.priority}</p></div>`, status: "sent" });
  res.json({ success: true });
});

/* ── Template test-send ── */
// Static sample values that don't depend on the request/site URL.
const SAMPLE_VARIABLES_STATIC: Record<string, string> = {
  name: "Rahul Sharma",
  email: "rahul.sharma@example.com",
  course_name: "Advanced React Masterclass",
  amount: "4,999.00",
  commission_amount: "999.80",
  payout_amount: "4,998.00",
  site_name: "Upcalify",
  rejection_reason: "We weren't able to verify an active audience or content channel. Please share your social media or YouTube link when you reapply.",
};

/**
 * Resolves the public site URL for sample/test emails. Same precedence as
 * auth.ts → resolvePublicSiteUrl: admin-configured siteUrl from
 * platform_settings, then SITE_URL env, then reconstruct from request
 * (honors X-Forwarded-Proto/Host because trust proxy=1 is set in app.ts).
 * This keeps test-send buttons in sync with the live domain so admins never
 * see stale sample URLs (e.g. vkacademy.com) leaking into the preview.
 */
async function resolveSampleSiteUrl(req: import("express").Request): Promise<string> {
  // Prefer the live request hostname via the shared `publicSiteUrlFromRequest`
  // helper (which applies the same allowlist used by `recordPublicHost`, so
  // X-Forwarded-Host poisoning is neutralized). Fall back to the unified
  // `getPublicBaseUrl()` chain when the request host is local/disallowed.
  const fromReq = publicSiteUrlFromRequest(req);
  if (fromReq) return fromReq;
  const fromHelper = await getPublicBaseUrl();
  if (fromHelper) return fromHelper.replace(/\/+$/, "");
  return `${req.protocol}://${req.hostname}`;
}

router.post("/templates/test-send", requireAdmin, async (req, res): Promise<void> => {
  const smtp = await getSmtp();
  if (!smtp || !smtp.host) { res.status(400).json({ error: "SMTP not configured. Go to the SMTP tab and save your settings first." }); return; }
  if (!smtp.isActive) { res.status(400).json({ error: "SMTP is not active. Enable it in the SMTP tab before sending." }); return; }
  const { to, subject, htmlBody } = req.body;
  if (!to) { res.status(400).json({ error: "Recipient email required" }); return; }
  if (!subject) { res.status(400).json({ error: "Subject required" }); return; }
  if (!htmlBody) { res.status(400).json({ error: "Email body required" }); return; }
  try {
    // Build sample variables: static values + URL-derived values resolved from
    // the live site URL so test-send previews match what real recipients will get.
    const siteUrl = await resolveSampleSiteUrl(req);
    const sampleVariables: Record<string, string> = {
      ...SAMPLE_VARIABLES_STATIC,
      site_url: siteUrl,
      reset_link: `${siteUrl}/reset-password?token=sample_abc123`,
      verify_link: `${siteUrl}/verify-email?token=sample_abc123`,
    };
    // Replace all variables with sample values so preview looks realistic
    let processedHtml = htmlBody;
    let processedSubject = subject;
    for (const [key, val] of Object.entries(sampleVariables)) {
      processedHtml = processedHtml.replaceAll(`{{${key}}}`, val);
      processedSubject = processedSubject.replaceAll(`{{${key}}}`, val);
    }
    await sendEmailWithFallback(to, `[TEST] ${processedSubject}`, processedHtml);
    await db.insert(emailSendsTable).values({ type: "test", email: to, subject: `[TEST] ${processedSubject}`, htmlBody: processedHtml, status: "sent" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to send: ${err?.message ?? "Unknown error"}` });
  }
});

/* ── Templates ── */
router.get("/templates", requireAdmin, async (_req, res): Promise<void> => {
  const templates = await db.select().from(emailTemplatesTable).orderBy(emailTemplatesTable.createdAt);
  res.json(templates);
});

/* ── Shared email wrapper ── */
function emailWrap(body: string): string {
  // NOTE: Social icons and the Unsubscribe link below intentionally use
  // {{site_url}} (instead of dead "#" hrefs) so clicks land on the brand
  // homepage. The Unsubscribe anchor is automatically rewritten to a
  // per-send tracked unsubscribe URL by injectEmailTracking() at send time
  // (Pass 1 detects "Unsubscribe" in the inner text).
  const footer = `
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 0 8px;font-family:Arial,Helvetica,sans-serif;">
    <table cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr>
      <td style="padding:0 5px;"><a href="{{site_url}}" style="text-decoration:none;display:inline-block;width:30px;height:30px;background:#e2e8f0;border-radius:5px;text-align:center;line-height:30px;font-size:13px;color:#475569;">𝕏</a></td>
      <td style="padding:0 5px;"><a href="{{site_url}}" style="text-decoration:none;display:inline-block;width:30px;height:30px;background:#e2e8f0;border-radius:5px;text-align:center;line-height:30px;font-size:12px;color:#475569;font-weight:700;">in</a></td>
      <td style="padding:0 5px;"><a href="{{site_url}}" style="text-decoration:none;display:inline-block;width:30px;height:30px;background:#e2e8f0;border-radius:5px;text-align:center;line-height:30px;font-size:13px;color:#475569;">▶</a></td>
      <td style="padding:0 5px;"><a href="{{site_url}}" style="text-decoration:none;display:inline-block;width:30px;height:30px;background:#e2e8f0;border-radius:5px;text-align:center;line-height:30px;font-size:13px;color:#475569;">◎</a></td>
    </tr></table>
    <p style="margin:0 0 3px;font-size:12px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;">Sent by <strong>Upcalify</strong></p>
    <p style="margin:0 0 10px;font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;">
      <a href="mailto:support@vipulkumaracademy.com" style="color:#94a3b8;text-decoration:none;">support@vipulkumaracademy.com</a>
      &nbsp;·&nbsp; WhatsApp: <a href="https://wa.me/15557485582" style="color:#94a3b8;text-decoration:none;">+15557485582</a>
    </p>
    <a href="{{site_url}}/unsubscribe" style="font-size:11px;color:#ef4444;text-decoration:none;">Unsubscribe</a>
  </td></tr></table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
  <tr><td style="background:#ffffff;border-radius:16px;padding:36px 40px;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;">
    ${body}
  </td></tr>
  <tr><td>${footer}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

const DEFAULT_TEMPLATES = [
  {
    name: "Welcome Email",
    type: "welcome" as const,
    subject: "Welcome to Upcalify, {{name}}! 🎉",
    htmlBody: emailWrap(`
      <p style="margin:0 0 6px;font-size:15px;color:#111827;line-height:1.5;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Welcome to <strong>Upcalify</strong>! 🎉 We're thrilled to have you join India's premier business education platform.</p>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Here's what you now have access to:</p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>In-depth courses on <strong>Affiliate Marketing, E-commerce &amp; Dropshipping</strong></li>
        <li>Real-world case studies and step-by-step lessons</li>
        <li>Earn extra income by joining our <strong>Affiliate Program</strong></li>
        <li>Community support and mentorship resources</li>
      </ul>
      <p style="margin:0 0 10px;font-size:14px;color:#374151;">First, please verify your email to activate your account:</p>
      <table cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
        <tr><td style="background:#2563eb;border-radius:8px;padding:13px 30px;">
          <a href="{{verify_link}}" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Verify My Email &rarr;</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7;">Once verified, browse our course catalog and take your first step toward financial independence.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;" />
      <p style="margin:0;font-size:14px;color:#6b7280;">Happy learning,<br><strong style="color:#374151;">The Upcalify Team</strong></p>
    `),
  },
  {
    name: "Purchase Confirmation",
    type: "purchase" as const,
    subject: "Payment Confirmed — {{course_name}} ✅",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#f0fdf4;border-radius:12px;padding:20px;">
          <p style="margin:0 0 6px;font-size:36px;line-height:1;">✅</p>
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#15803d;font-family:Arial,Helvetica,sans-serif;">Payment Confirmed!</h1>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>, your payment was successful and your course access is now active.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Course</td>
          <td style="padding:11px 16px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">{{course_name}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;">Amount Paid</td>
          <td style="padding:11px 16px;color:#15803d;font-weight:700;text-align:right;">&#8377;{{amount}}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-top:1px solid #e5e7eb;">Account Email</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;border-top:1px solid #e5e7eb;">{{email}}</td>
        </tr>
      </table>
      <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.7;">Your course is now available in your dashboard. Start learning immediately!</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="background:#16a34a;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/my-courses" data-no-track="1" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Start Learning &rarr;</a>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Need help? Email us at <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp us at <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Refund Notification",
    type: "refund" as const,
    subject: "Refund Processed — {{course_name}}",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#fffbeb;border-radius:12px;padding:20px;">
          <p style="margin:0 0 6px;font-size:36px;line-height:1;">↩️</p>
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#92400e;font-family:Arial,Helvetica,sans-serif;">Refund Processed</h1>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>, we've successfully processed your refund request. Here are the details:</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Course</td>
          <td style="padding:11px 16px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">{{course_name}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;">Refund Amount</td>
          <td style="padding:11px 16px;color:#b45309;font-weight:700;text-align:right;">&#8377;{{amount}}</td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#92400e;font-family:Arial,Helvetica,sans-serif;">&#8987; Please allow <strong>5–7 business days</strong> for the refund to reflect in your original payment method.</p>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">We're sorry to see you go. If you faced any issue with the course or have feedback, we'd truly love to hear from you — our team is here to help.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Reach us at <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Password Reset",
    type: "forgot_password" as const,
    subject: "Reset Your Upcalify Password 🔐",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#eff6ff;border-radius:12px;padding:20px;">
          <p style="margin:0 0 6px;font-size:36px;line-height:1;">🔐</p>
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;">Reset Your Password</h1>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">We received a request to reset the password for your Upcalify account associated with <strong>{{email}}</strong>.</p>
      <p style="margin:0 0 18px;font-size:14px;color:#374151;">Click the button below to set a new password:</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="background:#2563eb;border-radius:8px;padding:13px 30px;">
          <a href="{{reset_link}}" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Reset Password &rarr;</a>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
        <tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#9a3412;font-family:Arial,Helvetica,sans-serif;">&#9888;&#65039; This link expires in <strong>1 hour</strong>. If you did not request a password reset, please ignore this email — your account is safe.</p>
        </td></tr>
      </table>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Or copy and paste this URL into your browser:</p>
      <p style="margin:0 0 20px;font-size:12px;color:#2563eb;word-break:break-all;">{{reset_link}}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Need help? Contact us at <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a></p>
    `),
  },
  {
    name: "Course Completion",
    type: "completion" as const,
    subject: "🎓 Congratulations! You completed {{course_name}}",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#faf5ff;border-radius:12px;padding:24px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">🎓</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#7c3aed;font-family:Arial,Helvetica,sans-serif;">Course Complete!</h1>
        </td></tr>
      </table>
      <p style="margin:0 0 10px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Congratulations! 🎉 You've successfully completed:</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td align="center" style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px 20px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#4c1d95;font-family:Arial,Helvetica,sans-serif;">{{course_name}}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">You're now part of an elite group of learners who have mastered this curriculum. This is a huge achievement — be proud of yourself!</p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">Here's what you can do next:</p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>Explore our other advanced courses</li>
        <li>Share your achievement on social media</li>
        <li>Join our Affiliate Program and earn commissions</li>
      </ul>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="background:#7c3aed;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/courses" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Explore More Courses &rarr;</a>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Reach us at <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Affiliate Commission",
    type: "affiliate_commission" as const,
    subject: "💰 Commission Earned — ₹{{payout_amount}}",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#f0fdf4;border-radius:12px;padding:24px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">💰</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#15803d;font-family:Arial,Helvetica,sans-serif;">Commission Credited!</h1>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Great news! You've earned a new affiliate commission. Here's a summary:</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Commission Amount</td>
          <td style="padding:11px 16px;color:#15803d;font-weight:700;text-align:right;font-size:16px;border-bottom:1px solid #e5e7eb;">&#8377;{{commission_amount}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;">Payout Amount</td>
          <td style="padding:11px 16px;color:#15803d;font-weight:700;text-align:right;">&#8377;{{payout_amount}}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">The amount will be transferred to your registered bank account within <strong>2–3 business days</strong>. Keep sharing your affiliate link to earn more!</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="background:#16a34a;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/affiliate" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">View Affiliate Dashboard &rarr;</a>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Affiliate Application Submitted",
    type: "affiliate_application_submitted" as const,
    subject: "✅ We've received your affiliate application, {{name}}",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#eff6ff;border-radius:12px;padding:24px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">📨</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;">Application Received</h1>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Thank you for applying to the <strong>Upcalify Affiliate Program</strong>! 🎉 We've successfully received your application and our team will review it shortly.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Applicant Name</td>
          <td style="padding:11px 16px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">{{name}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Email</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;border-bottom:1px solid #e5e7eb;">{{email}}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;">Status</td>
          <td style="padding:11px 16px;color:#1d4ed8;font-weight:700;text-align:right;">Under Review</td>
        </tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;"><strong>What happens next?</strong></p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>Our team typically reviews applications within <strong>24–48 hours</strong></li>
        <li>You'll receive an email once a decision has been made</li>
        <li>If approved, you'll get access to your affiliate dashboard, unique referral link and marketing creatives</li>
      </ul>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#1e40af;font-family:Arial,Helvetica,sans-serif;">💡 <strong>Tip:</strong> While you wait, explore our courses to better understand what you'll be promoting — informed affiliates earn the most!</p>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr><td style="background:#2563eb;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/affiliate" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Check Application Status &rarr;</a>
        </td></tr>
      </table>
      <p style="margin:0 0 22px;font-size:13px;color:#6b7280;line-height:1.7;">Or browse our <a href="{{site_url}}/courses" style="color:#2563eb;text-decoration:none;">course catalog</a> while you wait.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Affiliate Application Approved",
    type: "affiliate_application_approved" as const,
    subject: "🎉 You're approved! Welcome to the Upcalify Affiliate Program",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#f0fdf4;border-radius:12px;padding:24px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">🎉</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#15803d;font-family:Arial,Helvetica,sans-serif;">Application Approved!</h1>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Congratulations! 🚀 Your application to the <strong>Upcalify Affiliate Program</strong> has been <strong style="color:#15803d;">approved</strong>. You're now an official Upcalify affiliate and can start earning commissions right away.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #bbf7d0;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f0fdf4;">
          <td style="padding:11px 16px;color:#15803d;font-weight:600;border-bottom:1px solid #bbf7d0;">✅ Status</td>
          <td style="padding:11px 16px;color:#15803d;font-weight:700;text-align:right;border-bottom:1px solid #bbf7d0;">Active Affiliate</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;">Affiliate Email</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;">{{email}}</td>
        </tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;"><strong>Here's what you get:</strong></p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>A unique <strong>referral link</strong> to share with your audience</li>
        <li>Access to <strong>marketing creatives</strong> — banners, copy, social media content</li>
        <li>Real-time <strong>tracking dashboard</strong> for clicks, conversions and earnings</li>
        <li>Fast <strong>commission payouts</strong> directly to your bank account</li>
      </ul>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr><td style="background:#16a34a;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/affiliate" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Open Affiliate Dashboard &rarr;</a>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">Log in to grab your referral link, download creatives, and start sharing today. The sooner you start, the sooner you earn!</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#92400e;font-family:Arial,Helvetica,sans-serif;">💡 <strong>Pro tip:</strong> Complete your <strong>KYC and bank details</strong> in the dashboard so we can process your payouts without delay.</p>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Welcome aboard! 🤝<br><strong style="color:#374151;">The Upcalify Affiliate Team</strong></p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Need help getting started? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Affiliate Application Rejected",
    type: "affiliate_application_rejected" as const,
    subject: "Update on your Upcalify affiliate application",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#fef2f2;border-radius:12px;padding:20px;">
          <p style="margin:0 0 6px;font-size:36px;line-height:1;">📋</p>
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#b91c1c;font-family:Arial,Helvetica,sans-serif;">Application Update</h1>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Thank you for your interest in the <strong>Upcalify Affiliate Program</strong>. After careful review, we're unable to approve your application at this time.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;">
          <p style="margin:0 0 6px;font-size:12px;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">Reason from our team</p>
          <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">{{rejection_reason}}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;"><strong>This isn't the end of the road.</strong> Many of our top affiliates were approved on a second or third application after strengthening their profile. Here's how you can improve your chances:</p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>Build an active audience on social media, YouTube or your blog</li>
        <li>Enroll in one of our courses so you can speak about it authentically</li>
        <li>Share more details about your promotion plan when you reapply</li>
        <li>Demonstrate engagement — testimonials, content samples or follower stats</li>
      </ul>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">You're welcome to <strong>reapply at any time</strong> — we'd love to see how you've grown.</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr><td style="background:#2563eb;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/affiliate" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Reapply Now &rarr;</a>
        </td></tr>
      </table>
      <p style="margin:0 0 22px;font-size:13px;color:#6b7280;line-height:1.7;">Want to learn more first? Check out our <a href="{{site_url}}/courses" style="color:#2563eb;text-decoration:none;">course catalog</a> to find what fits your audience.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Questions about this decision? We're happy to help — email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Wishing you all the best,<br><strong style="color:#374151;">The Upcalify Team</strong></p>
    `),
  },
  {
    name: "Staff Welcome Email",
    type: "staff_welcome" as const,
    subject: "Welcome to the team, {{name}} — Your Upcalify Staff Access 🎉",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#eef2ff;border-radius:12px;padding:26px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">🎉</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#4338ca;font-family:Arial,Helvetica,sans-serif;">Welcome to the Team!</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#4f46e5;font-family:Arial,Helvetica,sans-serif;">You've been added as a staff member at Upcalify</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.7;">Great news — you now have staff access to the <strong>Upcalify</strong> platform as <strong>{{role_name}}</strong>. Below are your account details. Please keep them safe and do not share them with anyone.</p>

      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:42%;">Name</td>
          <td style="padding:11px 16px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">{{name}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Login Email</td>
          <td style="padding:11px 16px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">{{email}}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Role</td>
          <td style="padding:11px 16px;color:#4338ca;font-weight:700;border-bottom:1px solid #e5e7eb;">{{role_name}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;">Temporary Password</td>
          <td style="padding:11px 16px;color:#111827;font-weight:700;font-family:'Courier New',Courier,monospace;letter-spacing:0.5px;">{{password}}</td>
        </tr>
      </table>

      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#92400e;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">&#128274; <strong>Security tip:</strong> Please change this temporary password right after your first login from your account settings.</p>
        </td></tr>
      </table>

      <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7;"><strong>Your role gives you access to:</strong></p>
      <p style="margin:0 0 22px;padding:12px 16px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#374151;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">{{permissions_summary}}</p>

      <table cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr><td style="background:#4f46e5;border-radius:8px;padding:13px 30px;">
          <a href="{{login_url}}" data-no-track="1" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Login to Staff Panel &rarr;</a>
        </td></tr>
      </table>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;" />
      <p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.7;">If you have any questions, please reach out to the admin who invited you, or email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a>.</p>
      <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Welcome aboard,<br><strong style="color:#374151;">The Upcalify Team</strong></p>
    `),
  },
  {
    name: "Creator Welcome",
    type: "creator_joined" as const,
    subject: "🚀 You're now a Upcalify Creator, {{name}}!",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#fdf4ff;border-radius:12px;padding:26px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">🚀</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#a21caf;font-family:Arial,Helvetica,sans-serif;">Welcome to the Creator Program</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#a21caf;font-family:Arial,Helvetica,sans-serif;">Build, publish and earn — at Upcalify</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Congratulations! 🎉 You have been granted <strong style="color:#a21caf;">Creator</strong> access on Upcalify. You can now publish your own courses and earn commissions on every sale.</p>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;"><strong>Here's what you can do as a Creator:</strong></p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>Create and publish unlimited courses with our easy course builder</li>
        <li>Track sales, students and earnings in real-time</li>
        <li>Earn commissions on every course sale</li>
        <li>Get fast payouts directly to your bank account</li>
      </ul>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr><td style="background:#a21caf;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/creator" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Open Creator Dashboard &rarr;</a>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fdf4ff;border:1px solid #f5d0fe;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#86198f;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">💡 <strong>Quick tip:</strong> Complete your <strong>KYC and bank details</strong> in the dashboard so we can process your payouts without any delay.</p>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;" />
      <p style="margin:0;font-size:14px;color:#6b7280;">Excited to see what you create,<br><strong style="color:#374151;">The Upcalify Creator Team</strong></p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Need help getting started? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Creator Commission Earned",
    type: "creator_commission_earned" as const,
    subject: "💰 New Sale! You earned ₹{{commission_amount}} from {{course_name}}",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#f0fdf4;border-radius:12px;padding:26px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">💰</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#15803d;font-family:Arial,Helvetica,sans-serif;">Cha-ching! New Sale</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#15803d;font-family:Arial,Helvetica,sans-serif;">Your commission has been credited to your wallet</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Great news! A student just purchased one of your courses and your commission has been added to your earnings.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:42%;">Course</td>
          <td style="padding:11px 16px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">{{course_name}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Sale Amount</td>
          <td style="padding:11px 16px;color:#374151;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">&#8377;{{sale_amount}}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Your Commission</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;border-bottom:1px solid #e5e7eb;">{{commission_percent}}%</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#15803d;font-weight:700;font-size:15px;">You Earned</td>
          <td style="padding:11px 16px;color:#15803d;font-weight:700;text-align:right;font-size:18px;">&#8377;{{commission_amount}}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">This commission has been added to your <strong>unpaid earnings</strong>. It will be included in your next scheduled payout to your registered bank account.</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="background:#16a34a;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/creator" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">View Earnings &rarr;</a>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#92400e;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">🚀 <strong>Keep the momentum going!</strong> Promote your courses on social media to maximize your earnings this month.</p>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Creator Payout Sent",
    type: "creator_payout_paid" as const,
    subject: "✅ Your payout of ₹{{payout_amount}} has been sent",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#ecfeff;border-radius:12px;padding:26px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">💸</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#0e7490;font-family:Arial,Helvetica,sans-serif;">Payout Sent</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#0e7490;font-family:Arial,Helvetica,sans-serif;">Your earnings are on their way to your bank</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Great news! We've processed your creator payout. Here's a summary of the transaction:</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#ecfeff;">
          <td style="padding:13px 16px;color:#0e7490;font-weight:700;font-size:15px;border-bottom:1px solid #cffafe;width:42%;">Amount Paid</td>
          <td style="padding:13px 16px;color:#0e7490;font-weight:700;text-align:right;font-size:20px;border-bottom:1px solid #cffafe;">&#8377;{{payout_amount}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Payment Method</td>
          <td style="padding:11px 16px;color:#374151;font-weight:600;text-align:right;text-transform:capitalize;border-bottom:1px solid #e5e7eb;">{{payment_method}}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Reference / Txn ID</td>
          <td style="padding:11px 16px;color:#374151;font-weight:600;text-align:right;font-family:'Courier New',Courier,monospace;border-bottom:1px solid #e5e7eb;">{{payment_reference}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;">Paid On</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;">{{paid_at}}</td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#075985;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">⏱️ Bank transfers usually reflect in your account within <strong>1–3 business days</strong>. If you don't see it after 3 working days, just reply to this email.</p>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="background:#0891b2;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/creator" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">View Payout History &rarr;</a>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:14px;color:#6b7280;">Thank you for being a Upcalify Creator! 🙌<br><strong style="color:#374151;">The Upcalify Creator Team</strong></p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Creator KYC Submitted",
    type: "creator_kyc_submitted" as const,
    subject: "📄 We've received your KYC submission",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#eff6ff;border-radius:12px;padding:24px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">📄</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;">KYC Received</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;">Our team will review your documents shortly</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Thank you for submitting your <strong>creator KYC</strong>. We've successfully received your documents and our verification team will review them in the next 24–48 hours.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:42%;">Submitted By</td>
          <td style="padding:11px 16px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">{{name}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Account Email</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;border-bottom:1px solid #e5e7eb;">{{email}}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;">Status</td>
          <td style="padding:11px 16px;color:#1d4ed8;font-weight:700;text-align:right;">Under Review</td>
        </tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;"><strong>What happens next?</strong></p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>Our team manually verifies every KYC submission to keep the platform safe</li>
        <li>You'll receive an email as soon as a decision has been made</li>
        <li>Once approved, your payouts will be processed automatically</li>
      </ul>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#1e40af;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">💡 <strong>Tip:</strong> While you wait, make sure your <strong>bank details</strong> are also saved in the dashboard so payouts can be sent the moment your KYC is approved.</p>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr><td style="background:#2563eb;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/creator" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Open Creator Dashboard &rarr;</a>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Creator KYC Approved",
    type: "creator_kyc_approved" as const,
    subject: "✅ Your creator KYC has been approved!",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#f0fdf4;border-radius:12px;padding:26px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">✅</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#15803d;font-family:Arial,Helvetica,sans-serif;">KYC Approved</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#15803d;font-family:Arial,Helvetica,sans-serif;">You're now fully verified — payouts are unlocked</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Great news! 🎉 Your KYC documents have been <strong style="color:#15803d;">verified and approved</strong>. Your creator account is now fully active and eligible for payouts.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #bbf7d0;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f0fdf4;">
          <td style="padding:11px 16px;color:#15803d;font-weight:600;border-bottom:1px solid #bbf7d0;width:42%;">✅ KYC Status</td>
          <td style="padding:11px 16px;color:#15803d;font-weight:700;text-align:right;border-bottom:1px solid #bbf7d0;">Verified</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">PAN Holder</td>
          <td style="padding:11px 16px;color:#374151;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">{{pan_name}}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">PAN Number</td>
          <td style="padding:11px 16px;color:#374151;font-weight:600;text-align:right;font-family:'Courier New',Courier,monospace;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">{{pan_number}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;">Reviewed On</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;">{{reviewed_at}}</td>
        </tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;"><strong>What this means for you:</strong></p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>All future commissions will be paid out to your registered bank account</li>
        <li>Past unpaid earnings will be included in your next scheduled payout</li>
        <li>You're now eligible for promotional features and creator spotlights</li>
      </ul>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr><td style="background:#16a34a;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/creator" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Go to Creator Dashboard &rarr;</a>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#92400e;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">🚀 <strong>Time to ship!</strong> Now that you're verified, focus on creating high-quality courses and promoting them — every sale puts money in your bank.</p>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:14px;color:#6b7280;">Welcome to the verified creators club! 🎊<br><strong style="color:#374151;">The Upcalify Creator Team</strong></p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Creator KYC Rejected",
    type: "creator_kyc_rejected" as const,
    subject: "Action needed — Update on your creator KYC",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#fef2f2;border-radius:12px;padding:24px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">⚠️</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#b91c1c;font-family:Arial,Helvetica,sans-serif;">KYC Needs Attention</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#b91c1c;font-family:Arial,Helvetica,sans-serif;">Please review and resubmit your documents</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Thank you for submitting your creator KYC. Unfortunately, we were <strong style="color:#b91c1c;">unable to verify</strong> your documents this time. Please review the reason below and resubmit so we can get you fully activated.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;">
          <p style="margin:0 0 6px;font-size:12px;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">Reason from our review team</p>
          <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">{{rejection_reason}}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;"><strong>How to fix it — common checklist:</strong></p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>Make sure the PAN card image is <strong>clear, in colour, and not blurry</strong></li>
        <li>The <strong>name on PAN must match</strong> the name on your account</li>
        <li>The <strong>full PAN number</strong> must be visible — no part should be cropped</li>
        <li>Use the <strong>original document</strong>, not a screenshot of a screenshot</li>
      </ul>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">Once you fix the issue, you can <strong>resubmit your KYC</strong> right from your creator dashboard — there's no waiting period.</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="background:#dc2626;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/creator" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Resubmit KYC Now &rarr;</a>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#9a3412;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">⚠️ <strong>Note:</strong> Until your KYC is approved, payouts cannot be processed. Your earnings continue to accumulate safely and will be paid once you're verified.</p>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Need help? We're here for you — email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;"><strong style="color:#374151;">The Upcalify Creator Team</strong></p>
    `),
  },
  {
    name: "Affiliate KYC Submitted",
    type: "affiliate_kyc_submitted" as const,
    subject: "📄 We've received your affiliate KYC submission",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#ecfeff;border-radius:12px;padding:24px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">📄</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#0e7490;font-family:Arial,Helvetica,sans-serif;">KYC Received</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#0e7490;font-family:Arial,Helvetica,sans-serif;">Our team will verify your documents shortly</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Thank you for submitting your <strong>affiliate KYC</strong>. We've safely received your documents and our verification team will review them within the next 24–48 hours.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:42%;">Submitted By</td>
          <td style="padding:11px 16px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">{{name}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Account Email</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;border-bottom:1px solid #e5e7eb;">{{email}}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">PAN Number</td>
          <td style="padding:11px 16px;color:#374151;font-weight:600;text-align:right;font-family:'Courier New',Courier,monospace;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">{{pan_number}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;">Status</td>
          <td style="padding:11px 16px;color:#0e7490;font-weight:700;text-align:right;">Under Review</td>
        </tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;"><strong>What happens next?</strong></p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>Our team manually verifies every KYC submission to keep the platform safe</li>
        <li>You'll receive an email as soon as a decision has been made</li>
        <li>Once approved, your commission payouts will be processed automatically</li>
      </ul>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#155e75;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">💡 <strong>Tip:</strong> While you wait, make sure your <strong>bank details</strong> are also saved in the dashboard so payouts can be sent the moment your KYC is approved.</p>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr><td style="background:#0891b2;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/affiliate" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Open Affiliate Dashboard &rarr;</a>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Affiliate KYC Approved",
    type: "affiliate_kyc_approved" as const,
    subject: "✅ Your affiliate KYC has been approved!",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#f0fdf4;border-radius:12px;padding:26px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">✅</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#15803d;font-family:Arial,Helvetica,sans-serif;">KYC Approved</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#15803d;font-family:Arial,Helvetica,sans-serif;">You're now fully verified — payouts are unlocked</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Great news! 🎉 Your KYC documents have been <strong style="color:#15803d;">verified and approved</strong>. Your affiliate account is now fully active and eligible for commission payouts.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #bbf7d0;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f0fdf4;">
          <td style="padding:11px 16px;color:#15803d;font-weight:600;border-bottom:1px solid #bbf7d0;width:42%;">✅ KYC Status</td>
          <td style="padding:11px 16px;color:#15803d;font-weight:700;text-align:right;border-bottom:1px solid #bbf7d0;">Verified</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Affiliate Email</td>
          <td style="padding:11px 16px;color:#374151;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">{{email}}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">PAN Number</td>
          <td style="padding:11px 16px;color:#374151;font-weight:600;text-align:right;font-family:'Courier New',Courier,monospace;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">{{pan_number}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;">Reviewed On</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;">{{reviewed_at}}</td>
        </tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;"><strong>What this means for you:</strong></p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>All future commissions will be paid out to your registered bank account</li>
        <li>Past unpaid earnings will be included in your next scheduled payout</li>
        <li>You're now eligible for promotional features and affiliate spotlights</li>
      </ul>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr><td style="background:#16a34a;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/affiliate" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Go to Affiliate Dashboard &rarr;</a>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#92400e;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">🚀 <strong>Time to promote!</strong> Now that you're verified, share your affiliate link aggressively — every click can convert into commission in your bank.</p>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:14px;color:#6b7280;">Welcome to the verified affiliates club! 🎊<br><strong style="color:#374151;">The Upcalify Affiliate Team</strong></p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
  {
    name: "Affiliate KYC Rejected",
    type: "affiliate_kyc_rejected" as const,
    subject: "Action needed — Update on your affiliate KYC",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#fef2f2;border-radius:12px;padding:24px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">⚠️</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#b91c1c;font-family:Arial,Helvetica,sans-serif;">KYC Needs Attention</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#b91c1c;font-family:Arial,Helvetica,sans-serif;">Please review and resubmit your documents</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Thank you for submitting your affiliate KYC. Unfortunately, we were <strong style="color:#b91c1c;">unable to verify</strong> your documents this time. Please review the reason below and resubmit so we can get you fully activated.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;">
          <p style="margin:0 0 6px;font-size:12px;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">Reason from our review team</p>
          <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">{{rejection_reason}}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;"><strong>How to fix it — common checklist:</strong></p>
      <ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;">
        <li>Make sure both ID and address proof images are <strong>clear, in colour, and not blurry</strong></li>
        <li>The <strong>name on documents must match</strong> the name on your account</li>
        <li>The <strong>PAN number</strong> and other details must be fully visible — no part should be cropped</li>
        <li>Use <strong>original documents</strong>, not screenshots of screenshots</li>
      </ul>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">Once you fix the issue, you can <strong>resubmit your KYC</strong> right from your affiliate dashboard — there's no waiting period.</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="background:#dc2626;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/affiliate" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Resubmit KYC Now &rarr;</a>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#9a3412;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">⚠️ <strong>Note:</strong> Until your KYC is approved, payouts cannot be processed. Your commissions continue to accumulate safely and will be paid once you're verified.</p>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">Need help? We're here for you — email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;"><strong style="color:#374151;">The Upcalify Affiliate Team</strong></p>
    `),
  },
  {
    name: "Affiliate Payout Sent",
    type: "affiliate_payout_paid" as const,
    subject: "✅ Your affiliate payout of ₹{{payout_amount}} has been sent",
    htmlBody: emailWrap(`
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr><td align="center" style="background:#f7fee7;border-radius:12px;padding:26px 20px;">
          <p style="margin:0 0 6px;font-size:48px;line-height:1;">💸</p>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#4d7c0f;font-family:Arial,Helvetica,sans-serif;">Payout Sent</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#4d7c0f;font-family:Arial,Helvetica,sans-serif;">Your earnings are on their way to your bank</p>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Great news! We've processed your affiliate commission payout. Here's a summary of the transaction:</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
        <tr style="background:#f7fee7;">
          <td style="padding:13px 16px;color:#4d7c0f;font-weight:700;font-size:15px;border-bottom:1px solid #d9f99d;width:42%;">Amount Paid</td>
          <td style="padding:13px 16px;color:#4d7c0f;font-weight:700;text-align:right;font-size:20px;border-bottom:1px solid #d9f99d;">&#8377;{{payout_amount}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Payment Method</td>
          <td style="padding:11px 16px;color:#374151;font-weight:600;text-align:right;text-transform:capitalize;border-bottom:1px solid #e5e7eb;">{{payment_method}}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Sent To</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;border-bottom:1px solid #e5e7eb;">{{payment_details}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;color:#6b7280;">Paid On</td>
          <td style="padding:11px 16px;color:#374151;text-align:right;">{{paid_at}}</td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#075985;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">⏱️ Bank transfers usually reflect in your account within <strong>1–3 business days</strong>. If you don't see it after 3 working days, just reply to this email.</p>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="background:#65a30d;border-radius:8px;padding:13px 30px;">
          <a href="{{site_url}}/affiliate" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">View Payout History &rarr;</a>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;">
        <tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#92400e;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">🚀 <strong>Keep going!</strong> Continue sharing your affiliate link to earn even more in the next payout cycle.</p>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
      <p style="margin:0;font-size:14px;color:#6b7280;">Thank you for being a Upcalify Affiliate! 🙌<br><strong style="color:#374151;">The Upcalify Affiliate Team</strong></p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>
    `),
  },
];

router.post("/templates/seed-defaults", requireAdmin, async (_req, res): Promise<void> => {
  const existing = await db.select({ id: emailTemplatesTable.id, type: emailTemplatesTable.type }).from(emailTemplatesTable);
  const existingByType = new Map(existing.map(e => [e.type, e.id]));

  let created = 0;
  let updated = 0;

  for (const t of DEFAULT_TEMPLATES) {
    const existingId = existingByType.get(t.type);
    if (existingId) {
      await db.update(emailTemplatesTable).set({ name: t.name, subject: t.subject, htmlBody: t.htmlBody, isActive: true }).where(eq(emailTemplatesTable.id, existingId));
      updated++;
    } else {
      await db.insert(emailTemplatesTable).values({ ...t, isActive: true });
      created++;
    }
  }

  res.json({ created, updated, message: `${created} created, ${updated} updated` });
});

router.post("/templates", requireAdmin, async (req, res): Promise<void> => {
  const { name, type, subject, htmlBody, isActive } = req.body;
  if (!name || !subject || !htmlBody) { res.status(400).json({ error: "name, subject, htmlBody required" }); return; }
  const [t] = await db.insert(emailTemplatesTable).values({ name, type: type ?? "custom", subject, htmlBody, isActive: isActive !== false }).returning();
  res.status(201).json(t);
});

router.put("/templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, type, subject, htmlBody, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (type !== undefined) updates.type = type;
  if (subject !== undefined) updates.subject = subject;
  if (htmlBody !== undefined) updates.htmlBody = htmlBody;
  if (isActive !== undefined) updates.isActive = isActive;
  const [t] = await db.update(emailTemplatesTable).set(updates).where(eq(emailTemplatesTable.id, id)).returning();
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  res.json(t);
});

router.delete("/templates/:id", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

/* ── Automation ── */
const AUTOMATION_EVENTS = [
  { event: "welcome", label: "Welcome Email", description: "Sent when a new user registers" },
  { event: "purchase", label: "Purchase Confirmation", description: "Sent after a successful payment" },
  { event: "refund", label: "Refund Notification", description: "Sent when a payment is refunded" },
  { event: "forgot_password", label: "Password Reset", description: "Sent when a user requests a password reset" },
  { event: "completion", label: "Course Completion", description: "Sent when a student completes a course" },
  { event: "affiliate_commission", label: "Affiliate Commission", description: "Sent when affiliate earns a commission" },
  { event: "affiliate_application_submitted", label: "Affiliate Application Submitted", description: "Sent when a user submits an affiliate application" },
  { event: "affiliate_application_approved", label: "Affiliate Application Approved", description: "Sent when an admin approves an affiliate application" },
  { event: "affiliate_application_rejected", label: "Affiliate Application Rejected", description: "Sent when an admin rejects an affiliate application" },
  { event: "staff_welcome", label: "Staff Welcome", description: "Sent when a new staff member is added with their login details" },
];

router.get("/automation", requireAdmin, async (_req, res): Promise<void> => {
  const rules = await db.select({
    id: emailAutomationRulesTable.id,
    event: emailAutomationRulesTable.event,
    templateId: emailAutomationRulesTable.templateId,
    isEnabled: emailAutomationRulesTable.isEnabled,
    delayMinutes: emailAutomationRulesTable.delayMinutes,
    updatedAt: emailAutomationRulesTable.updatedAt,
    templateName: emailTemplatesTable.name,
  }).from(emailAutomationRulesTable)
    .leftJoin(emailTemplatesTable, eq(emailAutomationRulesTable.templateId, emailTemplatesTable.id));

  const merged = AUTOMATION_EVENTS.map(ev => {
    const rule = rules.find(r => r.event === ev.event);
    return { ...ev, ...(rule ?? { id: null, isEnabled: false, templateId: null, delayMinutes: 0, templateName: null }) };
  });
  res.json(merged);
});

router.put("/automation/:event", requireAdmin, async (req, res): Promise<void> => {
  const { event } = req.params;
  const { templateId, isEnabled, delayMinutes } = req.body;
  const existing = await db.select().from(emailAutomationRulesTable).where(eq(emailAutomationRulesTable.event, event as any)).limit(1);
  if (existing.length > 0) {
    const [updated] = await db.update(emailAutomationRulesTable).set({
      templateId: templateId ?? null,
      isEnabled: !!isEnabled,
      delayMinutes: parseInt(String(delayMinutes)) || 0,
    }).where(eq(emailAutomationRulesTable.event, event as any)).returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(emailAutomationRulesTable).values({
      event: event as any,
      templateId: templateId ?? null,
      isEnabled: !!isEnabled,
      delayMinutes: parseInt(String(delayMinutes)) || 0,
    }).returning();
    res.json(created);
  }
});

/* ── Campaigns ── */
router.get("/campaigns", requireAdmin, async (_req, res): Promise<void> => {
  const campaigns = await db.select().from(emailCampaignsTable).orderBy(sql`${emailCampaignsTable.createdAt} desc`);
  res.json(campaigns);
});

router.post("/campaigns", requireAdmin, async (req, res): Promise<void> => {
  const { name, subject, templateId, htmlBody, recipientFilter, listId, tagId, scheduledAt } = req.body;
  if (!name || !subject || !htmlBody) { res.status(400).json({ error: "name, subject, htmlBody required" }); return; }

  let recipientCount = 0;
  const allUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isBanned, false));
  if (recipientFilter === "enrolled") {
    const enrolled = await db.select({ userId: enrollmentsTable.userId }).from(enrollmentsTable);
    const enrolledIds = new Set(enrolled.map(e => e.userId));
    recipientCount = allUsers.filter(u => enrolledIds.has(u.id)).length;
  } else if (recipientFilter === "not_enrolled") {
    const enrolled = await db.select({ userId: enrollmentsTable.userId }).from(enrollmentsTable);
    const enrolledIds = new Set(enrolled.map(e => e.userId));
    recipientCount = allUsers.filter(u => !enrolledIds.has(u.id)).length;
  } else if (recipientFilter === "list" && listId) {
    const members = await db.select({ userId: emailListMembersTable.userId }).from(emailListMembersTable).where(eq(emailListMembersTable.listId, parseInt(String(listId))));
    recipientCount = members.length;
  } else if (recipientFilter === "tag" && tagId) {
    const tagged = await db.select({ userId: contactTagAssignmentsTable.userId }).from(contactTagAssignmentsTable).where(eq(contactTagAssignmentsTable.tagId, parseInt(String(tagId))));
    recipientCount = tagged.length;
  } else {
    recipientCount = allUsers.length;
  }

  const status = scheduledAt ? "scheduled" : "draft";
  const [campaign] = await db.insert(emailCampaignsTable).values({
    name, subject,
    templateId: templateId ? parseInt(String(templateId)) : null,
    htmlBody,
    recipientFilter: recipientFilter ?? "all",
    recipientCount,
    listId: listId ? parseInt(String(listId)) : null,
    tagId: tagId ? parseInt(String(tagId)) : null,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    status,
  }).returning();
  res.status(201).json(campaign);
});

router.put("/campaigns/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, subject, htmlBody, recipientFilter } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (subject !== undefined) updates.subject = subject;
  if (htmlBody !== undefined) updates.htmlBody = htmlBody;
  if (recipientFilter !== undefined) updates.recipientFilter = recipientFilter;
  const [c] = await db.update(emailCampaignsTable).set(updates).where(eq(emailCampaignsTable.id, id)).returning();
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  res.json(c);
});

router.delete("/campaigns/:id", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(emailCampaignsTable).where(eq(emailCampaignsTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

router.post("/campaigns/:id/send", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (campaign.status === "sent") { res.status(400).json({ error: "Campaign already sent" }); return; }

  const smtp = await getSmtp();
  if (!smtp || !smtp.isActive) { res.status(400).json({ error: "SMTP not configured or inactive" }); return; }

  await db.update(emailCampaignsTable).set({ status: "sending" }).where(eq(emailCampaignsTable.id, id));
  res.json({ success: true, message: "Campaign is being sent in the background" });

  (async () => {
    try {
      let users: { id: number; email: string; name: string }[] = [];
      if (campaign.recipientFilter === "enrolled") {
        const enrolled = await db.select({ userId: enrollmentsTable.userId }).from(enrollmentsTable);
        const enrolledIds = enrolled.map(e => e.userId);
        if (enrolledIds.length > 0) {
          // SECURITY: previously used sql.raw(`ARRAY[${enrolledIds.join(",")}]`) which is
          // a SQL-injection footgun even though enrolledIds are DB-derived integers.
          // Switched to Drizzle's inArray() which parameterises everything safely.
          users = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
            .from(usersTable)
            .where(and(eq(usersTable.isBanned, false), inArray(usersTable.id, enrolledIds)));
        }
      } else if (campaign.recipientFilter === "not_enrolled") {
        const enrolled = await db.select({ userId: enrollmentsTable.userId }).from(enrollmentsTable);
        const enrolledIds = enrolled.map(e => e.userId);
        users = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
          .from(usersTable)
          .where(enrolledIds.length > 0
            ? and(eq(usersTable.isBanned, false), notInArray(usersTable.id, enrolledIds))
            : eq(usersTable.isBanned, false));
      } else if (campaign.recipientFilter === "list" && campaign.listId) {
        const members = await db.select({ userId: emailListMembersTable.userId }).from(emailListMembersTable).where(eq(emailListMembersTable.listId, campaign.listId));
        const memberIds = members.map(m => m.userId);
        if (memberIds.length > 0) {
          users = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
            .from(usersTable).where(and(eq(usersTable.isBanned, false), inArray(usersTable.id, memberIds)));
        }
      } else if (campaign.recipientFilter === "tag" && campaign.tagId) {
        const tagged = await db.select({ userId: contactTagAssignmentsTable.userId }).from(contactTagAssignmentsTable).where(eq(contactTagAssignmentsTable.tagId, campaign.tagId));
        const taggedIds = tagged.map(t => t.userId);
        if (taggedIds.length > 0) {
          users = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
            .from(usersTable).where(and(eq(usersTable.isBanned, false), inArray(usersTable.id, taggedIds)));
        }
      } else {
        users = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
          .from(usersTable).where(eq(usersTable.isBanned, false));
      }

      let sentCount = 0;
      let failedCount = 0;

      for (const user of users) {
        if (await isUserUnsubscribed(user.id)) continue;
        let html = campaign.htmlBody.replaceAll("{{name}}", user.name).replaceAll("{{email}}", user.email);
        // Substitute {{site_url}} so click-tracking never wraps a literal placeholder.
        let _subject = campaign.subject;
        [_subject, html] = await substituteSiteUrl(_subject, html);
        const token = newTrackingToken();
        const trackedHtml = await injectEmailTracking(html, token);
        try {
          await sendEmailWithFallback(user.email, _subject, trackedHtml);
          await db.insert(emailSendsTable).values({ type: "campaign", campaignId: id, userId: user.id, email: user.email, subject: _subject, htmlBody: trackedHtml, status: "sent", trackingToken: token });
          sentCount++;
        } catch (err: any) {
          await db.insert(emailSendsTable).values({ type: "campaign", campaignId: id, userId: user.id, email: user.email, subject: _subject, htmlBody: trackedHtml, status: "failed", failReason: String(err?.message ?? err), trackingToken: token });
          failedCount++;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      await db.update(emailCampaignsTable).set({ status: "sent", sentCount, failedCount, sentAt: new Date(), recipientCount: users.length }).where(eq(emailCampaignsTable.id, id));
    } catch (err: any) {
      await db.update(emailCampaignsTable).set({ status: "failed" }).where(eq(emailCampaignsTable.id, id));
    }
  })();
});

/* ── Subscribers ── */
async function enrichUsersWithTagsAndLists(users: { id: number }[]) {
  if (users.length === 0) return users as any[];
  const ids = users.map(u => u.id);
  const [tagRows, listRows] = await Promise.all([
    db.select({ userId: contactTagAssignmentsTable.userId, name: contactTagsTable.name, color: contactTagsTable.color })
      .from(contactTagAssignmentsTable)
      .innerJoin(contactTagsTable, eq(contactTagAssignmentsTable.tagId, contactTagsTable.id))
      .where(inArray(contactTagAssignmentsTable.userId, ids)),
    db.select({ userId: emailListMembersTable.userId, name: emailListsTable.name })
      .from(emailListMembersTable)
      .innerJoin(emailListsTable, eq(emailListMembersTable.listId, emailListsTable.id))
      .where(inArray(emailListMembersTable.userId, ids)),
  ]);
  const tagMap: Record<number, { name: string; color: string }[]> = {};
  for (const r of tagRows) { if (!tagMap[r.userId]) tagMap[r.userId] = []; tagMap[r.userId].push({ name: r.name, color: r.color }); }
  const listMap: Record<number, string[]> = {};
  for (const r of listRows) { if (!listMap[r.userId]) listMap[r.userId] = []; listMap[r.userId].push(r.name); }
  return users.map((u: any) => ({ ...u, tags: tagMap[u.id] ?? [], lists: listMap[u.id] ?? [] }));
}

router.get("/subscribers", requireAdmin, async (req, res): Promise<void> => {
  const { search, limit = "50", offset = "0", tagId, listId } = req.query as Record<string, string>;

  if (tagId) {
    const assignments = await db.select({ userId: contactTagAssignmentsTable.userId })
      .from(contactTagAssignmentsTable).where(eq(contactTagAssignmentsTable.tagId, parseInt(tagId)));
    const userIds = assignments.map(a => a.userId);
    if (userIds.length === 0) { res.json({ users: [], total: 0 }); return; }
    let users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, isBanned: usersTable.isBanned, createdAt: usersTable.createdAt })
      .from(usersTable).where(inArray(usersTable.id, userIds));
    if (search) users = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));
    const paginated = users.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    res.json({ users: await enrichUsersWithTagsAndLists(paginated), total: users.length }); return;
  }

  if (listId) {
    const members = await db.select({ userId: emailListMembersTable.userId })
      .from(emailListMembersTable).where(eq(emailListMembersTable.listId, parseInt(listId)));
    const userIds = members.map(m => m.userId);
    if (userIds.length === 0) { res.json({ users: [], total: 0 }); return; }
    let users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, isBanned: usersTable.isBanned, createdAt: usersTable.createdAt })
      .from(usersTable).where(inArray(usersTable.id, userIds));
    if (search) users = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));
    const paginated = users.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    res.json({ users: await enrichUsersWithTagsAndLists(paginated), total: users.length }); return;
  }

  let query = db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
    role: usersTable.role, isBanned: usersTable.isBanned, createdAt: usersTable.createdAt,
  }).from(usersTable).$dynamic();

  if (search) {
    const { ilike, or } = await import("drizzle-orm");
    query = query.where(or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`))!);
  }

  const [users, totalResult] = await Promise.all([
    query.limit(parseInt(limit)).offset(parseInt(offset)),
    db.select({ count: count() }).from(usersTable),
  ]);
  res.json({ users: await enrichUsersWithTagsAndLists(users), total: totalResult[0]?.count ?? 0 });
});

/* ── Dashboard Stats ── */
router.get("/stats", requireAdmin, async (_req, res): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalSubscribers] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.isBanned, false));
  const [sentThisMonth] = await db.select({ count: count() }).from(emailSendsTable)
    .where(sql`${emailSendsTable.sentAt} >= ${startOfMonth}`);
  const [totalCampaigns] = await db.select({ count: count() }).from(emailCampaignsTable).where(eq(emailCampaignsTable.status, "sent"));
  const [automationFired] = await db.select({ count: count() }).from(emailSendsTable).where(eq(emailSendsTable.type, "automation"));
  const [smtpRow] = await db.select({ isActive: smtpSettingsTable.isActive }).from(smtpSettingsTable).limit(1);

  res.json({
    totalSubscribers: totalSubscribers?.count ?? 0,
    sentThisMonth: sentThisMonth?.count ?? 0,
    campaignsSent: totalCampaigns?.count ?? 0,
    automationEmailsFired: automationFired?.count ?? 0,
    smtpConnected: smtpRow?.isActive ?? false,
  });
});

/* ── Dashboard Chart Data ── */
router.get("/dashboard-chart", requireAdmin, async (_req, res): Promise<void> => {
  const [daily, types, totals] = await Promise.all([
    db.execute(sql`
      SELECT
        TO_CHAR(DATE(sent_at AT TIME ZONE 'UTC'), 'DD MMM') AS label,
        DATE(sent_at AT TIME ZONE 'UTC') AS date,
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM email_sends
      WHERE sent_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(sent_at AT TIME ZONE 'UTC')
      ORDER BY date ASC
    `),
    db.execute(sql`
      SELECT type, COUNT(*)::int AS count
      FROM email_sends
      GROUP BY type
      ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM email_sends
      WHERE sent_at >= NOW() - INTERVAL '30 days'
    `),
  ]);
  res.json({ daily: daily.rows, types: types.rows, totals: totals.rows[0] ?? { sent: 0, failed: 0 } });
});

/* ── Send Log ── */
router.get("/sends", requireAdmin, async (req, res): Promise<void> => {
  const { status, search, startDate, endDate, page = "1", pageSize = "25" } = req.query as Record<string, string>;
  const conditions: any[] = [];
  if (status && status !== "all") conditions.push(eq(emailSendsTable.status, status as any));
  if (search?.trim()) conditions.push(or(ilike(emailSendsTable.subject, `%${search}%`), ilike(emailSendsTable.email, `%${search}%`)));
  if (startDate) conditions.push(gte(emailSendsTable.sentAt, new Date(startDate)));
  if (endDate) conditions.push(lte(emailSendsTable.sentAt, new Date(endDate + "T23:59:59")));
  const where = conditions.length ? and(...conditions) : undefined;
  const pg = Math.max(1, parseInt(page));
  const ps = Math.min(100, Math.max(1, parseInt(pageSize)));
  const [{ total }] = await db.select({ total: count() }).from(emailSendsTable).where(where);
  const sends = await db.select().from(emailSendsTable).where(where)
    .orderBy(desc(emailSendsTable.sentAt))
    .limit(ps).offset((pg - 1) * ps);
  res.json({ sends, total, page: pg, pageSize: ps, totalPages: Math.max(1, Math.ceil(total / ps)) });
});

router.post("/sends/:id/resend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [send] = await db.select().from(emailSendsTable).where(eq(emailSendsTable.id, id)).limit(1);
  if (!send) { res.status(404).json({ error: "Not found" }); return; }

  // Resolve HTML before try/catch so it's accessible in the catch block.
  // Prefer stored htmlBody (all sends after the column was added).
  // Fall back to live lookup only for older records that pre-date the column.
  let html: string = send.htmlBody ?? "";
  if (!html) {
    if (send.type === "campaign" && send.campaignId) {
      const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, send.campaignId)).limit(1);
      if (campaign?.htmlBody) html = campaign.htmlBody;
    } else if (send.type === "automation" && send.automationEvent) {
      const [rule] = await db.select().from(emailAutomationRulesTable).where(eq(emailAutomationRulesTable.event, send.automationEvent as any)).limit(1);
      if (rule?.templateId) {
        const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, rule.templateId)).limit(1);
        if (tmpl?.htmlBody) html = tmpl.htmlBody;
      }
      if (!html) {
        const validTypes = ["welcome", "purchase", "refund", "forgot_password", "remarketing", "completion", "affiliate_commission"];
        if (validTypes.includes(send.automationEvent)) {
          const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.type, send.automationEvent as any)).limit(1);
          if (tmpl?.htmlBody) html = tmpl.htmlBody;
        }
      }
    }
  }

  // Substitute {{site_url}} so click-tracking never wraps a literal placeholder,
  // and so the resent email points to the current live domain (in case the
  // original send used an older Site URL).
  let _subject = send.subject;
  [_subject, html] = await substituteSiteUrl(_subject, html);
  const token = newTrackingToken();
  const trackedHtml = await injectEmailTracking(html, token);
  try {
    await sendEmailWithFallback(send.email, _subject, trackedHtml);
    const [newSend] = await db.insert(emailSendsTable).values({ type: send.type, campaignId: send.campaignId, automationEvent: send.automationEvent, userId: send.userId, email: send.email, subject: _subject, htmlBody: trackedHtml, status: "sent", trackingToken: token }).returning();
    res.json({ ok: true, send: newSend });
  } catch (err: any) {
    await db.insert(emailSendsTable).values({ type: send.type, campaignId: send.campaignId, automationEvent: send.automationEvent, userId: send.userId, email: send.email, subject: _subject, htmlBody: trackedHtml, status: "failed", failReason: err.message, trackingToken: token });
    res.status(500).json({ error: err.message });
  }
});

router.get("/sends/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [send] = await db.select().from(emailSendsTable).where(eq(emailSendsTable.id, id)).limit(1);
  if (!send) { res.status(404).json({ error: "Not found" }); return; }
  // Use stored htmlBody if available (all new sends); fall back to reverse-lookup for older records
  let html: string | null = send.htmlBody ?? null;
  let campaignName: string | null = null;
  if (!html) {
    if (send.type === "campaign" && send.campaignId) {
      const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, send.campaignId)).limit(1);
      html = campaign?.htmlBody ?? null;
      campaignName = campaign?.name ?? null;
    } else if (send.type === "automation" && send.automationEvent) {
      const [rule] = await db.select().from(emailAutomationRulesTable).where(eq(emailAutomationRulesTable.event, send.automationEvent as any)).limit(1);
      if (rule?.templateId) {
        const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, rule.templateId)).limit(1);
        html = tmpl?.htmlBody ?? null;
      }
      if (!html) {
        const validTemplateTypes = ["welcome", "purchase", "refund", "forgot_password", "remarketing", "completion", "affiliate_commission"];
        if (validTemplateTypes.includes(send.automationEvent)) {
          const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.type, send.automationEvent as any)).limit(1);
          html = tmpl?.htmlBody ?? null;
        }
      }
    } else if (send.type === "sequence") {
      const step = await db.select().from(emailSequenceStepsTable).where(eq(emailSequenceStepsTable.sequenceId, send.campaignId ?? -1)).limit(1);
      html = step[0]?.htmlBody ?? null;
    }
  }
  // Also resolve campaignName when we already have html (send.htmlBody was set)
  if (send.type === "campaign" && send.campaignId && !campaignName) {
    const [campaign] = await db.select({ name: emailCampaignsTable.name }).from(emailCampaignsTable).where(eq(emailCampaignsTable.id, send.campaignId)).limit(1);
    campaignName = campaign?.name ?? null;
  }
  const smtp = await getSmtp();
  const fromAddress = smtp ? buildFrom(smtp) : null;
  res.json({ ...send, html, fromAddress, campaignName });
});

router.delete("/sends/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(emailSendsTable).where(eq(emailSendsTable.id, id));
  res.json({ ok: true });
});

/* ──────────────── LISTS ──────────────── */

/* Get all lists with member counts */
router.get("/lists", requireAdmin, async (req, res): Promise<void> => {
  const lists = await db.select().from(emailListsTable).orderBy(emailListsTable.createdAt);
  const counts = await db
    .select({ listId: emailListMembersTable.listId, cnt: count() })
    .from(emailListMembersTable)
    .groupBy(emailListMembersTable.listId);
  const countMap: Record<number, number> = {};
  for (const r of counts) countMap[r.listId] = r.cnt;
  res.json(lists.map(l => ({ ...l, memberCount: countMap[l.id] ?? 0 })));
});

/* Create a list */
router.post("/lists", requireAdmin, async (req, res): Promise<void> => {
  const { name, description = "", type = "manual" } = req.body as { name: string; description?: string; type?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
  const [list] = await db.insert(emailListsTable).values({ name: name.trim(), description, type: type as any }).returning();
  res.json(list);
});

/* Update a list */
router.put("/lists/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, description = "" } = req.body as { name: string; description?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
  const [updated] = await db.update(emailListsTable).set({ name: name.trim(), description }).where(eq(emailListsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

/* Delete a list (non-system only) */
router.delete("/lists/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [list] = await db.select().from(emailListsTable).where(eq(emailListsTable.id, id)).limit(1);
  if (!list) { res.status(404).json({ error: "Not found" }); return; }
  if (list.isSystem) { res.status(400).json({ error: "Cannot delete system lists" }); return; }
  await db.delete(emailListsTable).where(eq(emailListsTable.id, id));
  res.json({ ok: true });
});

/* Get members of a list */
router.get("/lists/:id/members", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const members = await db
    .select({
      id: usersTable.id, name: usersTable.name, email: usersTable.email,
      role: usersTable.role, subscribedAt: emailListMembersTable.subscribedAt,
    })
    .from(emailListMembersTable)
    .innerJoin(usersTable, eq(emailListMembersTable.userId, usersTable.id))
    .where(eq(emailListMembersTable.listId, id))
    .orderBy(sql`${emailListMembersTable.subscribedAt} desc`);
  res.json(members);
});

/* Add members to a list (by userId array) */
router.post("/lists/:id/members", requireAdmin, async (req, res): Promise<void> => {
  const listId = parseInt(req.params.id);
  const { userIds } = req.body as { userIds: number[] };
  if (!Array.isArray(userIds) || userIds.length === 0) { res.status(400).json({ error: "userIds required" }); return; }
  const rows = userIds.map(userId => ({ listId, userId }));
  await db.insert(emailListMembersTable).values(rows).onConflictDoNothing();
  res.json({ ok: true, added: rows.length });
});

/* Remove a member from a list */
router.delete("/lists/:id/members/:userId", requireAdmin, async (req, res): Promise<void> => {
  const listId = parseInt(req.params.id);
  const userId = parseInt(req.params.userId);
  await db.delete(emailListMembersTable).where(
    and(eq(emailListMembersTable.listId, listId), eq(emailListMembersTable.userId, userId))
  );
  res.json({ ok: true });
});

/* Sync a smart list (enrolled / all_subscribers) */
router.post("/lists/:id/sync", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [list] = await db.select().from(emailListsTable).where(eq(emailListsTable.id, id)).limit(1);
  if (!list) { res.status(404).json({ error: "Not found" }); return; }

  let userIds: number[] = [];
  if (list.type === "all_subscribers") {
    const users = await db.select({ id: usersTable.id }).from(usersTable);
    userIds = users.map(u => u.id);
  } else if (list.type === "enrolled") {
    const enrollments = await db.select({ userId: enrollmentsTable.userId }).from(enrollmentsTable);
    userIds = [...new Set(enrollments.map(e => e.userId))];
  } else {
    res.status(400).json({ error: "Only smart lists can be synced" }); return;
  }

  if (userIds.length > 0) {
    const rows = userIds.map(userId => ({ listId: id, userId }));
    await db.insert(emailListMembersTable).values(rows).onConflictDoNothing();
  }

  const [{ cnt }] = await db.select({ cnt: count() }).from(emailListMembersTable).where(eq(emailListMembersTable.listId, id));
  res.json({ ok: true, synced: userIds.length, total: cnt });
});

/* Search users not in a list (for adding members) */
router.get("/lists/:id/search-users", requireAdmin, async (req, res): Promise<void> => {
  const listId = parseInt(req.params.id);
  const { q = "" } = req.query as Record<string, string>;
  const existing = await db.select({ userId: emailListMembersTable.userId }).from(emailListMembersTable).where(eq(emailListMembersTable.listId, listId));
  const existingIds = existing.map(e => e.userId);
  const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(
      existingIds.length > 0
        ? and(sql`(${usersTable.name} ilike ${'%' + q + '%'} OR ${usersTable.email} ilike ${'%' + q + '%'})`, notInArray(usersTable.id, existingIds))
        : sql`(${usersTable.name} ilike ${'%' + q + '%'} OR ${usersTable.email} ilike ${'%' + q + '%'})`
    )
    .limit(20);
  res.json(users);
});

/* ──────────────── CONTACT TAGS ──────────────── */
router.get("/tags", requireAdmin, async (_req, res): Promise<void> => {
  const tags = await db.select().from(contactTagsTable).orderBy(asc(contactTagsTable.name));
  const counts = await db.select({ tagId: contactTagAssignmentsTable.tagId, cnt: count() })
    .from(contactTagAssignmentsTable).groupBy(contactTagAssignmentsTable.tagId);
  const countMap: Record<number, number> = {};
  for (const c of counts) countMap[c.tagId] = Number(c.cnt);
  res.json(tags.map(t => ({ ...t, subscriberCount: countMap[t.id] ?? 0 })));
});

router.post("/tags", requireAdmin, async (req, res): Promise<void> => {
  const { name, color, description } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [tag] = await db.insert(contactTagsTable).values({ name, color: color ?? "#6366f1", description: description ?? "" }).returning();
  res.status(201).json(tag);
});

router.put("/tags/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, color, description } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (color !== undefined) updates.color = color;
  if (description !== undefined) updates.description = description;
  const [tag] = await db.update(contactTagsTable).set(updates).where(eq(contactTagsTable.id, id)).returning();
  if (!tag) { res.status(404).json({ error: "Not found" }); return; }
  res.json(tag);
});

router.delete("/tags/:id", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(contactTagsTable).where(eq(contactTagsTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

router.get("/tags/:id/contacts", requireAdmin, async (req, res): Promise<void> => {
  const tagId = parseInt(req.params.id);
  const assignments = await db.select({ userId: contactTagAssignmentsTable.userId })
    .from(contactTagAssignmentsTable).where(eq(contactTagAssignmentsTable.tagId, tagId));
  const userIds = assignments.map(a => a.userId);
  if (userIds.length === 0) { res.json([]); return; }
  const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt })
    .from(usersTable).where(inArray(usersTable.id, userIds));
  res.json(users);
});

router.post("/tags/:id/contacts", requireAdmin, async (req, res): Promise<void> => {
  const tagId = parseInt(req.params.id);
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) { res.status(400).json({ error: "userIds array required" }); return; }
  await db.insert(contactTagAssignmentsTable).values(userIds.map((uid: number) => ({ tagId, userId: uid }))).onConflictDoNothing();
  res.json({ success: true });
});

router.delete("/tags/:tagId/contacts/:userId", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(contactTagAssignmentsTable)
    .where(and(eq(contactTagAssignmentsTable.tagId, parseInt(req.params.tagId)), eq(contactTagAssignmentsTable.userId, parseInt(req.params.userId))));
  res.json({ success: true });
});

/* ──────────────── CONTACT PROFILE ──────────────── */
router.get("/contacts/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  const [tags, emailHistory, listMemberships, enrollments] = await Promise.all([
    db.select({ id: contactTagsTable.id, name: contactTagsTable.name, color: contactTagsTable.color })
      .from(contactTagAssignmentsTable)
      .innerJoin(contactTagsTable, eq(contactTagAssignmentsTable.tagId, contactTagsTable.id))
      .where(eq(contactTagAssignmentsTable.userId, userId)),
    db.select().from(emailSendsTable).where(eq(emailSendsTable.userId, userId)).orderBy(sql`${emailSendsTable.sentAt} desc`).limit(20),
    db.select({ id: emailListsTable.id, name: emailListsTable.name, type: emailListsTable.type })
      .from(emailListMembersTable)
      .innerJoin(emailListsTable, eq(emailListMembersTable.listId, emailListsTable.id))
      .where(eq(emailListMembersTable.userId, userId)),
    db.select({ sequenceId: emailSequenceEnrollmentsTable.sequenceId, currentStep: emailSequenceEnrollmentsTable.currentStep, status: emailSequenceEnrollmentsTable.status, enrolledAt: emailSequenceEnrollmentsTable.enrolledAt })
      .from(emailSequenceEnrollmentsTable).where(eq(emailSequenceEnrollmentsTable.userId, userId)),
  ]);

  const { password: _pw, emailVerifyToken: _evt, passwordResetToken: _prt, ...safeUser } = user as any;
  res.json({ user: safeUser, tags, emailHistory, listMemberships, enrollments });
});

router.post("/contacts/:userId/tags", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId);
  const { tagId } = req.body;
  if (!tagId) { res.status(400).json({ error: "tagId required" }); return; }
  await db.insert(contactTagAssignmentsTable).values({ tagId: parseInt(String(tagId)), userId }).onConflictDoNothing();
  res.json({ success: true });
});

router.delete("/contacts/:userId/tags/:tagId", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(contactTagAssignmentsTable)
    .where(and(eq(contactTagAssignmentsTable.userId, parseInt(req.params.userId)), eq(contactTagAssignmentsTable.tagId, parseInt(req.params.tagId))));
  res.json({ success: true });
});

/* ──────────────── EMAIL SEQUENCES ──────────────── */
router.get("/sequences", requireAdmin, async (_req, res): Promise<void> => {
  const sequences = await db.select().from(emailSequencesTable).orderBy(sql`${emailSequencesTable.createdAt} desc`);
  const stepCounts = await db.select({ sequenceId: emailSequenceStepsTable.sequenceId, cnt: count() })
    .from(emailSequenceStepsTable).groupBy(emailSequenceStepsTable.sequenceId);
  const enrollCounts = await db.select({ sequenceId: emailSequenceEnrollmentsTable.sequenceId, cnt: count() })
    .from(emailSequenceEnrollmentsTable).groupBy(emailSequenceEnrollmentsTable.sequenceId);
  const stepMap: Record<number, number> = {};
  const enrollMap: Record<number, number> = {};
  for (const s of stepCounts) stepMap[s.sequenceId] = Number(s.cnt);
  for (const e of enrollCounts) enrollMap[e.sequenceId] = Number(e.cnt);
  res.json(sequences.map(s => ({ ...s, stepCount: stepMap[s.id] ?? 0, enrolledCount: enrollMap[s.id] ?? 0 })));
});

router.post("/sequences", requireAdmin, async (req, res): Promise<void> => {
  const { name, description, trigger, triggerFilter } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [seq] = await db.insert(emailSequencesTable).values({ name, description: description ?? "", trigger: trigger ?? "manual", triggerFilter: triggerFilter ?? null }).returning();
  res.status(201).json(seq);
});

router.put("/sequences/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, description, trigger, triggerFilter, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (trigger !== undefined) updates.trigger = trigger;
  if (triggerFilter !== undefined) updates.triggerFilter = triggerFilter;
  if (isActive !== undefined) updates.isActive = isActive;
  const [seq] = await db.update(emailSequencesTable).set(updates).where(eq(emailSequencesTable.id, id)).returning();
  if (!seq) { res.status(404).json({ error: "Not found" }); return; }
  res.json(seq);
});

router.delete("/sequences/:id", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(emailSequencesTable).where(eq(emailSequencesTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

/* Sequence Steps */
router.get("/sequences/:id/steps", requireAdmin, async (req, res): Promise<void> => {
  const steps = await db.select().from(emailSequenceStepsTable)
    .where(eq(emailSequenceStepsTable.sequenceId, parseInt(req.params.id)))
    .orderBy(asc(emailSequenceStepsTable.stepOrder));
  res.json(steps);
});

router.post("/sequences/:id/steps", requireAdmin, async (req, res): Promise<void> => {
  const sequenceId = parseInt(req.params.id);
  const { subject, htmlBody, delayDays, stepOrder } = req.body;
  if (!subject) { res.status(400).json({ error: "subject required" }); return; }
  const existing = await db.select({ cnt: count() }).from(emailSequenceStepsTable).where(eq(emailSequenceStepsTable.sequenceId, sequenceId));
  const order = stepOrder ?? (Number(existing[0]?.cnt ?? 0) + 1);
  const [step] = await db.insert(emailSequenceStepsTable).values({ sequenceId, subject, htmlBody: htmlBody ?? "", delayDays: delayDays ?? 0, stepOrder: order }).returning();
  res.status(201).json(step);
});

router.put("/sequences/:id/steps/:stepId", requireAdmin, async (req, res): Promise<void> => {
  const stepId = parseInt(req.params.stepId);
  const { subject, htmlBody, delayDays, stepOrder } = req.body;
  const updates: Record<string, unknown> = {};
  if (subject !== undefined) updates.subject = subject;
  if (htmlBody !== undefined) updates.htmlBody = htmlBody;
  if (delayDays !== undefined) updates.delayDays = delayDays;
  if (stepOrder !== undefined) updates.stepOrder = stepOrder;
  const [step] = await db.update(emailSequenceStepsTable).set(updates).where(eq(emailSequenceStepsTable.id, stepId)).returning();
  if (!step) { res.status(404).json({ error: "Not found" }); return; }
  res.json(step);
});

router.delete("/sequences/:id/steps/:stepId", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(emailSequenceStepsTable).where(eq(emailSequenceStepsTable.id, parseInt(req.params.stepId)));
  res.json({ success: true });
});

/* Sequence Enrollments */
router.get("/sequences/:id/enrollments", requireAdmin, async (req, res): Promise<void> => {
  const seqId = parseInt(req.params.id);
  const enrollments = await db.select({
    id: emailSequenceEnrollmentsTable.id,
    userId: emailSequenceEnrollmentsTable.userId,
    currentStep: emailSequenceEnrollmentsTable.currentStep,
    status: emailSequenceEnrollmentsTable.status,
    enrolledAt: emailSequenceEnrollmentsTable.enrolledAt,
    completedAt: emailSequenceEnrollmentsTable.completedAt,
    nextSendAt: emailSequenceEnrollmentsTable.nextSendAt,
    userName: usersTable.name,
    userEmail: usersTable.email,
  }).from(emailSequenceEnrollmentsTable)
    .innerJoin(usersTable, eq(emailSequenceEnrollmentsTable.userId, usersTable.id))
    .where(eq(emailSequenceEnrollmentsTable.sequenceId, seqId))
    .orderBy(sql`${emailSequenceEnrollmentsTable.enrolledAt} desc`);
  res.json(enrollments);
});

router.post("/sequences/:id/enrollments", requireAdmin, async (req, res): Promise<void> => {
  const sequenceId = parseInt(req.params.id);
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) { res.status(400).json({ error: "userIds required" }); return; }

  const steps = await db.select().from(emailSequenceStepsTable)
    .where(eq(emailSequenceStepsTable.sequenceId, sequenceId))
    .orderBy(asc(emailSequenceStepsTable.stepOrder));

  const firstNextSend = steps.length > 0 ? new Date() : null;

  const rows = userIds.map((uid: number) => ({
    sequenceId, userId: uid, currentStep: 0, status: "active" as const,
    nextSendAt: firstNextSend,
  }));
  await db.insert(emailSequenceEnrollmentsTable).values(rows).onConflictDoNothing();
  res.json({ success: true, enrolled: userIds.length });
});

router.delete("/sequences/:id/enrollments/:userId", requireAdmin, async (req, res): Promise<void> => {
  await db.update(emailSequenceEnrollmentsTable)
    .set({ status: "cancelled" })
    .where(and(
      eq(emailSequenceEnrollmentsTable.sequenceId, parseInt(req.params.id)),
      eq(emailSequenceEnrollmentsTable.userId, parseInt(req.params.userId)),
    ));
  res.json({ success: true });
});

/* ──────────────── SEQUENCE PROCESSOR ──────────────── */
export async function processSequences(): Promise<void> {
  try {
    const smtp = await getSmtp();
    if (!smtp || !smtp.isActive) return;

    const now = new Date();
    const dueEnrollments = await db.select().from(emailSequenceEnrollmentsTable)
      .where(and(
        eq(emailSequenceEnrollmentsTable.status, "active"),
        sql`${emailSequenceEnrollmentsTable.nextSendAt} <= ${now}`,
      ));

    if (dueEnrollments.length === 0) return;

    for (const enrollment of dueEnrollments) {
      const steps = await db.select().from(emailSequenceStepsTable)
        .where(eq(emailSequenceStepsTable.sequenceId, enrollment.sequenceId))
        .orderBy(asc(emailSequenceStepsTable.stepOrder));

      const currentStepData = steps[enrollment.currentStep];
      if (!currentStepData) {
        await db.update(emailSequenceEnrollmentsTable).set({ status: "completed", completedAt: now }).where(eq(emailSequenceEnrollmentsTable.id, enrollment.id));
        continue;
      }

      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, enrollment.userId)).limit(1);
      if (!user) continue;

      let html = currentStepData.htmlBody.replaceAll("{{name}}", user.name).replaceAll("{{email}}", user.email);
      let subject = currentStepData.subject.replaceAll("{{name}}", user.name).replaceAll("{{email}}", user.email);
      // Substitute {{site_url}} so click-tracking never wraps a literal placeholder.
      [subject, html] = await substituteSiteUrl(subject, html);

      if (await isUserUnsubscribed(user.id)) {
        // Skip silently — user has opted out of emails
      } else {
        const token = newTrackingToken();
        const trackedHtml = await injectEmailTracking(html, token);
        try {
          await sendEmailWithFallback(user.email, subject, trackedHtml);
          await db.insert(emailSendsTable).values({ type: "sequence", userId: user.id, email: user.email, subject, htmlBody: trackedHtml, status: "sent", trackingToken: token });
        } catch (err: any) {
          await db.insert(emailSendsTable).values({ type: "sequence", userId: user.id, email: user.email, subject, htmlBody: trackedHtml, status: "failed", failReason: String(err?.message ?? err), trackingToken: token });
        }
      }

      const nextStepIndex = enrollment.currentStep + 1;
      if (nextStepIndex >= steps.length) {
        await db.update(emailSequenceEnrollmentsTable).set({ status: "completed", completedAt: now, currentStep: nextStepIndex, nextSendAt: null }).where(eq(emailSequenceEnrollmentsTable.id, enrollment.id));
      } else {
        const nextStep = steps[nextStepIndex];
        const nextSendAt = new Date(now.getTime() + (nextStep.delayDays * 24 * 60 * 60 * 1000));
        await db.update(emailSequenceEnrollmentsTable).set({ currentStep: nextStepIndex, nextSendAt }).where(eq(emailSequenceEnrollmentsTable.id, enrollment.id));
      }
    }
  } catch {
  }
}

/* Process scheduled campaigns */
export async function processScheduledCampaigns(): Promise<void> {
  try {
    const now = new Date();
    const scheduled = await db.select().from(emailCampaignsTable)
      .where(and(eq(emailCampaignsTable.status, "scheduled"), sql`${emailCampaignsTable.scheduledAt} <= ${now}`));
    for (const campaign of scheduled) {
      const smtp = await getSmtp();
      if (!smtp || !smtp.isActive) continue;
      await db.update(emailCampaignsTable).set({ status: "sending" }).where(eq(emailCampaignsTable.id, campaign.id));
      (async () => {
        try {
          let users: { id: number; email: string; name: string }[] = [];
          if (campaign.recipientFilter === "list" && campaign.listId) {
            const members = await db.select({ userId: emailListMembersTable.userId }).from(emailListMembersTable).where(eq(emailListMembersTable.listId, campaign.listId));
            const ids = members.map(m => m.userId);
            if (ids.length > 0) users = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name }).from(usersTable).where(and(eq(usersTable.isBanned, false), inArray(usersTable.id, ids)));
          } else {
            users = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.isBanned, false));
          }
          let sentCount = 0; let failedCount = 0;
          for (const user of users) {
            if (await isUserUnsubscribed(user.id)) continue;
            let html = campaign.htmlBody.replaceAll("{{name}}", user.name).replaceAll("{{email}}", user.email);
            // Substitute {{site_url}} so click-tracking never wraps a literal placeholder.
            let _subject = campaign.subject;
            [_subject, html] = await substituteSiteUrl(_subject, html);
            const token = newTrackingToken();
            const trackedHtml = await injectEmailTracking(html, token);
            try {
              await sendEmailWithFallback(user.email, _subject, trackedHtml);
              await db.insert(emailSendsTable).values({ type: "campaign", campaignId: campaign.id, userId: user.id, email: user.email, subject: _subject, htmlBody: trackedHtml, status: "sent", trackingToken: token });
              sentCount++;
            } catch (err: any) {
              await db.insert(emailSendsTable).values({ type: "campaign", campaignId: campaign.id, userId: user.id, email: user.email, subject: _subject, htmlBody: trackedHtml, status: "failed", failReason: String(err?.message ?? err), trackingToken: token });
              failedCount++;
            }
            await new Promise(r => setTimeout(r, 100));
          }
          await db.update(emailCampaignsTable).set({ status: "sent", sentCount, failedCount, sentAt: new Date() }).where(eq(emailCampaignsTable.id, campaign.id));
        } catch {
          await db.update(emailCampaignsTable).set({ status: "failed" }).where(eq(emailCampaignsTable.id, campaign.id));
        }
      })();
    }
  } catch {
  }
}

router.post("/sequences/process", requireAdmin, async (_req, res): Promise<void> => {
  await processSequences();
  await processScheduledCampaigns();
  res.json({ success: true, message: "Processed sequences and scheduled campaigns" });
});

/* ══════════════════════════════ AUTOMATION FUNNELS ══════════════════════════════ */

router.get("/funnels", requireAdmin, async (_req, res): Promise<void> => {
  const funnels = await db.select().from(automationFunnelsTable).orderBy(asc(automationFunnelsTable.createdAt));
  const steps = await db.select().from(automationFunnelStepsTable).orderBy(asc(automationFunnelStepsTable.stepOrder));
  const result = funnels.map(f => ({
    ...f,
    steps: steps.filter(s => s.funnelId === f.id),
  }));
  res.json(result);
});

router.post("/funnels", requireAdmin, async (req, res): Promise<void> => {
  const { name, triggerType, triggerConfig } = req.body;
  if (!name || !triggerType) { res.status(400).json({ error: "name and triggerType required" }); return; }
  const [funnel] = await db.insert(automationFunnelsTable).values({ name, triggerType, triggerConfig: triggerConfig ?? {} }).returning();
  res.json({ ...funnel, steps: [] });
});

router.get("/funnels/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [funnel] = await db.select().from(automationFunnelsTable).where(eq(automationFunnelsTable.id, id)).limit(1);
  if (!funnel) { res.status(404).json({ error: "Funnel not found" }); return; }
  const steps = await db.select().from(automationFunnelStepsTable).where(eq(automationFunnelStepsTable.funnelId, id)).orderBy(asc(automationFunnelStepsTable.stepOrder));
  res.json({ ...funnel, steps });
});

router.put("/funnels/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, triggerType, triggerConfig, status, isActive } = req.body;

  const metaUpdates: Record<string, unknown> = {};
  if (name !== undefined) metaUpdates.name = name;
  if (triggerType !== undefined) metaUpdates.triggerType = triggerType;
  if (triggerConfig !== undefined) metaUpdates.triggerConfig = triggerConfig;
  if (status !== undefined) metaUpdates.status = status;
  if (isActive !== undefined) metaUpdates.isActive = Boolean(isActive);

  let updated: typeof automationFunnelsTable.$inferSelect | undefined;
  if (Object.keys(metaUpdates).length > 0) {
    const rows = await db.update(automationFunnelsTable).set(metaUpdates).where(eq(automationFunnelsTable.id, id)).returning();
    updated = rows[0];
  } else {
    const rows = await db.select().from(automationFunnelsTable).where(eq(automationFunnelsTable.id, id)).limit(1);
    updated = rows[0];
  }

  if (!updated) { res.status(404).json({ error: "Funnel not found" }); return; }
  const steps = await db.select().from(automationFunnelStepsTable).where(eq(automationFunnelStepsTable.funnelId, id)).orderBy(asc(automationFunnelStepsTable.stepOrder));
  res.json({ ...updated, steps });
});

router.delete("/funnels/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(automationFunnelsTable).where(eq(automationFunnelsTable.id, id));
  res.json({ success: true });
});

/* Report / analytics for a single funnel */
router.get("/funnels/:id/report", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [funnel] = await db.select().from(automationFunnelsTable).where(eq(automationFunnelsTable.id, id)).limit(1);
  if (!funnel) { res.status(404).json({ error: "Funnel not found" }); return; }

  const steps = await db.select().from(automationFunnelStepsTable)
    .where(eq(automationFunnelStepsTable.funnelId, id))
    .orderBy(asc(automationFunnelStepsTable.stepOrder));

  // Emails sent by this funnel are tagged with type='automation' and automationEvent=triggerType.
  // Note: if multiple funnels share the same trigger type, their stats overlap.
  const sendFilter = and(
    eq(emailSendsTable.type, "automation"),
    eq(emailSendsTable.automationEvent, funnel.triggerType),
  );

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalRow] = await db.select({ c: count() }).from(emailSendsTable).where(sendFilter);
  const [sentRow] = await db.select({ c: count() }).from(emailSendsTable)
    .where(and(sendFilter, eq(emailSendsTable.status, "sent")));
  const [failedRow] = await db.select({ c: count() }).from(emailSendsTable)
    .where(and(sendFilter, eq(emailSendsTable.status, "failed")));
  const [todayRow] = await db.select({ c: count() }).from(emailSendsTable)
    .where(and(sendFilter, gte(emailSendsTable.sentAt, startOfToday)));
  const [last7Row] = await db.select({ c: count() }).from(emailSendsTable)
    .where(and(sendFilter, gte(emailSendsTable.sentAt, start7d)));
  const [last30Row] = await db.select({ c: count() }).from(emailSendsTable)
    .where(and(sendFilter, gte(emailSendsTable.sentAt, start30d)));
  const [uniqueRow] = await db.select({ c: sql<number>`count(distinct ${emailSendsTable.userId})` }).from(emailSendsTable).where(sendFilter);
  const [openedRow] = await db.select({ c: count() }).from(emailSendsTable)
    .where(and(sendFilter, eq(emailSendsTable.status, "sent"), sql`${emailSendsTable.openedAt} is not null`));
  const [clickedRow] = await db.select({ c: count() }).from(emailSendsTable)
    .where(and(sendFilter, sql`${emailSendsTable.clickedAt} is not null`));
  const [unsubRow] = await db.select({ c: count() }).from(emailSendsTable)
    .where(and(sendFilter, sql`${emailSendsTable.unsubscribedAt} is not null`));

  // Last 7 days daily breakdown for the chart
  const dailyRows = await db.select({
    day: sql<string>`to_char(${emailSendsTable.sentAt}, 'YYYY-MM-DD')`,
    sent: sql<number>`count(*) filter (where ${emailSendsTable.status} = 'sent')`,
    failed: sql<number>`count(*) filter (where ${emailSendsTable.status} = 'failed')`,
  }).from(emailSendsTable)
    .where(and(sendFilter, gte(emailSendsTable.sentAt, start7d)))
    .groupBy(sql`to_char(${emailSendsTable.sentAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${emailSendsTable.sentAt}, 'YYYY-MM-DD')`);

  // Recent sends (last 25)
  const recent = await db.select({
    id: emailSendsTable.id,
    subject: emailSendsTable.subject,
    email: emailSendsTable.email,
    status: emailSendsTable.status,
    failReason: emailSendsTable.failReason,
    sentAt: emailSendsTable.sentAt,
    htmlBody: emailSendsTable.htmlBody,
    userName: usersTable.name,
  }).from(emailSendsTable)
    .leftJoin(usersTable, eq(usersTable.id, emailSendsTable.userId))
    .where(sendFilter)
    .orderBy(desc(emailSendsTable.sentAt))
    .limit(25);

  const total = Number(totalRow?.c ?? 0);
  const sent = Number(sentRow?.c ?? 0);
  const failed = Number(failedRow?.c ?? 0);
  const opened = Number(openedRow?.c ?? 0);
  const clicked = Number(clickedRow?.c ?? 0);
  const unsubscribed = Number(unsubRow?.c ?? 0);
  const successRate = total > 0 ? Math.round((sent / total) * 1000) / 10 : 0;
  const openRate = sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0;
  const clickRate = sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : 0;

  res.json({
    funnel: { id: funnel.id, name: funnel.name, triggerType: funnel.triggerType, status: funnel.status, isActive: funnel.isActive, createdAt: funnel.createdAt },
    stats: {
      total, sent, failed, successRate,
      today: Number(todayRow?.c ?? 0),
      last7: Number(last7Row?.c ?? 0),
      last30: Number(last30Row?.c ?? 0),
      uniqueRecipients: Number(uniqueRow?.c ?? 0),
      opened, openRate,
      clicked, clickRate,
      unsubscribed,
      stepCount: steps.length,
      emailStepCount: steps.filter(s => s.actionType === "send_email").length,
    },
    daily: dailyRows.map(r => ({ day: r.day, sent: Number(r.sent ?? 0), failed: Number(r.failed ?? 0) })),
    recent,
    note: "Stats include all emails dispatched for this trigger type. If multiple funnels share the same trigger, their sends are aggregated together.",
  });
});

/* ── Step Report: per-step entered/completed/failed counts (Chart Report tab) ── */
router.get("/funnels/:id/step-report", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid funnel id" }); return; }
  const [funnel] = await db.select().from(automationFunnelsTable).where(eq(automationFunnelsTable.id, id)).limit(1);
  if (!funnel) { res.status(404).json({ error: "Funnel not found" }); return; }

  const steps = await db.select().from(automationFunnelStepsTable)
    .where(eq(automationFunnelStepsTable.funnelId, id))
    .orderBy(asc(automationFunnelStepsTable.stepOrder));

  const [totalExecRow] = await db.select({ c: count() }).from(funnelExecutionsTable)
    .where(eq(funnelExecutionsTable.funnelId, id));
  const totalExecutions = Number(totalExecRow?.c ?? 0);

  // For each step, count completed / failed / pending across all executions of this funnel
  const stepStats = await Promise.all(steps.map(async (step) => {
    const [completedRow] = await db.select({ c: count() }).from(funnelExecutionStepsTable)
      .innerJoin(funnelExecutionsTable, eq(funnelExecutionStepsTable.executionId, funnelExecutionsTable.id))
      .where(and(
        eq(funnelExecutionsTable.funnelId, id),
        eq(funnelExecutionStepsTable.funnelStepId, step.id),
        eq(funnelExecutionStepsTable.status, "completed"),
      ));
    const [failedRow] = await db.select({ c: count() }).from(funnelExecutionStepsTable)
      .innerJoin(funnelExecutionsTable, eq(funnelExecutionStepsTable.executionId, funnelExecutionsTable.id))
      .where(and(
        eq(funnelExecutionsTable.funnelId, id),
        eq(funnelExecutionStepsTable.funnelStepId, step.id),
        eq(funnelExecutionStepsTable.status, "failed"),
      ));
    const [pendingRow] = await db.select({ c: count() }).from(funnelExecutionStepsTable)
      .innerJoin(funnelExecutionsTable, eq(funnelExecutionStepsTable.executionId, funnelExecutionsTable.id))
      .where(and(
        eq(funnelExecutionsTable.funnelId, id),
        eq(funnelExecutionStepsTable.funnelStepId, step.id),
        eq(funnelExecutionStepsTable.status, "pending"),
      ));
    const completed = Number(completedRow?.c ?? 0);
    const failed = Number(failedRow?.c ?? 0);
    const pending = Number(pendingRow?.c ?? 0);
    const entered = completed + failed + pending;
    const completionRate = entered > 0 ? Math.round((completed / entered) * 1000) / 10 : 0;
    const cfg = step.config as Record<string, unknown>;
    const customLabel = typeof step.label === "string" ? step.label.trim() : "";
    let label = step.actionType;
    if (customLabel) label = customLabel;
    else if (step.actionType === "send_email" && cfg.subject) label = String(cfg.subject);
    return {
      stepId: step.id,
      stepOrder: step.stepOrder,
      actionType: step.actionType,
      label,
      customLabel: customLabel || null,
      entered,
      completed,
      failed,
      pending,
      completionRate,
    };
  }));

  res.json({
    funnel: { id: funnel.id, name: funnel.name, triggerType: funnel.triggerType, status: funnel.status, isActive: funnel.isActive, createdAt: funnel.createdAt },
    totalExecutions,
    steps: stepStats,
  });
});

/* ── Individual Reporting: paginated list of per-contact funnel executions ── */
router.get("/funnels/:id/executions", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid funnel id" }); return; }
  const [funnel] = await db.select().from(automationFunnelsTable).where(eq(automationFunnelsTable.id, id)).limit(1);
  if (!funnel) { res.status(404).json({ error: "Funnel not found" }); return; }

  const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "10")) || 10));
  const offset = (page - 1) * limit;
  const statusFilter = String(req.query.status ?? "all");
  const search = String(req.query.search ?? "").trim();

  const whereParts: any[] = [eq(funnelExecutionsTable.funnelId, id)];
  if (statusFilter !== "all") whereParts.push(eq(funnelExecutionsTable.status, statusFilter));
  if (search) whereParts.push(or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`)));
  const whereClause = and(...whereParts);

  const [totalRow] = await db.select({ c: count() }).from(funnelExecutionsTable)
    .leftJoin(usersTable, eq(usersTable.id, funnelExecutionsTable.userId))
    .where(whereClause);

  const rows = await db.select({
    id: funnelExecutionsTable.id,
    funnelId: funnelExecutionsTable.funnelId,
    userId: funnelExecutionsTable.userId,
    status: funnelExecutionsTable.status,
    currentStepOrder: funnelExecutionsTable.currentStepOrder,
    nextActionType: funnelExecutionsTable.nextActionType,
    startedAt: funnelExecutionsTable.startedAt,
    lastExecutedAt: funnelExecutionsTable.lastExecutedAt,
    completedAt: funnelExecutionsTable.completedAt,
    userName: usersTable.name,
    userEmail: usersTable.email,
  }).from(funnelExecutionsTable)
    .leftJoin(usersTable, eq(usersTable.id, funnelExecutionsTable.userId))
    .where(whereClause)
    .orderBy(desc(funnelExecutionsTable.lastExecutedAt))
    .limit(limit)
    .offset(offset);

  // Find latest completed step's action type for each execution (for "Latest Action" column)
  const executionIds = rows.map(r => r.id);
  const latestStepsMap = new Map<number, { actionType: string; executedAt: Date | null; label: string }>();
  if (executionIds.length > 0) {
    const latestSteps = await db.select({
      executionId: funnelExecutionStepsTable.executionId,
      actionType: funnelExecutionStepsTable.actionType,
      executedAt: funnelExecutionStepsTable.executedAt,
      stepOrder: funnelExecutionStepsTable.stepOrder,
      funnelStepId: funnelExecutionStepsTable.funnelStepId,
    }).from(funnelExecutionStepsTable)
      .where(and(
        inArray(funnelExecutionStepsTable.executionId, executionIds),
        eq(funnelExecutionStepsTable.status, "completed"),
      ))
      .orderBy(desc(funnelExecutionStepsTable.stepOrder));
    // Need step labels (custom Internal Label > subject line for emails > action type)
    const allFunnelSteps = await db.select().from(automationFunnelStepsTable).where(eq(automationFunnelStepsTable.funnelId, id));
    const stepLabelMap = new Map<number, string>();
    for (const s of allFunnelSteps) {
      const cfg = s.config as Record<string, unknown>;
      const customLabel = typeof s.label === "string" ? s.label.trim() : "";
      let label = s.actionType;
      if (customLabel) label = customLabel;
      else if (s.actionType === "send_email" && cfg.subject) label = String(cfg.subject);
      stepLabelMap.set(s.id, label);
    }
    for (const ls of latestSteps) {
      if (!latestStepsMap.has(ls.executionId)) {
        latestStepsMap.set(ls.executionId, {
          actionType: ls.actionType,
          executedAt: ls.executedAt,
          label: stepLabelMap.get(ls.funnelStepId) ?? ls.actionType,
        });
      }
    }
  }

  // Build label lookup for next step from funnel steps
  const allSteps = await db.select().from(automationFunnelStepsTable)
    .where(eq(automationFunnelStepsTable.funnelId, id))
    .orderBy(asc(automationFunnelStepsTable.stepOrder));

  const enriched = rows.map(r => {
    const next = allSteps.find(s => s.stepOrder > r.currentStepOrder);
    let nextLabel = r.nextActionType ?? null;
    if (next) {
      const cfg = next.config as Record<string, unknown>;
      nextLabel = next.actionType === "send_email" && cfg.subject ? String(cfg.subject) : next.actionType;
    }
    const latest = latestStepsMap.get(r.id);
    return {
      ...r,
      latestActionLabel: latest?.label ?? null,
      latestActionAt: latest?.executedAt ?? null,
      nextStepLabel: r.status === "completed" ? null : nextLabel,
    };
  });

  res.json({
    funnel: { id: funnel.id, name: funnel.name, triggerType: funnel.triggerType, createdAt: funnel.createdAt },
    total: Number(totalRow?.c ?? 0),
    page,
    limit,
    rows: enriched,
  });
});

/* ── Single execution detail (for the expandable step list in Individual Reporting) ── */
router.get("/funnels/:id/executions/:executionId", requireAdmin, async (req, res): Promise<void> => {
  const funnelId = Number(req.params.id);
  const executionId = Number(req.params.executionId);
  if (!Number.isInteger(funnelId) || funnelId <= 0 || !Number.isInteger(executionId) || executionId <= 0) {
    res.status(400).json({ error: "Invalid id" }); return;
  }
  // Run the 3 independent queries in parallel — funnelId comes from URL so step/funnel-step
  // queries don't need to wait on the execution row. Cuts latency from 3 round-trips to 1.
  const [execRows, steps, allFunnelSteps] = await Promise.all([
    db.select().from(funnelExecutionsTable)
      .where(and(eq(funnelExecutionsTable.id, executionId), eq(funnelExecutionsTable.funnelId, funnelId))).limit(1),
    db.select({
      id: funnelExecutionStepsTable.id,
      funnelStepId: funnelExecutionStepsTable.funnelStepId,
      stepOrder: funnelExecutionStepsTable.stepOrder,
      actionType: funnelExecutionStepsTable.actionType,
      status: funnelExecutionStepsTable.status,
      executedAt: funnelExecutionStepsTable.executedAt,
      errorMessage: funnelExecutionStepsTable.errorMessage,
    }).from(funnelExecutionStepsTable)
      .where(eq(funnelExecutionStepsTable.executionId, executionId))
      .orderBy(asc(funnelExecutionStepsTable.stepOrder)),
    db.select().from(automationFunnelStepsTable)
      .where(eq(automationFunnelStepsTable.funnelId, funnelId)),
  ]);
  const exec = execRows[0];
  if (!exec) { res.status(404).json({ error: "Execution not found" }); return; }

  const labelMap = new Map<number, string>();
  for (const s of allFunnelSteps) {
    const cfg = (s.config ?? {}) as Record<string, unknown>;
    const customLabel = typeof s.label === "string" ? s.label.trim() : "";
    let label: string;
    if (customLabel) label = customLabel;
    else if (s.actionType === "send_email" && cfg.subject) label = String(cfg.subject);
    else label = s.actionType;
    labelMap.set(s.id, label);
  }

  res.json({
    execution: exec,
    steps: steps.map(s => ({ ...s, label: labelMap.get(s.funnelStepId) ?? s.actionType })),
  });
});

/* ── Delete an individual execution row ── */
router.delete("/funnels/:id/executions/:executionId", requireAdmin, async (req, res): Promise<void> => {
  const funnelId = Number(req.params.id);
  const executionId = Number(req.params.executionId);
  if (!Number.isInteger(funnelId) || funnelId <= 0 || !Number.isInteger(executionId) || executionId <= 0) {
    res.status(400).json({ error: "Invalid id" }); return;
  }
  await db.delete(funnelExecutionsTable)
    .where(and(eq(funnelExecutionsTable.id, executionId), eq(funnelExecutionsTable.funnelId, funnelId)));
  res.json({ success: true });
});

router.post("/funnels/:id/steps", requireAdmin, async (req, res): Promise<void> => {
  const funnelId = parseInt(req.params.id);
  const { actionType, config, insertAfterOrder, label } = req.body;
  if (!actionType) { res.status(400).json({ error: "actionType required" }); return; }

  // Shift existing steps after insertion point
  const insertOrder = typeof insertAfterOrder === "number" ? insertAfterOrder + 1 : 9999;
  await db.execute(sql`UPDATE automation_funnel_steps SET step_order = step_order + 1 WHERE funnel_id = ${funnelId} AND step_order >= ${insertOrder}`);

  const trimmedLabel = typeof label === "string" ? label.trim() : "";
  const [step] = await db.insert(automationFunnelStepsTable).values({
    funnelId,
    actionType,
    config: config ?? {},
    stepOrder: insertOrder,
    label: trimmedLabel ? trimmedLabel : null,
  }).returning();
  res.json(step);
});

router.put("/funnels/:id/steps/:stepId", requireAdmin, async (req, res): Promise<void> => {
  const stepId = parseInt(req.params.stepId);
  const { actionType, config, label } = req.body;
  const updates: Record<string, unknown> = {};
  if (actionType !== undefined) updates.actionType = actionType;
  if (config !== undefined) updates.config = config;
  if (label !== undefined) {
    const trimmed = typeof label === "string" ? label.trim() : "";
    updates.label = trimmed ? trimmed : null;
  }
  const [updated] = await db.update(automationFunnelStepsTable).set(updates).where(eq(automationFunnelStepsTable.id, stepId)).returning();
  if (!updated) { res.status(404).json({ error: "Step not found" }); return; }
  res.json(updated);
});

router.delete("/funnels/:id/steps/:stepId", requireAdmin, async (req, res): Promise<void> => {
  const stepId = parseInt(req.params.stepId);
  const funnelId = parseInt(req.params.id);
  const [removed] = await db.delete(automationFunnelStepsTable).where(eq(automationFunnelStepsTable.id, stepId)).returning();
  if (removed) {
    await db.execute(sql`UPDATE automation_funnel_steps SET step_order = step_order - 1 WHERE funnel_id = ${funnelId} AND step_order > ${removed.stepOrder}`);
  }
  res.json({ success: true });
});

/* Execute all published + active funnels for a given trigger + userId */
export async function triggerFunnel(triggerType: string, userId: number, triggerConfig: Record<string, unknown> = {}) {
  const funnels = await db.select().from(automationFunnelsTable)
    .where(and(
      eq(automationFunnelsTable.triggerType, triggerType),
      eq(automationFunnelsTable.status, "published"),
      eq(automationFunnelsTable.isActive, true),
    ));

  for (const funnel of funnels) {
    const cfg = funnel.triggerConfig as Record<string, unknown>;
    // For tag_applied / list_added, only fire if IDs match
    if (triggerType === "tag_applied" && cfg.tagId && cfg.tagId !== triggerConfig.tagId) continue;
    if (triggerType === "list_added" && cfg.listId && cfg.listId !== triggerConfig.listId) continue;

    const steps = await db.select().from(automationFunnelStepsTable)
      .where(eq(automationFunnelStepsTable.funnelId, funnel.id))
      .orderBy(asc(automationFunnelStepsTable.stepOrder));

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) continue;

    // Create execution record + pre-create per-step pending records
    const [execution] = await db.insert(funnelExecutionsTable).values({
      funnelId: funnel.id,
      userId,
      status: "running",
      currentStepOrder: 0,
      nextActionType: steps[0]?.actionType ?? null,
    }).returning({ id: funnelExecutionsTable.id });
    const executionId = execution!.id;

    // C4 fix: insert per-step rows lazily (only when actually attempted) so that
    // step-report metrics reflect real drop-off instead of always showing entered === totalExecutions.
    const markStep = async (
      step: typeof steps[number],
      status: "completed" | "failed" | "skipped",
      errorMessage?: string,
    ) => {
      try {
        await db.insert(funnelExecutionStepsTable).values({
          executionId,
          funnelStepId: step.id,
          stepOrder: step.stepOrder,
          actionType: step.actionType,
          status,
          executedAt: new Date(),
          ...(errorMessage ? { errorMessage } : {}),
        });
      } catch (e) {
        // Defensive: never let recording failure break execution flow
        console.error(`[funnel] markStep insert failed for execution=${executionId} step=${step.id}:`, e);
      }
    };

    const advanceExecution = async (currentStep: typeof steps[number], isLast: boolean, finalStatus: "completed" | "failed" | "running" = "running") => {
      const nextStep = steps.find((s) => s.stepOrder > currentStep.stepOrder);
      const isFinished = isLast || finalStatus !== "running" || currentStep.actionType === "end";
      await db.update(funnelExecutionsTable).set({
        currentStepOrder: currentStep.stepOrder,
        nextActionType: isFinished ? null : (nextStep?.actionType ?? null),
        lastExecutedAt: new Date(),
        ...(isFinished ? { status: finalStatus === "running" ? "completed" : finalStatus, completedAt: new Date() } : {}),
      }).where(eq(funnelExecutionsTable.id, executionId));
    };

    let cumulativeDelayMs = 0;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const config = step.config as Record<string, unknown>;
      const isLast = i === steps.length - 1;

      if (step.actionType === "end") {
        await markStep(step, "completed");
        await advanceExecution(step, true, "completed");
        break;
      }

      if (step.actionType === "wait") {
        const days = Number(config.days ?? 0);
        const hours = Number(config.hours ?? 0);
        cumulativeDelayMs += (days * 86400 + hours * 3600) * 1000;
        // Wait step itself is "completed" (the delay is applied to subsequent steps)
        if (cumulativeDelayMs > 0) {
          setTimeout(() => { void (async () => { await markStep(step, "completed"); await advanceExecution(step, isLast, isLast ? "completed" : "running"); })(); }, cumulativeDelayMs);
        } else {
          await markStep(step, "completed");
          await advanceExecution(step, isLast, isLast ? "completed" : "running");
        }
        continue;
      }

      const execute = async () => {
        let stepFailed = false;
        let stepError = "";
        try {
        if (step.actionType === "apply_list" && config.listId) {
          const listId = Number(config.listId);
          const existing = await db.select().from(emailListMembersTable)
            .where(and(eq(emailListMembersTable.listId, listId), eq(emailListMembersTable.userId, userId))).limit(1);
          if (!existing.length) await db.insert(emailListMembersTable).values({ listId, userId });
        } else if (step.actionType === "remove_list" && config.listId) {
          const listId = Number(config.listId);
          await db.delete(emailListMembersTable).where(and(eq(emailListMembersTable.listId, listId), eq(emailListMembersTable.userId, userId)));
        } else if (step.actionType === "apply_tag" && config.tagId) {
          const tagId = Number(config.tagId);
          const existing = await db.select().from(contactTagAssignmentsTable)
            .where(and(eq(contactTagAssignmentsTable.tagId, tagId), eq(contactTagAssignmentsTable.userId, userId))).limit(1);
          if (!existing.length) await db.insert(contactTagAssignmentsTable).values({ tagId, userId });
        } else if (step.actionType === "remove_tag" && config.tagId) {
          const tagId = Number(config.tagId);
          await db.delete(contactTagAssignmentsTable).where(and(eq(contactTagAssignmentsTable.tagId, tagId), eq(contactTagAssignmentsTable.userId, userId)));
        } else if (step.actionType === "send_email") {
          let subject = String(config.subject ?? "");
          let html = String(config.body ?? "");
          // Default mode is "template" — treat undefined/null/empty the same way
          const emailMode = config.mode ?? "template";
          if (emailMode === "template" && config.templateId) {
            const [tpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, Number(config.templateId))).limit(1);
            if (tpl) { subject = tpl.subject; html = tpl.htmlBody; }
          }
          // Guard: skip send if both subject and html are still empty after resolution
          if (!subject && !html) { stepFailed = true; stepError = "empty subject and body"; return; }
          // Fill in site_url when the caller didn't pass one (or passed an
          // empty string — common in background webhooks like payments.ts that
          // historically defaulted to `process.env.SITE_URL || ""`). Use the
          // unified `getPublicBaseUrl()` chain: admin Site URL → auto-learned
          // last-observed host → env vars. This is the single source of truth
          // so admins never have to hand-edit URLs anywhere when the public
          // domain changes.
          const mergedConfig = { ...triggerConfig };
          if (!mergedConfig.site_url) {
            const resolved = await getPublicBaseUrl();
            mergedConfig.site_url = resolved.replace(/\/+$/, "");
          }
          // Built-in vars
          subject = subject.replaceAll("{{name}}", user.name).replaceAll("{{email}}", user.email);
          html = html.replaceAll("{{name}}", user.name).replaceAll("{{email}}", user.email);
          // Expand any extra vars passed in triggerConfig (e.g. reset_link, course_name, site_url)
          for (const [key, val] of Object.entries(mergedConfig)) {
            if (typeof val === "string" || typeof val === "number") {
              subject = subject.replaceAll(`{{${key}}}`, String(val));
              html = html.replaceAll(`{{${key}}}`, String(val));
            }
          }
          if (await isUserUnsubscribed(userId)) {
            // Skip silently — recipient has opted out
          } else {
            const token = newTrackingToken();
            const trackedHtml = await injectEmailTracking(html, token);
            try {
              await sendEmailWithFallback(user.email, subject, trackedHtml);
              await db.insert(emailSendsTable).values({ type: "automation", automationEvent: triggerType, userId, email: user.email, subject, htmlBody: trackedHtml, status: "sent", trackingToken: token });
            } catch (err: any) {
              await db.insert(emailSendsTable).values({ type: "automation", automationEvent: triggerType, userId, email: user.email, subject, htmlBody: trackedHtml, status: "failed", failReason: String(err?.message ?? err), trackingToken: token });
              stepFailed = true;
              stepError = String(err?.message ?? err);
            }
          }
        }
        } catch (err: any) {
          stepFailed = true;
          stepError = String(err?.message ?? err);
        }
        await markStep(step, stepFailed ? "failed" : "completed", stepError || undefined);
        await advanceExecution(step, isLast, isLast ? (stepFailed ? "failed" : "completed") : "running");
      };

      if (cumulativeDelayMs > 0) {
        setTimeout(() => { void execute(); }, cumulativeDelayMs);
      } else {
        await execute();
      }
    }
  }
}

/* ── Email Log Retention Setting ── */
router.get("/email-log-retention", requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db.select({ emailLogRetentionDays: platformSettingsTable.emailLogRetentionDays }).from(platformSettingsTable).limit(1);
  res.json({ retentionDays: row?.emailLogRetentionDays ?? null });
});

router.put("/email-log-retention", requireAdmin, async (req, res): Promise<void> => {
  const days = req.body.retentionDays === null ? null : Number(req.body.retentionDays);
  if (days !== null && (isNaN(days) || days <= 0)) { res.status(400).json({ error: "Invalid retention period" }); return; }
  const existing = await db.select().from(platformSettingsTable).limit(1);
  if (existing.length === 0) await db.insert(platformSettingsTable).values({});
  await db.update(platformSettingsTable).set({ emailLogRetentionDays: days });
  res.json({ retentionDays: days });
});

export default router;
