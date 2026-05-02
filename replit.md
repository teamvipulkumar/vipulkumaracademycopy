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
**Affiliate Program**: Manages referrals, commissions, and payouts. Features an interactive dashboard tour and auto-derives share links from the request domain.
**Analytics**: Admin dashboard with revenue charts and user management.
**Notification System**: In-app notifications for users.
**Platform Settings**: Configuration for commission rates and payment gateways.
**CRM**: Supports email lists, tags, campaigns, sequences, and multi-account SMTP.
**Visual Automation Funnel Builder**: Allows creation of multi-step automation funnels with various triggers (e.g., `user_signup`, `new_purchase`, `staff_added`) and actions (e.g., `send_email`, `apply_tag`). Supports draft/published states.
**Email Tracking**: Tracks email opens, clicks, and unsubscribes with secure link rewriting.
**Email Link Auto-detection**: All outgoing email links automatically use the currently published domain, requiring no manual configuration. This relies on request-driven and background resolution mechanisms, including a `lastObservedHost` cache.
**Facebook Pixel + Conversions API (Server-Side)**: Integrates browser-side and server-side (CAPI) Facebook Pixel events for `PageView`, `InitiateCheckout`, and `Purchase`, ensuring deduplication and secure PII handling. Includes an admin UI for configuration and testing.
**Creator Panel + Revenue-Share Commissions**: External course creators are flagged by admins (parallel to `admin_staff`). Each course can be assigned to one creator, who earns a fixed 25% of every sale (split equally per course in a bundle). The login flow's `getPostLoginPath` priority is admin → staff → creator (`/creator/dashboard`) → affiliate → student. The creator dashboard is read-only (sales / commissions / payouts / assigned courses) — only KYC + bank details are editable. Backend `recordCreatorCommissions(payment, courseIds[])` runs after `recordAffiliateCommission` in `routes/payments.ts` and `routes/bundles.ts`; refunds mark commissions `status='cancelled'` and adjust pending payouts. Auto-payout cycle runs hourly via `setInterval` in `index.ts`, but only fires once per IST-Saturday (deduped via `platformSettingsTable.lastCreatorPayoutCycleAt`); admins can also release manually from `/admin/creator-payouts` (Pending / Paid / Failed / All tabs, mark-paid dialog with txn reference). Staff permission key is `creators` in `lib/db/src/schema/staff.ts`. Creators get an in-app notification when granted access and again when each payout is released.

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