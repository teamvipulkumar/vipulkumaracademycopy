declare global {
  interface Window {
    fbq: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      push?: (...args: unknown[]) => void;
    };
    _fbq: Window["fbq"];
  }
}

const API_BASE = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";

let initialised = false;
let pixelReady = false;

type QueuedEvent = { event: string; params: Record<string, unknown>; eventId: string };
const eventQueue: QueuedEvent[] = [];

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "fbe_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : undefined;
}

function getFbc(): string | undefined {
  const fbc = getCookie("_fbc");
  if (fbc) return fbc;
  // If user just landed via fbclid, build a temporary _fbc value.
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid");
  if (!fbclid) return undefined;
  return `fb.1.${Date.now()}.${fbclid}`;
}

function flushQueue(): void {
  if (!window.fbq) return;
  while (eventQueue.length) {
    const q = eventQueue.shift()!;
    try {
      window.fbq("track", q.event, q.params, { eventID: q.eventId });
    } catch {
      // swallow — we don't want pixel issues to break the app
    }
  }
}

/**
 * Mark fbq as ready and flush any events that were queued before it loaded.
 * Called either after `injectBaseCode` finishes (when window.fbq becomes
 * available via the FB snippet) or after `initPixel` does the manual install.
 */
function markReadyAndFlush(): void {
  pixelReady = true;
  flushQueue();
}

function pollUntilReady(maxMs = 10000): void {
  if (window.fbq) { markReadyAndFlush(); return; }
  const start = Date.now();
  const id = window.setInterval(() => {
    if (window.fbq) {
      window.clearInterval(id);
      markReadyAndFlush();
    } else if (Date.now() - start > maxMs) {
      window.clearInterval(id);
      // Give up waiting for browser pixel — CAPI will still cover us.
    }
  }, 50);
}

export function injectBaseCode(baseCode: string): void {
  if (initialised || !baseCode.trim()) return;
  if (window.fbq) { initialised = true; markReadyAndFlush(); return; }
  initialised = true;

  const tmp = document.createElement("div");
  tmp.innerHTML = baseCode;
  tmp.querySelectorAll("script").forEach(s => {
    const script = document.createElement("script");
    Array.from(s.attributes).forEach(a => { if (a.name !== "src") script.setAttribute(a.name, a.value); });
    if (s.src) {
      script.src = s.src;
      script.async = true;
    } else {
      script.textContent = s.textContent;
    }
    document.head.appendChild(script);
  });
  tmp.querySelectorAll("noscript").forEach(n => document.head.appendChild(n.cloneNode(true)));
  pollUntilReady();
}

export function initPixel(pixelId: string): void {
  if (initialised || !pixelId) return;
  if (window.fbq) { initialised = true; markReadyAndFlush(); return; }
  initialised = true;

  const fb = function (...args: unknown[]) {
    if (fb.callMethod) fb.callMethod(...args);
    else { fb.queue = fb.queue ?? []; fb.queue.push(args); }
  } as Window["fbq"];
  if (!window.fbq) window.fbq = fb;
  window._fbq = fb;
  fb.push = fb;
  fb.loaded = true;
  fb.version = "2.0";
  fb.queue = [];

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  window.fbq("init", pixelId);
  // NOTE: We intentionally do NOT fire PageView here. The route-change effect
  // in App.tsx (PixelTracker) calls fbPageView() on every location change
  // including the initial mount, and that path uses event_id deduplication
  // with CAPI. Firing PageView here would create a duplicate.
  markReadyAndFlush();
}

export function ensureInitialised(): void {
  if (window.fbq) { initialised = true; markReadyAndFlush(); }
}

export interface FbUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string | number;
}

/**
 * Fire an event to BOTH the browser pixel (for users without ad blockers)
 * AND the server-side Conversions API (for users WITH ad blockers / iOS / Brave).
 * Both use the same `event_id` so Meta deduplicates them.
 *
 * If the browser pixel isn't loaded yet, the browser-side fire is queued and
 * flushed once it finishes loading. The CAPI dispatch is fired immediately
 * regardless, so the event is never lost.
 *
 * Pass `userData` (email/phone/etc) wherever you have it — the server hashes
 * these with SHA-256 before sending to Meta, which significantly improves the
 * Event Match Quality (EMQ) score and ad campaign attribution.
 */
export function fbTrack(event: string, params?: Record<string, unknown>, userData?: FbUserData): void {
  const eventId = uuid();
  const safeParams = params ?? {};

  // Self-heal: if fbq finished loading AFTER pollUntilReady() timed out (e.g.
  // very slow network on the FB script), every subsequent fbTrack call
  // notices and flushes any queued events. This guarantees no event stays
  // permanently stranded as long as the user keeps interacting with the site.
  if (!pixelReady && window.fbq) markReadyAndFlush();

  // 1) Browser-side pixel (queue if fbq not ready yet)
  if (window.fbq && pixelReady) {
    try { window.fbq("track", event, safeParams, { eventID: eventId }); } catch { /* noop */ }
  } else {
    eventQueue.push({ event, params: safeParams, eventId });
  }

  // 2) Server-side Conversions API — always fire, immediately, with same event_id
  sendCapi(event, safeParams, eventId, userData);
}

export function fbPageView(): void {
  fbTrack("PageView");
}

/**
 * Send the event to our own /api/pixel/event endpoint, which forwards it to
 * Meta's Conversions API server-side (with IP, user-agent, fbp/fbc cookies,
 * and the same event_id used by the browser pixel for dedup).
 *
 * Uses keepalive:true so it survives page navigation (useful for InitiateCheckout
 * fired right before the user navigates to the payment gateway).
 */
function sendCapi(
  event: string,
  params: Record<string, unknown>,
  eventId: string,
  userData?: FbUserData,
): void {
  if (typeof window === "undefined") return;
  const body: Record<string, unknown> = {
    event_name: event,
    event_id: eventId,
    event_source_url: window.location.href,
    referrer: document.referrer || undefined,
    custom_data: params,
    fbp: getCookie("_fbp"),
    fbc: getFbc(),
  };
  if (userData?.email) body.email = userData.email;
  if (userData?.phone) body.phone = userData.phone;
  if (userData?.firstName) body.first_name = userData.firstName;
  if (userData?.lastName) body.last_name = userData.lastName;
  if (userData?.externalId !== undefined) body.external_id = userData.externalId;
  try {
    fetch(`${API_BASE}/api/pixel/event`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => { /* swallow — pixel is best-effort */ });
  } catch {
    // ignore
  }
}
