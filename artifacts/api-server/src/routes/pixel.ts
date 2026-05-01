import { Router, type IRouter, type Request } from "express";
import { db, platformSettingsTable, usersTable, paymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendFbEvent, type FbEventData } from "../lib/facebook-pixel";
import { pixelEventRateLimiter } from "../middlewares/rate-limit";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// SECURITY: Reject pixel events whose Origin / Referer header points outside
// our own domains. Real browsers always set one of these on cross-page POSTs,
// so this filter blocks the easy case of a competitor running a script in
// their own page that calls our endpoint to poison ad data. Server-to-server
// attackers can still forge headers, but the per-IP rate limit + body
// validation contain the blast radius.
function buildAllowedHosts(): Set<string> {
  const hosts = new Set<string>();
  const addUrl = (u: string | undefined) => {
    if (!u) return;
    try { hosts.add(new URL(u).hostname.toLowerCase()); } catch { /* skip */ }
  };
  for (const o of (process.env.ALLOWED_ORIGINS ?? "").split(",")) addUrl(o.trim());
  addUrl(process.env.SITE_URL);
  if (process.env.REPLIT_DEV_DOMAIN) hosts.add(process.env.REPLIT_DEV_DOMAIN.toLowerCase());
  return hosts;
}
const ALLOWED_HOSTS = buildAllowedHosts();

function isAllowedSourceHost(host: string): boolean {
  const h = host.toLowerCase();
  if (ALLOWED_HOSTS.has(h)) return true;
  // Allow any *.replit.{dev,app,co} so this works on any Replit deployment
  // domain without needing to set ALLOWED_ORIGINS for every preview URL.
  return /\.(replit|repl)\.(dev|app|co)$/i.test(h);
}

function isRequestFromAllowedOrigin(req: Request): boolean {
  const headers = req.headers;
  const origin = typeof headers.origin === "string" ? headers.origin : undefined;
  const referer = typeof headers.referer === "string" ? headers.referer : undefined;
  // If neither Origin nor Referer present, this is almost certainly NOT a
  // browser fetch from one of our pages — reject. (Browsers reliably set at
  // least one of them on cross-page POSTs to /api/*.)
  if (!origin && !referer) return false;
  for (const candidate of [origin, referer]) {
    if (!candidate) continue;
    try {
      if (isAllowedSourceHost(new URL(candidate).hostname)) return true;
    } catch { /* malformed → ignore */ }
  }
  return false;
}

// Only the events we actively track from this app.
// Lead is intentionally excluded — it's set up via Meta's Event Setup Tool
// (URL = /vsl rule), so the browser fires Lead automatically off PageView
// and we never proxy a Lead through CAPI from our own code.
const ALLOWED_EVENTS = new Set([
  "PageView",
  "InitiateCheckout",
  "Purchase",
]);

function getClientIp(req: Request): string | undefined {
  // trust proxy is set in app.ts → req.ip honors X-Forwarded-For
  const ip = req.ip ?? req.socket.remoteAddress ?? undefined;
  if (!ip) return undefined;
  return ip.replace(/^::ffff:/, "");
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

interface CapiCreds {
  pixelId: string | null;
  enabled: boolean;
  accessToken: string | null;
  testEventCode: string | null;
}

/**
 * Read pixel ID, enabled flag, CAPI access token, and test event code from
 * platform_settings. The access token in the DB takes precedence; if it's
 * empty, we fall back to the FACEBOOK_CAPI_ACCESS_TOKEN env var so the
 * previous deployment style still works without any DB changes.
 */
function getCapiCreds(): Promise<CapiCreds> {
  return db.select({
    facebookPixelId: platformSettingsTable.facebookPixelId,
    facebookPixelEnabled: platformSettingsTable.facebookPixelEnabled,
    facebookAccessToken: platformSettingsTable.facebookAccessToken,
    facebookTestEventCode: platformSettingsTable.facebookTestEventCode,
  }).from(platformSettingsTable).limit(1).then(rows => {
    const r = rows[0];
    const dbToken = r?.facebookAccessToken && r.facebookAccessToken.trim().length > 0
      ? r.facebookAccessToken.trim() : null;
    const envToken = process.env.FACEBOOK_CAPI_ACCESS_TOKEN ?? null;
    const testCode = r?.facebookTestEventCode && r.facebookTestEventCode.trim().length > 0
      ? r.facebookTestEventCode.trim() : null;
    return {
      pixelId: r?.facebookPixelId ?? null,
      enabled: !!r?.facebookPixelEnabled,
      accessToken: dbToken ?? envToken,
      testEventCode: testCode,
    };
  }).catch(() => ({ pixelId: null, enabled: false, accessToken: null, testEventCode: null }));
}

/**
 * POST /api/pixel/event
 * Forwards a browser-fired event to Meta's Conversions API server-side.
 *
 * Body:
 *   {
 *     event_name: string,         // e.g. "InitiateCheckout", "Purchase"
 *     event_id: string,           // UUID — must match the eventID on the browser pixel for dedup
 *     event_source_url?: string,  // window.location.href
 *     referrer?: string,          // document.referrer
 *     custom_data?: object,       // value, currency, content_ids, etc.
 *     fbp?: string,               // _fbp cookie
 *     fbc?: string,               // _fbc cookie (or built from fbclid query param)
 *     // Optional user identifiers — sent hashed:
 *     email?: string, phone?: string, first_name?: string, last_name?: string,
 *     external_id?: string|number,
 *     order_id?: string,          // Purchase: server uses this to look up the buyer
 *   }
 *
 * Response: { sent: true } on success (silent on misconfig — pixel is best-effort).
 */
router.post("/event", pixelEventRateLimiter, async (req, res): Promise<void> => {
  // Always respond 200 (or 4xx for malformed/forbidden requests) so frontend
  // retries / queues never produce console noise. Pixel events are best-effort.
  try {
    // SECURITY: same-origin gate — see isRequestFromAllowedOrigin() comments.
    if (!isRequestFromAllowedOrigin(req)) {
      res.status(403).json({ sent: false, reason: "forbidden_origin" }); return;
    }

    // Validate body shape FIRST so misconfigurations (no CAPI token) don't
    // mask client-side bugs (wrong event name, missing event_id).
    const body = (req.body ?? {}) as Record<string, unknown>;
    const eventName = body.event_name;
    const eventId = body.event_id;
    if (!isString(eventName) || !ALLOWED_EVENTS.has(eventName)) {
      res.status(400).json({ sent: false, reason: "invalid_event_name" }); return;
    }
    if (!isString(eventId)) {
      res.status(400).json({ sent: false, reason: "missing_event_id" }); return;
    }

    const { pixelId, enabled, accessToken, testEventCode } = await getCapiCreds();
    if (!accessToken) { res.json({ sent: false, reason: "capi_not_configured" }); return; }
    if (!enabled || !pixelId) { res.json({ sent: false, reason: "pixel_disabled" }); return; }

    const customData = (body.custom_data && typeof body.custom_data === "object")
      ? (body.custom_data as Record<string, unknown>)
      : {};

    const data: FbEventData = {
      eventName,
      eventId,
      eventSourceUrl: isString(body.event_source_url) ? body.event_source_url : undefined,
      userIp: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? undefined,
      fbp: isString(body.fbp) ? body.fbp : undefined,
      fbc: isString(body.fbc) ? body.fbc : undefined,
      email: isString(body.email) ? body.email : undefined,
      phone: isString(body.phone) ? body.phone : undefined,
      firstName: isString(body.first_name) ? body.first_name : undefined,
      lastName: isString(body.last_name) ? body.last_name : undefined,
      externalId: (typeof body.external_id === "string" || typeof body.external_id === "number")
        ? body.external_id : undefined,
      customData,
    };

    // Pull standardized fields out of custom_data so they go to the right place.
    if (typeof customData.value === "number") data.value = customData.value;
    else if (typeof customData.value === "string" && !isNaN(Number(customData.value))) data.value = Number(customData.value);
    if (isString(customData.currency)) data.currency = customData.currency;
    if (isString(customData.content_name)) data.contentName = customData.content_name;
    if (isString(customData.content_type)) data.contentType = customData.content_type;
    if (Array.isArray(customData.content_ids)) {
      data.contentIds = customData.content_ids.filter(isString);
    }
    if (typeof customData.num_items === "number") data.numItems = customData.num_items;
    if (isString(customData.order_id)) data.orderId = customData.order_id;

    // Purchase enrichment: if browser passed an order_id, look up the buyer
    // server-side so we can hash their email/phone into user_data (improves
    // EMQ score significantly).
    //
    // The frontend may pass either our internal numeric payment ID OR the
    // gateway sessionId (e.g. Cashfree returns it in the redirect URL); try
    // both lookups so either works.
    if (eventName === "Purchase" && data.orderId) {
      try {
        const orderIdNum = Number(data.orderId);
        const cols = {
          userId: paymentsTable.userId,
          billingEmail: paymentsTable.billingEmail,
          billingMobile: paymentsTable.billingMobile,
          billingName: paymentsTable.billingName,
        };
        type PayRow = { userId: number | null; billingEmail: string | null; billingMobile: string | null; billingName: string | null };
        let pay: PayRow | undefined;
        if (!Number.isNaN(orderIdNum)) {
          const rows = await db.select(cols).from(paymentsTable).where(eq(paymentsTable.id, orderIdNum)).limit(1);
          pay = rows[0] as PayRow | undefined;
        }
        if (!pay) {
          const rows = await db.select(cols).from(paymentsTable).where(eq(paymentsTable.sessionId, data.orderId)).limit(1);
          pay = rows[0] as PayRow | undefined;
        }
        if (pay) {
          if (!data.email && isString(pay.billingEmail)) data.email = pay.billingEmail;
          if (!data.phone && isString(pay.billingMobile)) data.phone = pay.billingMobile;
          if (!data.firstName && isString(pay.billingName)) {
            const parts = pay.billingName.trim().split(/\s+/);
            data.firstName = parts[0];
            if (parts.length > 1) data.lastName = parts.slice(1).join(" ");
          }
          if (data.externalId === undefined && pay.userId) data.externalId = pay.userId;
          if (pay.userId) {
            const [u] = await db.select({
              name: usersTable.name,
              phone: usersTable.phone,
              email: usersTable.email,
            }).from(usersTable).where(eq(usersTable.id, pay.userId)).limit(1);
            if (u) {
              if (!data.email && isString(u.email)) data.email = u.email;
              if (!data.phone && isString(u.phone)) data.phone = u.phone;
              if (!data.firstName && isString(u.name)) {
                const parts = u.name.trim().split(/\s+/);
                data.firstName = parts[0];
                if (parts.length > 1) data.lastName = parts.slice(1).join(" ");
              }
            }
          }
        }
      } catch (e) {
        console.error("[pixel/event] order_id enrichment failed:", e);
      }
    }

    // Fire-and-forget so the response stays snappy even if Meta is slow.
    // testEventCode (when set in admin UI) routes the event into Meta's Test
    // Events tab instead of production stats — useful for verifying setup.
    void sendFbEvent(pixelId, accessToken, data, testEventCode ?? undefined).then(result => {
      if (!result.success) {
        console.warn(`[CAPI ${eventName}] Meta returned error:`, result.error);
      }
    }).catch(err => {
      console.error(`[CAPI ${eventName}] dispatch failed:`, err);
    });

    res.json({ sent: true, test_mode: !!testEventCode });
  } catch (err) {
    console.error("[pixel/event] handler error:", err);
    res.json({ sent: false, reason: "internal_error" });
  }
});

/**
 * GET /api/pixel/capi-status
 * Admin-only helper: tells the admin UI whether the CAPI access token is
 * configured (in DB or env), where it came from, and whether a test code is
 * currently active. Never returns the token itself.
 *
 * SECURITY: Admin-gated to avoid leaking integration config (token presence,
 * test mode state) to anonymous callers. The /api/pixel/event handler that
 * fires real conversion data still does its own per-request DB lookup.
 */
router.get("/capi-status", requireAdmin, async (_req, res): Promise<void> => {
  // Single DB read — pull both the resolved creds AND the raw DB token in one
  // round trip so we can attribute the source (database vs environment).
  const rows = await db.select({
    accessToken: platformSettingsTable.facebookAccessToken,
    testEventCode: platformSettingsTable.facebookTestEventCode,
  }).from(platformSettingsTable).limit(1).catch(() => []);
  const r = rows[0];
  const dbToken = r?.accessToken && r.accessToken.trim().length > 0 ? r.accessToken.trim() : null;
  const envToken = process.env.FACEBOOK_CAPI_ACCESS_TOKEN ?? null;
  const accessToken = dbToken ?? envToken;
  const testCode = r?.testEventCode && r.testEventCode.trim().length > 0 ? r.testEventCode.trim() : null;
  res.json({
    configured: !!accessToken,
    source: accessToken ? (dbToken ? "database" : "environment") : null,
    test_mode: !!testCode,
  });
});

/**
 * POST /api/pixel/send-test-event
 * Admin-only diagnostic — fires a synthetic InitiateCheckout event to Meta
 * CAPI using the saved Test Event Code. Within ~30s the event should appear
 * in Events Manager → Test Events tab, confirming the full pipeline works.
 *
 * Body: { event_name?: "InitiateCheckout"|"Purchase" }  (default: InitiateCheckout)
 */
router.post("/send-test-event", requireAdmin, async (req, res): Promise<void> => {
  try {
    // Defense in depth: even though requireAdmin already validated the JWT,
    // also enforce the same-origin gate so a stolen admin cookie used from a
    // third-party site can't trigger Meta test events from a different origin.
    if (!isRequestFromAllowedOrigin(req)) {
      res.status(403).json({ sent: false, reason: "forbidden_origin" }); return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const eventName = isString(body.event_name) && ALLOWED_EVENTS.has(body.event_name)
      ? body.event_name : "InitiateCheckout";

    const { pixelId, accessToken, testEventCode } = await getCapiCreds();
    if (!accessToken) { res.status(400).json({ sent: false, reason: "capi_not_configured" }); return; }
    if (!pixelId) { res.status(400).json({ sent: false, reason: "pixel_id_missing" }); return; }
    if (!testEventCode) { res.status(400).json({ sent: false, reason: "test_event_code_missing" }); return; }

    const data: FbEventData = {
      eventName,
      eventId: `test_${eventName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventSourceUrl: typeof req.headers.referer === "string" ? req.headers.referer : undefined,
      userIp: getClientIp(req),
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
      contentName: "Admin Test Event",
      value: eventName === "Purchase" ? 1 : undefined,
      currency: eventName === "Purchase" ? "INR" : undefined,
      customData: { test_source: "admin_panel" },
    };

    // Wait for Meta's response so the admin gets immediate feedback.
    const result = await sendFbEvent(pixelId, accessToken, data, testEventCode);
    if (result.success) {
      res.json({
        sent: true,
        event_name: eventName,
        event_id: data.eventId,
        test_event_code: testEventCode,
        meta_response: result.result,
        next_step: `Open Events Manager → Pixel ${pixelId} → Test Events tab. The event "${eventName}" should appear within 30 seconds.`,
      });
    } else {
      res.status(502).json({ sent: false, reason: "meta_rejected", error: result.error });
    }
  } catch (err) {
    console.error("[pixel/send-test-event] error:", err);
    res.status(500).json({ sent: false, reason: "internal_error" });
  }
});

export default router;
