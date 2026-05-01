import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { BrandingProvider } from "@/lib/branding-context";
import { AppLayout } from "@/components/layout/app-layout";
import { MaintenanceWatcher } from "@/components/maintenance-watcher";
import { AdminLayout } from "@/components/layout/admin-layout";
import NotFound from "@/pages/not-found";
import { initPixel, injectBaseCode, fbPageView } from "@/lib/facebook-pixel";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Referral link tracker ─────────────────────────────────────────────────── */
const VKA_REF_KEY = "vka_ref_v2";

export function getStoredRef(): string | null {
  try {
    const raw = localStorage.getItem(VKA_REF_KEY);
    if (!raw) return null;
    const { code, expiry } = JSON.parse(raw) as { code: string; expiry: number };
    if (Date.now() > expiry) {
      localStorage.removeItem(VKA_REF_KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

function RefTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref) return;

    // Store ref IMMEDIATELY with a 30-day default so it's available even if user
    // goes straight to checkout before the API response comes back (last-click wins).
    const defaultExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem(VKA_REF_KEY, JSON.stringify({ code: ref, expiry: defaultExpiry }));

    // Then refine the expiry using the platform's configured cookieDays setting
    fetch(`${API_BASE}/api/affiliate/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralCode: ref }),
    })
      .then(r => r.json())
      .then(({ cookieDays = 30 }) => {
        const expiry = Date.now() + cookieDays * 24 * 60 * 60 * 1000;
        localStorage.setItem(VKA_REF_KEY, JSON.stringify({ code: ref, expiry }));
      })
      .catch(() => { /* already stored with default expiry above */ });
  }, []);
  return null;
}

function PixelTracker() {
  const [location] = useLocation();

  useEffect(() => {
    fetch(`${API_BASE}/api/pixel-config`)
      .then(r => r.json())
      .then(({ enabled, pixelId, baseCode }: { enabled: boolean; pixelId: string | null; baseCode: string | null }) => {
        if (!enabled) return;
        if (baseCode) {
          injectBaseCode(baseCode);
        } else if (pixelId) {
          initPixel(pixelId);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fbPageView();
  }, [location]);

  return null;
}

import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import CoursesPage from "@/pages/courses";
import CourseDetailPage from "@/pages/course-detail";
import MyCoursesPage from "@/pages/my-courses";
import LearnPage from "@/pages/learn";
import AffiliatePage from "@/pages/affiliate";
import PaymentsPage from "@/pages/payments-page";
import NotificationsPage from "@/pages/notifications-page";
import ProfilePage from "@/pages/profile-page";

import AdminDashboard from "@/pages/admin/index";
import AdminCoursesPage from "@/pages/admin/courses";
import AdminCourseEditPage from "@/pages/admin/course-edit";
import AdminCourseNewPage from "@/pages/admin/course-new";
import AdminUsersPage from "@/pages/admin/users";
import AdminAffiliatesPage from "@/pages/admin/affiliates";
import AdminCouponsPage from "@/pages/admin/coupons";
import AdminOrdersPage from "@/pages/admin/orders";
import AdminEnrollmentsPage from "@/pages/admin/enrollments";
import AdminPaymentGatewaysPage from "@/pages/admin/payment-gateways";
import AdminSettingsPage from "@/pages/admin/settings";
import AdminFacebookPixelPage from "@/pages/admin/facebook-pixel";
import AdminCrmPage from "@/pages/admin/crm";
import AutomationReportPage from "@/pages/admin/automation-report";
import AdminPagesPage from "@/pages/admin/pages";
import AdminGstInvoicingPage from "@/pages/admin/gst-invoicing";
import AdminFilesPage from "@/pages/admin/files";
import AdminStaffPage from "@/pages/admin/staff";
import PageBuilderPage from "@/pages/admin/page-builder";
import PageRendererPage from "@/pages/page-renderer";
import PaymentVerifyPage from "@/pages/payment-verify";
import VerifyEmailPage from "@/pages/verify-email";
import CheckoutPage from "@/pages/checkout";
import BundleCheckoutPage from "@/pages/bundle-checkout";
import BundleDetailPage from "@/pages/bundle-detail";
import OptinPage from "@/pages/optin";
import VslPage from "@/pages/vsl";
import OrderPage from "@/pages/order";
import PrivacyPolicyPage from "@/pages/privacy-policy";
import TermsOfServicePage from "@/pages/terms-of-service";
import CookiePolicyPage from "@/pages/cookie-policy";
import RefundPolicyPage from "@/pages/refund-policy";
import AboutUsPage from "@/pages/about-us";
import CareersPage from "@/pages/careers";
import ContactUsPage from "@/pages/contact-us";
import HelpCenterPage from "@/pages/help-center";
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <AppLayout><Home /></AppLayout>} />
      <Route path="/login" component={() => <Login />} />
      <Route path="/register" component={() => <Register />} />
      <Route path="/forgot-password" component={() => <ForgotPassword />} />
      <Route path="/reset-password" component={() => <ResetPassword />} />
      <Route path="/courses" component={() => <AppLayout><CoursesPage /></AppLayout>} />
      <Route path="/courses/:id" component={() => <AppLayout><CourseDetailPage /></AppLayout>} />

      <Route path="/my-courses" component={() => <AppLayout><ProtectedRoute><MyCoursesPage /></ProtectedRoute></AppLayout>} />
      <Route path="/learn/:courseId" component={() => <ProtectedRoute><LearnPage /></ProtectedRoute>} />
      <Route path="/affiliate" component={() => <AppLayout noFooter><ProtectedRoute><AffiliatePage /></ProtectedRoute></AppLayout>} />
      <Route path="/affiliate/:tab" component={() => <AppLayout noFooter><ProtectedRoute><AffiliatePage /></ProtectedRoute></AppLayout>} />
      <Route path="/payments" component={() => <AppLayout><ProtectedRoute><PaymentsPage /></ProtectedRoute></AppLayout>} />
      <Route path="/notifications" component={() => <AppLayout><ProtectedRoute><NotificationsPage /></ProtectedRoute></AppLayout>} />
      <Route path="/profile" component={() => <AppLayout><ProtectedRoute><ProfilePage /></ProtectedRoute></AppLayout>} />

      <Route path="/optin" component={() => <OptinPage />} />
      <Route path="/vsl" component={() => <VslPage />} />
      <Route path="/order" component={() => <OrderPage />} />
      <Route path="/privacy-policy" component={() => <AppLayout><PrivacyPolicyPage /></AppLayout>} />
      <Route path="/terms-of-service" component={() => <AppLayout><TermsOfServicePage /></AppLayout>} />
      <Route path="/cookie-policy" component={() => <AppLayout><CookiePolicyPage /></AppLayout>} />
      <Route path="/refund-policy" component={() => <AppLayout><RefundPolicyPage /></AppLayout>} />
      <Route path="/about-us" component={() => <AppLayout><AboutUsPage /></AppLayout>} />
      <Route path="/careers" component={() => <AppLayout><CareersPage /></AppLayout>} />
      <Route path="/contact-us" component={() => <AppLayout><ContactUsPage /></AppLayout>} />
      <Route path="/help-center" component={() => <AppLayout><HelpCenterPage /></AppLayout>} />

      <Route path="/admin" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/courses" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminCoursesPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/courses/new" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminCourseNewPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/courses/:id/edit" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminCourseEditPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/users" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminUsersPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/affiliates" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminAffiliatesPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/coupons" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminCouponsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/orders" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminOrdersPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/enrollments" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminEnrollmentsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/payment-gateways" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminPaymentGatewaysPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/checkout/:id" component={() => <CheckoutPage />} />
      <Route path="/bundles/:id" component={() => <AppLayout><BundleDetailPage /></AppLayout>} />
      <Route path="/bundles/:id/checkout" component={() => <BundleCheckoutPage />} />
      <Route path="/payment/verify" component={() => <PaymentVerifyPage />} />
      <Route path="/verify-email" component={() => <VerifyEmailPage />} />
      <Route path="/admin/settings" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminSettingsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/facebook-pixel" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminFacebookPixelPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/crm" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminCrmPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/crm/automation/:id/report" component={() => <ProtectedRoute adminOnly><AdminLayout><AutomationReportPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/pages" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminPagesPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/gst-invoicing" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminGstInvoicingPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/files" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminFilesPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/staff" component={() => <ProtectedRoute adminOnly><AdminLayout><AdminStaffPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/pages/:id/builder" component={() => <ProtectedRoute adminOnly><PageBuilderPage /></ProtectedRoute>} />

      <Route path="/p/:slug" component={() => <PageRendererPage />} />

      <Route component={() => <AppLayout><NotFound /></AppLayout>} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
      <AuthProvider>
        <TooltipProvider>
          <RefTracker />
          <PixelTracker />
          <MaintenanceWatcher />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
      </BrandingProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
