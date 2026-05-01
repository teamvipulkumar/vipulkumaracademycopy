import { createContext, useContext, useEffect, ReactNode } from "react";
import { useGetMe, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isFetching: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  staffPermissions: Record<string, boolean> | null;
  canAccess: (permission: string) => boolean;
  refetchUser: () => void;
}

// Ordered list of admin paths and the permission they require. Used to find
// the first allowed page for a staff member after login or when they hit a
// page they don't have permission for. Order = priority (dashboard first).
export const ADMIN_PERMISSION_ROUTES: { path: string; perm: string }[] = [
  { path: "/admin", perm: "dashboard" },
  { path: "/admin/orders", perm: "orders" },
  { path: "/admin/enrollments", perm: "enrollments" },
  { path: "/admin/coupons", perm: "coupons" },
  { path: "/admin/affiliates", perm: "affiliates" },
  { path: "/admin/courses", perm: "courses" },
  { path: "/admin/pages", perm: "pages" },
  { path: "/admin/files", perm: "files" },
  { path: "/admin/users", perm: "users" },
  { path: "/admin/crm", perm: "crm" },
  { path: "/admin/payment-gateways", perm: "paymentGateways" },
  { path: "/admin/gst-invoicing", perm: "gstInvoicing" },
  { path: "/admin/settings", perm: "settings" },
];

/** Find the first admin path a staff member is allowed to see. */
export function getStaffLandingPath(perms: Record<string, boolean> | null): string | null {
  if (!perms) return null;
  for (const r of ADMIN_PERMISSION_ROUTES) {
    if (perms[r.perm] === true) return r.path;
  }
  return null;
}

/** Resolve the post-login destination based on user role/permissions. */
export function getPostLoginPath(user: { role?: string; isStaff?: boolean; staffPermissions?: Record<string, boolean> | null } | null | undefined): string {
  if (!user) return "/my-courses";
  if (user.role === "admin" && !user.isStaff) return "/admin";
  if (user.isStaff) {
    const path = getStaffLandingPath(user.staffPermissions ?? null);
    if (path) return path;
  }
  return "/my-courses";
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isFetching: true,
  isAuthenticated: false,
  isAdmin: false,
  isStaff: false,
  staffPermissions: null,
  canAccess: () => false,
  refetchUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isFetching, refetch } = useGetMe({ query: { retry: false } });

  const isStaff = !!(user as any)?.isStaff;
  const staffPermissions: Record<string, boolean> | null = (user as any)?.staffPermissions ?? null;
  const isAdmin = user?.role === "admin" && !isStaff;

  function canAccess(permission: string): boolean {
    if (isAdmin) return true;
    if (isStaff && staffPermissions) return staffPermissions[permission] === true;
    return false;
  }

  const value: AuthContextType = {
    user: user || null,
    isLoading,
    isFetching,
    isAuthenticated: !!user,
    isAdmin,
    isStaff,
    staffPermissions,
    canAccess,
    refetchUser: () => { refetch(); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, isAdmin, isStaff, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const hasAdminAccess = isAdmin || isStaff;

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        setLocation("/login");
      } else if (adminOnly && !hasAdminAccess) {
        setLocation("/my-courses");
      }
    }
  }, [isLoading, isAuthenticated, hasAdminAccess, adminOnly, setLocation]);

  if (isLoading || !isAuthenticated || (adminOnly && !hasAdminAccess)) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
}
