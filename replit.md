# EduPro — Online Course Platform

## Overview
EduPro is a full-stack SaaS online course selling platform designed to offer a robust and engaging learning experience. It features a dark/blue premium theme and is built as a pnpm monorepo. The platform aims to provide a comprehensive solution for course creators and students, incorporating advanced features like a visual automation funnel builder, affiliate programs, and secure payment integrations.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.

## System Architecture

### UI/UX Decisions
The platform offers three themes (`dark`, `light`, `forest`) selected via `ThemeProvider` in `lib/theme-context.tsx`. Default is `dark`. The theme context honours an optional `?theme=` URL query (read before localStorage) so designers can preview a theme on a single page without flipping it globally — useful for screenshot QA. The `light` theme is fully supported across home, courses, auth, help-center, affiliate panel, and admin panel via comprehensive `.light .*` overrides in `src/index.css` (~490 lines): warm-white background tokens, softer borders/shadows, neon palette darkening (300–500 weights of 16+ colours), `text-white/X` and dark slate/gray/zinc/neutral text mapped to `--muted-foreground`, `bg-slate-900`/`bg-black` mapped to `--card`, `bg-white/X` overlays inverted to black opacities, gradient `from-/via-/to-` slate/gray/zinc/black remapped, header gets always-on bottom border, sidebar dividers softened, and arbitrary hex values used in admin pages (`bg-[#0d1424]`, `bg-[#161b22]`, `bg-[#0d1117]`, `text-[#05df72]`) explicitly remapped. VSL, order-confirmation, and page-builder editor previews intentionally remain dark for design reasons.
Frontend is built with React, Vite, Wouter router, TanStack Query, Tailwind CSS, and shadcn/ui.
Includes a responsive design with specific layouts for admin dashboards and reports.

### Technical Implementations
**Monorepo Structure**: Uses pnpm workspaces to manage `course-platform` (frontend), `api-server` (backend), `api-spec` (API codegen), and `db` (database schema).
**Authentication**: JWT authentication managed via httpOnly cookies. Includes login, registration with referral support, password reset, and Google OAuth.
**API Layer**: Express.js 5 for the API server, with Pino for logging.
**Database & ORM**: PostgreSQL via Supabase, with Drizzle ORM for schema management. `SUPABASE_DATABASE_URL` is mandatory.
**File Storage**: Supabase Storage for public uploads, streaming directly from memory.
**API Codegen**: Orval generates React Query hooks from an OpenAPI specification.
**Validation**: Zod and drizzle-zod for data validation.
**Payment Gateways**: Simulated Stripe and Razorpay integrations. Paytm integration with specific domain and header requirements, including secure transaction initiation and callback verification. Cashfree integration with robust webhook signature verification.
**Security**:
    - **CORS Lockdown**: Strict origin allowlist based on environment variables and Replit domains.
    - **CSRF Defense**: Origin/Referer validation middleware on all state-changing requests, with exemptions for authenticated webhooks. `SameSite=lax` cookies are used.
    - **JWT Secret**: Enforces strong `SESSION_SECRET` in production, with per-process random secrets in development.
    - **Rate Limiting**: Implemented on authentication, payment, and coupon endpoints.
    - **Access Control**: `/api/analytics/recent-activity` now requires admin privileges.
    - **Upload Security**: SVG uploads are blocked to prevent XSS.
    - **SQL Injection Prevention**: Replaced `sql.raw` with Drizzle's parameterized `inArray()`.
    - **Helmet**: Integration for various HTTP security headers (HSTS, X-Content-Type-Options, etc.).
    - **Cookie Security**: All JWT cookies are `httpOnly`, `sameSite: "lax"`, `path: "/"`, and `secure` in production.
**Maintenance Mode**: Production-grade gate in `index.html` that blocks the page before React boots, showing a static maintenance message if activated and the user is not an admin.
**Deferred Account Creation**: User accounts are only materialized after payment confirmation, making `payments.user_id` nullable and storing `pending_password_hash`.
**Guest Checkout Impersonation Fix**: Prevents auto-login for existing users during guest checkout if not already authenticated, and synthesizes `safeUser` data to prevent profile leaks.

### Feature Specifications
**Course Management**: CRUD operations for courses, modules, and lessons.
**Enrollment & Progress**: Tracking of enrolled courses and lesson completion.
**Affiliate Program**: Referral tracking, click counting, commission calculation, and payout request workflow. Approved affiliates see a one-time welcome popup + 6-step interactive dashboard tour on their first visit, persisted via `affiliate_applications.welcomed_at` and a `POST /api/affiliate/welcome-complete` endpoint. The stamp fires automatically on popup mount (not on Skip/Finish only) so refreshing mid-popup never re-triggers it; the affiliate page also uses a sticky `showWelcomeForSession` state so the tour isn't unmounted by 45s background polling once the server has stamped `welcomedAt`. **Affiliate share links auto-derive from the request domain**: `GET /api/affiliate/dashboard` builds `referralLink` (and exposes `siteBaseUrl`) from the **incoming request's `req.protocol` + `req.hostname`** (which honour `X-Forwarded-Proto/Host` because `trust proxy = 1` is set in `app.ts`). So whatever public domain the affiliate is browsing on (e.g. `vipulkumar.online`, `vipulkumaracademy.com`, or any future custom domain), the link is automatically rooted there — zero admin config required. If the request hostname is missing or local (`localhost`/`127.0.0.1`) — e.g. server-to-server callers — it falls back to `getPublicBaseUrl()` (admin `siteUrl` → `PUBLIC_BASE_URL` → `SITE_URL` → `REPLIT_DEV_DOMAIN`) → `REPLIT_DOMAINS`. The Custom Link Generator on the affiliate page accepts pasted URLs from either the current browser origin or `siteBaseUrl` and rewrites the output to the canonical origin. `PUT /api/admin/settings` still validates `siteUrl` at write-time (must be absolute `http(s)`, stored as `new URL(raw).origin`) so the fallback path never corrupts. Correctness assumes requests arrive through the trusted Replit edge proxy.
**Analytics**: Admin dashboard with revenue charts and user management.
**Notification System**: In-app notifications.
**Platform Settings**: Configuration for commission rates and enabled payment gateways.
**CRM**: Features for email lists, tags, campaigns, sequences, and multi-account SMTP.
**Visual Automation Funnel Builder (FluentCRM-style)**:
    - Allows creation of multi-step automation funnels with triggers and actions.
    - Trigger Types: `user_signup`, `new_purchase`, `tag_applied`, `list_added`.
    - Action Types: `wait`, `apply_list`, `remove_list`, `apply_tag`, `remove_tag`, `send_email`, `end`.
    - Supports draft/published states and inline editing via a visual UI.
    - `user_signup` trigger fires at user creation time (e.g., registration, guest checkout).
**Email Tracking**: Open, click, and unsubscribe tracking for emails, with secure link rewriting and HMAC-SHA256 signature verification.

**Email link domain auto-detection (zero admin config)**: All outgoing email links — verify, password reset, login confirmation, purchase confirmations, automation/funnel sends, CRM campaigns, affiliate approval/rejection, footer social icons, unsubscribe — automatically use the *currently published* domain. There is **no need to set Site URL anywhere** when changing domains.
- **Request-driven sends** (verify, reset, lesson-completed funnel, test-send preview): `resolvePublicSiteUrl(req)` in `auth.ts`, `resolveSampleSiteUrl(req)` in `crm.ts`, and `lessons.ts` all use the shared `publicSiteUrlFromRequest(req)` helper from `crm.ts` to derive `<proto>://<host>` from the live request (X-Forwarded-Host honored via `trust proxy = 1`). The helper applies the same `isAllowedPublicHost()` allowlist as `recordPublicHost` (against `REPLIT_DOMAINS`), so X-Forwarded-Host poisoning is neutralized even if the edge proxy is misconfigured. Local / unset / disallowed hosts fall through to `getPublicBaseUrl()`.
- **Background sends** (payment webhooks, scheduled funnels, automations, CRM campaigns, affiliate approve/reject): use `getPublicBaseUrl()` in `crm.ts`. **Precedence (highest first)**: admin `platform_settings.siteUrl` (cached, sticky intent) → **auto-learned `lastObservedHost`** (uncached, fresh per call) → env vars (`PUBLIC_BASE_URL` → `SITE_URL` → `REPLIT_DEV_DOMAIN` → `REPLIT_DOMAINS`). Stale env vars NEVER override the live observed domain.
- **`lastObservedHost` cache** (`recordPublicHost` / `getLastObservedPublicHost` in `crm.ts`): a module-level in-memory record updated by an Express middleware (`app.ts` near the bottom) on EVERY public request that passes the safety filters: (a) host is non-local, (b) path doesn't contain `/webhook` (so Stripe/Razorpay webhooks don't poison the cache with their gateway hostnames), and (c) `isAllowedPublicHost()` passes (host appears in the `REPLIT_DOMAINS` platform-set allowlist when configured). 24h staleness guard. No DB writes on the hot path; survives restarts within seconds of real traffic.
- **Funnel processor's `site_url` template variable** (`crm.ts` ~line 2528 of original numbering): when callers pass empty/missing `site_url`, the processor fills it via `getPublicBaseUrl()`. ALL `triggerFunnel(...)` callers in `payments.ts` and `bundles.ts` had their explicit `site_url: process.env.SITE_URL || ""` payloads REMOVED — so they're guaranteed to fall through to the auto-learned-host path. Single source of truth, no stale env leakage.
- **`substituteSiteUrl()`** still substitutes the literal `{{site_url}}` placeholder via `getPublicBaseUrl()` in every send path before the click-tracking rewriter runs, so footer/social/unsubscribe links in templates also follow the live domain.
- Caching: `getStableBaseUrl()` caches the DB-only siteUrl resolution for 60s; the per-request `lastObservedHost` and env-var lookups are FRESH on every miss/empty-stable-result so domain switches propagate immediately. Admin `PUT /settings` still calls `invalidatePublicBaseUrlCache()` so explicit Site URL changes propagate without TTL wait.

**Facebook Pixel + Conversions API (Server-Side)**:
- Browser pixel utility: `artifacts/course-platform/src/lib/facebook-pixel.ts`
  - Internal event queue handles the race condition where events fire before the async-loaded fbq script is ready (events queued, flushed on init)
  - Every event gets a UUID `event_id` shared with both browser and server for Meta deduplication
  - `fbTrack(event, params, userData?)` fires the browser pixel AND POSTs to `/api/pixel/event` server-side; `userData` (email/phone/firstName/lastName/externalId) is hashed server-side for higher Event Match Quality
- **Tracked events** (intentionally minimal): `PageView`, `InitiateCheckout`, `Purchase`. Lead is **not** fired from app code — it's set up via Meta's Event Setup Tool with a URL = `/vsl` rule that auto-injects Lead off the existing PageView. ViewContent was removed at user's request. `ALLOWED_EVENTS` in `pixel.ts` enforces this server-side as defense in depth.
- Server-side CAPI: `POST /api/pixel/event` in `artifacts/api-server/src/routes/pixel.ts`
  - Token resolution order: `platform_settings.facebook_access_token` (preferred, editable in admin UI) → `FACEBOOK_CAPI_ACCESS_TOKEN` env var (legacy fallback)
  - Forwards to Meta with visitor IP, user-agent, `_fbp`/`_fbc` cookies, and SHA-256 hashed PII
  - For Purchase events with `order_id`, looks up the payment row (by internal id OR gateway sessionId) to enrich with billing email/phone/name from DB
  - Returns 400 for malformed bodies, `{sent:false, reason:"capi_not_configured"}` if no token configured — failures never propagate to user-facing flows
  - When `platform_settings.facebook_test_event_code` is set, every event is automatically tagged with `test_event_code` and routed to Meta's Test Events tab instead of production stats
- Admin UI at `/admin/facebook-pixel`:
  - **Two-card layout**: top card holds the locked main config (Pixel ID, Base Code, Access Token — password-masked with show/hide toggle); bottom card is an always-editable Test Event panel
  - Top card uses Edit/Save/Cancel pattern (locked by default) so admins can't accidentally mutate prod config — `PUT /api/admin/settings` only persists the 4 main fields, **never** the test code
  - **Test Event panel** (bottom card, transient): admin types a `TEST<digits>` code into a local-state-only input → clicks **Send InitiateCheckout** (single event) or **Send All Events** (parallel PageView + InitiateCheckout + Purchase) → backend reads `test_event_code` from request body (preferred) or DB (legacy fallback) → Meta returns confirmation. Nothing is persisted, so production traffic stays unaffected
  - **Test mode banner + Clear button**: appears only when `platform_settings.facebook_test_event_code` is non-empty (legacy/env/SQL-set state). Banner has an inline "Clear test mode" button that PUTs `facebookTestEventCode: ""` to settings — restores production routing in one click without entering edit mode
  - Status badge queries `GET /api/pixel/capi-status` which returns `{configured, source: "database"|"environment"|null, test_mode}` so admins see whether the active token came from DB or env
- Affiliate per-user pixels (`affiliate_pixels` table, with their own `access_token` column) are independent of the global CAPI token and continue to work as before

## External Dependencies

- **Supabase**: PostgreSQL database and Storage for file uploads.
- **Drizzle ORM**: Database schema definition and migration.
- **Express.js**: Backend API framework.
- **Pino**: Logger for the API server.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **Wouter**: React router.
- **TanStack Query**: Data fetching and caching library.
- **Tailwind CSS**: Utility-first CSS framework.
- **shadcn/ui**: UI component library.
- **Orval**: OpenAPI spec to API client code generator.
- **Zod**: Schema declaration and validation library.
- **drizzle-zod**: Zod integration for Drizzle ORM.
- **`express-rate-limit`**: Middleware for rate limiting.
- **Helmet**: Collection of middleware to secure Express apps.
- **`paytmchecksum`**: Library for Paytm checksum generation and verification.
- **Stripe**: Payment gateway (simulated integration).
- **Razorpay**: Payment gateway (simulated integration).
- **Cashfree**: Payment gateway.