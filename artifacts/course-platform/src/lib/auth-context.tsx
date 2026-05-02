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

/**
 * The admin panel is mounted under TWO URL prefixes:
 *   • `/admin/*`  — for the site owner / Super Admin
 *   • `/staff/*`  — for team members granted partial access
 *
 * Both prefixes render the SAME pages/components — the prefix is purely
 * a labelling convention so a team member's URL bar doesn't say "admin"
 * (which would mislead them into thinking they own the site). Permission
 * checks are unchanged and identical for both prefixes.
 *
 * Use `getAdminBase(isStaff)` (or the `useAdminBase()` hook) anywhere a
 * link/redirect targets the admin panel.
 */
export function getAdminBase(isStaff: boolean): string {
  return isStaff ? "/staff" : "/admin";
}

/** Strip `/admin` or `/staff` prefix → returns the suffix (e.g. `/orders`). */
export function adminPathSuffix(path: string): string {
  return path.replace(/^\/(admin|staff)(?=\/|$)/, "");
}

// Ordered list of admin path SUFFIXES and the permission they require. Used
// to find the first allowed page for a staff member after login or when
// they hit a page they don't have permission for. Order = priority
// (dashboard first). Suffixes are joined with the appropriate base prefix.
export const ADMIN_PERMISSION_ROUTES: { suffix: string; perm: string }[] = [
  { suffix: "", perm: "dashboard" },
  { suffix: "/orders", perm: "orders" },
  { suffix: "/enrollments", perm: "enrollments" },
  { suffix: "/coupons", perm: "coupons" },
  { suffix: "/affiliates", perm: "affiliates" },
  { suffix: "/courses", perm: "courses" },
  { suffix: "/pages", perm: "pages" },
  { suffix: "/files", perm: "files" },
  { suffix: "/users", perm: "users" },
  { suffix: "/crm", perm: "crm" },
  { suffix: "/payment-gateways", perm: "paymentGateways" },
  { suffix: "/gst-invoicing", perm: "gstInvoicing" },
  { suffix: "/settings", perm: "settings" },
];

/**
 * Find the first admin path a staff member is allowed to see.
 * `base` defaults to `/staff` because this is almost always called for
 * staff users — pass `/admin` explicitly for full admins if needed.
 */
export function getStaffLandingPath(perms: Record<string, boolean> | null, base: string = "/staff"): string | null {
  if (!perms) return null;
  for (const r of ADMIN_PERMISSION_ROUTES) {
    if (perms[r.perm] === true) return `${base}${r.suffix}`;
  }
  return null;
}

/** Resolve the post-login destination based on user role/permissions. */
export function getPostLoginPath(user: { role?: string; isStaff?: boolean; staffPermissions?: Record<string, boolean> | null } | null | undefined): string {
  if (!user) return "/my-courses";
  if (user.role === "admin" && !user.isStaff) return "/admin";
  if (user.isStaff) {
    const path = getStaffLandingPath(user.staffPermissions ?? null, "/staff");
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

/**
 * Returns the URL prefix the admin panel should use for the current user:
 *   • `/admin` — site owner / Super Admin
 *   • `/staff` — team members granted partial access
 * Use whenever you `<Link href={...}>` or `setLocation(...)` into the panel.
 */
export function useAdminBase(): string {
  const { isStaff } = useAuth();
  return getAdminBase(isStaff);
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
