# EduPro — Online Course Platform

## Overview
EduPro is a full-stack SaaS online course selling platform offering a comprehensive and engaging learning experience. It provides advanced features for course creators and students, including a visual automation funnel builder, affiliate programs, and secure payment integrations. The platform aims to be a premium offering in the online learning market with a focus on business vision, market potential, and ambitious project goals.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.

## System Architecture

### UI/UX Decisions
The platform utilizes a premium theme with `dark` (default) and `light` options, built with React, Vite, Wouter, TanStack Query, Tailwind CSS, and shadcn/ui for a responsive design. Specific layouts are provided for admin dashboards. The profile page features a read-only "view" mode for personal details, requiring an explicit "Edit" action. Password changes necessitate the current password for security.

### Technical Implementations
The project is structured as a monorepo using pnpm workspaces for `course-platform` (frontend), `api-server` (backend), `api-spec` (API codegen), and `db` (database schema). Authentication uses JWT via httpOnly cookies, supporting login, registration, password reset, and Google OAuth, with role-aware redirects. Staff access is managed via a dedicated `admin_staff` table, providing granular permissions without altering the user's base `role`. Multi-role display (admin, staff, creator) is supported, with backend APIs returning a `roles` array. A "Staff Member Added" automation funnel delivers welcome emails with templated variables. The API is built with Express.js, using Pino for logging. PostgreSQL via Supabase and Drizzle ORM handles database operations. Supabase Storage is used for file uploads. Orval generates React Query hooks from an OpenAPI specification, and Zod/drizzle-zod are used for validation. Comprehensive security measures are implemented, including CORS, CSRF, rate limiting, and secure cookie practices. Maintenance mode and deferred account creation are supported.

### Feature Specifications
The platform offers full CRUD for courses, modules, and lessons, including an optional `compareAtPrice` for courses. It tracks student enrollment and progress. A robust affiliate program manages referrals, commissions, and payouts, featuring a responsive admin interface and interactive dashboard tour. The admin dashboard provides analytics with revenue charts and user management. An in-app notification system is included. Platform settings allow configuration of commission rates and payment gateways. A visual automation funnel builder enables multi-step automations with various triggers and actions, supporting draft and published states. Email tracking for opens, clicks, and unsubscribes is integrated, along with automatic link rewriting. Facebook Pixel and Conversions API (server-side) are integrated for event tracking and deduplication. Admins can inject custom HTML/JS snippets into various page placements (`<head>`, `<body>` start/end). Creator KYC (PAN-based) is implemented with lock-on-submit functionality, status tracking, and admin notes for rejections. A Creator Panel offers a dashboard for external course creators, including revenue-share commissions, payout tracking, and in-app notifications for payouts.

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
-   **Stripe**: Payment gateway (simulated).
-   **Razorpay**: Payment gateway (simulated).
-   **Paytm**: Payment gateway.
-   **Cashfree**: Payment gateway.