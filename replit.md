# EduPro — Online Course Platform

## Overview
EduPro is a full-stack SaaS online course selling platform designed to offer a robust and engaging learning experience. It provides a comprehensive solution for course creators and students, incorporating advanced features like a visual automation funnel builder, affiliate programs, and secure payment integrations. The platform aims to be a premium offering in the online learning market.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.

## System Architecture

### UI/UX Decisions
The platform features a premium theme with `dark` and `light` options, defaulting to `dark` (the legacy `forest` theme has been removed; localStorage migrates old `"forest"` values to `"dark"` automatically). Themes can be previewed using URL queries. The frontend is built with React, Vite, Wouter, TanStack Query, Tailwind CSS, and shadcn/ui, ensuring a responsive design across various devices and specific layouts for admin dashboards.

**Profile page UX**: Personal details (name, phone) start in a read-only "view" mode after each save to prevent accidental edits — a dedicated Edit button toggles into edit mode with explicit Save/Cancel actions. Below the details card is a Change Password card that requires the user's current password before accepting a new one (validated server-side via `POST /api/auth/change-password`, rate-limited the same as login). A "Forgot password?" link routes users to the existing `/forgot-password` flow if they don't remember their current password. On success the auth cookie is re-issued so the active session token is freshly minted post-change.

### Technical Implementations
**Monorepo Structure**: Uses pnpm workspaces for `course-platform` (frontend), `api-server` (backend), `api-spec` (API codegen), and `db` (database schema).
**Authentication**: JWT authentication via httpOnly cookies, supporting login, registration (with referral), password reset, and Google OAuth. Login redirects are role-aware: super-admins go to `/admin`, staff go to their first-allowed admin page (via `getPostLoginPath` in `lib/auth-context.tsx`), all others go to `/my-courses` — both email/password and Google sign-in share this logic.
**Staff & Access (Admin Sub-Roles)**: The `admin_staff` table is the **sole source of truth** for staff status — the user's `role` column (enum: `admin`/`student`/`affiliate`, no `staff` value) is intentionally NOT mutated when granting/revoking staff. Backend `requireAdmin` middleware accepts either `role==="admin"` OR `isStaff===true` from the JWT (which is hydrated at login from `admin_staff`). A `requirePermission(perm)` middleware exists for granular per-route checks. Frontend `AdminLayout` enforces a page-level guard: staff hitting a page they don't have permission for (or the admin-only `/admin/staff`) are redirected to their first allowed page. Creating a brand-new staff user returns a one-time `generatedPassword` shown to the admin in a copy dialog.
**Multi-Role Display & Creator Assignment**: Backend `GET /admin/users` and `GET /admin/users/:userId` return a `roles: string[]` array alongside the legacy `role` field — the array includes the base DB role plus overlay roles from `admin_staff` (staff) and `creators` (creator) tables. `PUT /admin/users/:userId` accepts `grantCreator` / `revokeCreator` boolean flags; granting inserts/reactivates a `creators` row (status=active), revoking sets status=revoked — both wrapped in a DB transaction with user updates for atomicity. The admin Users table shows multiple role badges per user, the Edit User dialog has a "Creator Access" checkbox toggle (staff role shown read-only), and the View Profile dialog displays all role badges.
**Staff Welcome Email Template**: A branded CRM email template of type `staff_welcome` (seeded by `POST /api/admin/crm/templates/seed-defaults`) is delivered via the Automation Funnel. The backend `POST /api/staff` route fires `triggerFunnel("staff_added", userId, {role_name, password, permissions_summary, login_url, site_url})` after creating a staff member; admins build a funnel in Admin → CRM → Automation with the **"Staff Member Added"** trigger + a "Send Email" step that picks the Staff Welcome template. Available variables: `{{name}}`, `{{email}}`, `{{role_name}}`, `{{password}}`, `{{permissions_summary}}`, `{{login_url}}`, `{{site_url}}`. A runtime DDL migration in `runMigrations()` reconciles the legacy CHECK constraints on `email_templates.type` / `email_automation_rules.event` so the new enum value is accepted before the next drizzle-kit push.
**API Layer**: Express.js 5 backend with Pino for logging.
**Database & ORM**: PostgreSQL via Supabase, managed with Drizzle ORM.
**File Storage**: Supabase Storage for public uploads.
**API Codegen**: Orval generates React Query hooks from an OpenAPI specification.
**Validation**: Zod and drizzle-zod for data validation.
**Payment Gateways**: Integrations with simulated Stripe and Razorpay, and live integrations with Paytm and Cashfree, including secure transaction handling and webhook verification.
**Security**: Comprehensive measures including strict CORS, CSRF defense, strong JWT secret enforcement, rate limiting, access control, SVG upload blocking, SQL injection prevention, Helmet for HTTP security headers, and secure cookie practices.
**Maintenance Mode**: Production-grade maintenance page for graceful downtime.
**Deferred Account Creation**: User accounts are finalized only after payment confirmation.
**Guest Checkout Impersonation Fix**: Prevents unintended user logins during guest checkout.

### Feature Specifications
**Course Management**: Full CRUD operations for courses, modules, and lessons.
**Enrollment & Progress**: Tracks student enrollment and lesson completion.
**Affiliate Program**: Manages referrals, commissions, and payouts. Features an interactive dashboard tour and auto-derives share links from the request domain. The admin Affiliates page (8 sub-tabs: Overview, Applications, Payouts, KYC, Creatives, Sales, Settings, Commission Groups) is fully mobile responsive — desktop layout (≥md) is preserved exactly via `hidden md:block`, while smaller breakpoints render purpose-built `md:hidden` card lists for the data-heavy 10-column Affiliates table and 7-column KYC table. Smaller tables (Paid Payouts, Creatives, Commission Groups, Sales) use horizontal scroll with `overflow-x-auto scrollbar-thin` + `min-w-[…px]`. The top tab strip becomes a horizontal scroller on mobile (`overflow-x-auto`) instead of wrapping. Filter card grids switch from `grid-cols-4` to `grid-cols-2 sm:grid-cols-4`, and 2-column form grids drop to `grid-cols-1` on small screens.
**Analytics**: Admin dashboard with revenue charts and user management.
**Notification System**: In-app notifications for users.
**Platform Settings**: Configuration for commission rates and payment gateways.
**CRM**: Supports email lists, tags, campaigns, sequences, and multi-account SMTP.
**Visual Automation Funnel Builder**: Allows creation of multi-step automation funnels with various triggers (e.g., `user_signup`, `new_purchase`, `staff_added`) and actions (e.g., `send_email`, `apply_tag`). Supports draft/published states.
**Email Tracking**: Tracks email opens, clicks, and unsubscribes with secure link rewriting.
**Email Link Auto-detection**: All outgoing email links automatically use the currently published domain, requiring no manual configuration. This relies on request-driven and background resolution mechanisms, including a `lastObservedHost` cache.
**Facebook Pixel + Conversions API (Server-Side)**: Integrates browser-side and server-side (CAPI) Facebook Pixel events for `PageView`, `InitiateCheckout`, and `Purchase`, ensuring deduplication and secure PII handling. Includes an admin UI for configuration and testing.
**Custom Code Snippets**: Admins can paste arbitrary HTML/JS (analytics, chat widgets, tracking pixels) into one of three placements — Header (`<head>`), Body Start (top of `<body>`), or Footer (bottom of `<body>`) — via Admin → Configuration → Code Snippets. Backend stores them in the `code_snippets` table; CRUD at `/api/admin/code-snippets` is gated by `requirePermission("settings")` so only admins or staff with the Settings permission can manage them. The public `/api/code-snippets` endpoint returns enabled snippets and is consumed by `<CodeSnippetsInjector>` mounted at the App root, which fetches once per mount and injects DOM nodes (recursively re-creating every `<script>` via `document.createElement` so they actually execute, since innerHTML-parsed scripts are inert). Each injected node is tagged with `data-vka-snippet=<id>` and cleared on every re-mount/HMR (idempotent). For `body_start`, the full ordered node list is built first then inserted in reverse at `body.firstChild` so both inter-snippet and intra-snippet ordering match DB order.
**Creator KYC (PAN-based, lock-on-submit)**: Creator KYC card collects three fields — `panName` (name as on PAN card), `panNumber` (validated `[A-Z]{5}[0-9]{4}[A-Z]`, auto-uppercased), and `panFrontUrl` (uploaded image via `<ImageUploader>` → Supabase Storage; not a pasted URL). Lock model: `kycLocked = (panNumber || panName || panFrontUrl) && (kycStatus IN ('pending','approved'))`. Server enforces the lock on `PATCH /api/creator/kyc` (returns 409 if KYC fields touched while locked); bank-only edits always pass through. `GET /api/creator/kyc` returns `{ locked, submitted }` so the UI can render disabled inputs + a status badge ("Not Submitted" / "Under Review" / "Approved" / "Rejected"). On rejection the card surfaces `adminNote` in a destructive Alert and re-enables inputs so the creator can re-submit (resubmit resets `kycStatus → pending`, clears `kycAdminNote` and `kycReviewedAt`). Admin reject in `PATCH /api/admin/creators/:id` requires `kycAdminNote.length >= 5` (returns 400 otherwise); the admin creator-detail page mirrors that — when status="rejected" the textarea is required (red asterisk + helper text) and the submit button is disabled until the reason is entered. Schema fields `pan_name` and `pan_front_url` were added via `ALTER TABLE creators ADD COLUMN IF NOT EXISTS` in `runMigrations()`; legacy `id_proof_url`/`address_proof_url` are kept read-only on admin side for older records.

**Creator Panel + Revenue-Share Commissions**: External course creators are flagged by admins (parallel to `admin_staff`). Like staff, creator status is a **derived role** — `users.role` is never mutated when a user is granted creator access; the admin Users tab LEFT JOINs `creators` and surfaces "creator" via a CASE expression with priority `staff > creator > users.role` (so an admin who is also a creator stays admin). Filter, role counts strip ("Creators"), badge color (emerald), and CSV export all honour the derived role. Each course can be assigned to one creator, who earns a fixed 25% of every sale (split equally per course in a bundle). The login flow's `getPostLoginPath` priority is admin → staff → creator (`/creator/dashboard`) → affiliate → student. The creator dashboard (`/creator/dashboard`) is a SaaS-style overview with a hero header (welcome + active pill), conditional setup banner if KYC/bank missing, 4 polished stat cards (Lifetime / Pending / Paid / This Month with growth %), 30-day Recharts AreaChart of daily earnings, "Next Payout Cycle" side card showing the upcoming Saturday + KYC/bank checklist, top-5 performing courses (last 90d) with progress bars, and recent commissions table. All date windows (month, 30d, 90d, daily chart buckets, next-Saturday computation) are IST-anchored using an `Asia/Kolkata` SQL conversion + `+5h30m` JS offset so they match the payout cycle. The dashboard is read-only — only KYC + bank details are editable. Backend `recordCreatorCommissions(payment, courseIds[])` runs after `recordAffiliateCommission` in `routes/payments.ts` and `routes/bundles.ts`; refunds mark commissions `status='cancelled'` and adjust pending payouts. Auto-payout cycle runs hourly via `setInterval` in `index.ts`, but only fires once per IST-Saturday (deduped via `platformSettingsTable.lastCreatorPayoutCycleAt`); admins can also release manually from `/admin/creator-payouts` (Pending / Paid / Failed / All tabs, mark-paid dialog with txn reference). Staff permission key is `creators` in `lib/db/src/schema/staff.ts`. Creators get an in-app notification when granted access and again when each payout is released.

## External Dependencies

-   **Supabase**: PostgreSQL database and Storage.
-   **Drizzle ORM**: Database schema and migration.
-   **Express.js**: Backend API framework.
-   **Pino**: Backend logging.
-   **React**: Frontend UI library.
-   **Vite**: Frontend build tool.
-   **Wouter**: Frontend router.
-   **TanStack Query**: Data fetching and caching.
-   **Tailwind CSS**: Utility-first CSS framework.
-   **shadcn/ui**: UI component library.
-   **Orval**: OpenAPI to API client code generator.
-   **Zod**: Schema validation.
-   **drizzle-zod**: Zod integration for Drizzle ORM.
-   **`express-rate-limit`**: Rate limiting middleware.
-   **Helmet**: HTTP security headers middleware.
-   **`paytmchecksum`**: Paytm checksum utility.
-   **Stripe**: Payment gateway (simulated).
-   **Razorpay**: Payment gateway (simulated).
-   **Cashfree**: Payment gateway.