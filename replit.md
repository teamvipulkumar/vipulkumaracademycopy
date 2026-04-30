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
**Affiliate Program**: Referral tracking, click counting, commission calculation, and payout request workflow. Approved affiliates see a one-time welcome popup + 6-step interactive dashboard tour on their first visit, persisted via `affiliate_applications.welcomed_at` and a `POST /api/affiliate/welcome-complete` endpoint. The stamp fires automatically on popup mount (not on Skip/Finish only) so refreshing mid-popup never re-triggers it; the affiliate page also uses a sticky `showWelcomeForSession` state so the tour isn't unmounted by 45s background polling once the server has stamped `welcomedAt`.
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

**Facebook Pixel + Conversions API (Server-Side)**:
- Browser pixel utility: `artifacts/course-platform/src/lib/facebook-pixel.ts`
  - Internal event queue handles the race condition where events fire before the async-loaded fbq script is ready (events queued, flushed on init)
  - Every event gets a UUID `event_id` shared with both browser and server for Meta deduplication
  - `fbTrack(event, params, userData?)` fires the browser pixel AND POSTs to `/api/pixel/event` server-side; `userData` (email/phone/firstName/lastName/externalId) is hashed server-side for higher Event Match Quality
- Server-side CAPI: `POST /api/pixel/event` in `artifacts/api-server/src/routes/pixel.ts`
  - Reads `FACEBOOK_CAPI_ACCESS_TOKEN` env var and pixel ID from `platform_settings` table
  - Forwards to Meta with visitor IP, user-agent, `_fbp`/`_fbc` cookies, and SHA-256 hashed PII
  - For Purchase events with `order_id`, looks up the payment row (by internal id OR gateway sessionId) to enrich with billing email/phone/name from DB
  - Returns 400 for malformed bodies, `{sent:false, reason:"capi_not_configured"}` if env var missing — failures never propagate to user-facing flows
- Admin status card at `/admin/facebook-pixel` shows whether CAPI is active (queries `GET /api/pixel/capi-status`)
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