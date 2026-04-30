import rateLimit from "express-rate-limit";

// SECURITY: brute-force protection. Each limiter is keyed by IP. The auth
// limiter is intentionally tight; the payment limiter is wider because real
// users may legitimately retry. Skipped for OPTIONS so CORS preflight isn't
// throttled.

const skipPreflight = (req: { method: string }) => req.method === "OPTIONS";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPreflight,
  message: { error: "Too many auth attempts. Please try again in 15 minutes." },
});

export const paymentRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPreflight,
  message: { error: "Too many payment requests. Please slow down." },
});

export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPreflight,
  message: { error: "Too many requests. Please slow down." },
});

// SECURITY: /api/pixel/event is intentionally unauthenticated (any visitor can
// fire pixel events from any page). To prevent ad-data poisoning attacks where
// a malicious script floods our pixel with fake Purchase/Lead events and
// destroys campaign optimisation, we cap each IP at 60 events / minute. A
// real user clicking through optin → checkout → payment-verify fires ~5–10
// events total, so this leaves plenty of headroom while blocking scripted
// abuse from a single source.
export const pixelEventRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPreflight,
  message: { sent: false, reason: "rate_limited" },
});
