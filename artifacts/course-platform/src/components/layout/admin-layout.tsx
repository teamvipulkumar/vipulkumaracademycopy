import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, BookOpen, Share2, Tag, Settings, ArrowLeft, Menu, X, ShoppingCart, GraduationCap, Landmark, Mail, Layers, FileText, HardDrive, ShieldCheck, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, getStaffLandingPath } from "@/lib/auth-context";

function AdminLogo() {
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#2563eb" />
      <path d="M20 8L32 14v2l-12 6L8 16v-2L20 8z" fill="white" opacity="0.95" />
      <path d="M12 18.5v7c0 1.5 3.6 4.5 8 4.5s8-3 8-4.5v-7L20 22l-8-3.5z" fill="white" opacity="0.85" />
      <rect x="31" y="14" width="2" height="10" rx="1" fill="white" opacity="0.7" />
      <circle cx="32" cy="25" r="2" fill="#60a5fa" />
    </svg>
  );
}

const PERMISSION_MAP: Record<string, string> = {
  "/admin": "dashboard",
  "/admin/orders": "orders",
  "/admin/enrollments": "enrollments",
  "/admin/coupons": "coupons",
  "/admin/affiliates": "affiliates",
  "/admin/affiliate-applications": "affiliates",
  "/admin/automation-report": "crm",
  "/admin/courses": "courses",
  "/admin/courses/new": "courses",
  "/admin/pages": "pages",
  "/admin/page-builder": "pages",
  "/admin/files": "files",
  "/admin/users": "users",
  "/admin/crm": "crm",
  "/admin/payment-gateways": "paymentGateways",
  "/admin/gst-invoicing": "gstInvoicing",
  "/admin/settings": "settings",
  "/admin/facebook-pixel": "settings",
};

/**
 * Match a current path against the PERMISSION_MAP, taking subroutes into
 * account (e.g. /admin/courses/123/edit → "courses").
 * Returns null for /admin/staff (admin-only) and unmapped paths.
 */
function permissionForPath(path: string): string | null {
  if (path === "/admin/staff") return null;
  if (PERMISSION_MAP[path]) return PERMISSION_MAP[path];
  // Longest-prefix match for nested routes like /admin/courses/123 or /admin/page-builder/foo
  let best: { len: number; perm: string } | null = null;
  for (const key of Object.keys(PERMISSION_MAP)) {
    if (path.startsWith(key + "/") && (!best || key.length > best.len)) {
      best = { len: key.length, perm: PERMISSION_MAP[key] };
    }
  }
  return best?.perm ?? null;
}

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/admin/orders", icon: ShoppingCart, label: "Orders" },
      { href: "/admin/enrollments", icon: GraduationCap, label: "Enrollments" },
      { href: "/admin/coupons", icon: Tag, label: "Coupons" },
      { href: "/admin/affiliates", icon: Share2, label: "Affiliates" },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/courses", icon: BookOpen, label: "Courses" },
      { href: "/admin/pages", icon: Layers, label: "Pages" },
      { href: "/admin/files", icon: HardDrive, label: "Files" },
    ],
  },
  {
    label: "Users & CRM",
    items: [
      { href: "/admin/users", icon: Users, label: "Users" },
      { href: "/admin/crm", icon: Mail, label: "CRM & Email" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/payment-gateways", icon: Landmark, label: "Payment Gateways" },
      { href: "/admin/gst-invoicing", icon: FileText, label: "GST Invoicing" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/admin/settings", icon: Settings, label: "Settings" },
      { href: "/admin/facebook-pixel", icon: Megaphone, label: "Facebook Pixel" },
      { href: "/admin/staff", icon: ShieldCheck, label: "Staff & Access" },
    ],
  },
];

function NavContent({ location, onNav }: { location: string; onNav?: () => void }) {
  const { isAdmin, isStaff, staffPermissions } = useAuth();

  function canSee(href: string): boolean {
    if (isAdmin) return true;
    if (href === "/admin/staff") return false;
    if (isStaff && staffPermissions) {
      const perm = PERMISSION_MAP[href];
      return perm ? staffPermissions[perm] === true : false;
    }
    return false;
  }

  return (
    <>
      <nav className="flex-1 p-3 overflow-y-auto space-y-4">
        {navGroups.map(group => {
          const visibleItems = group.items.filter(item => canSee(item.href));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const isActive = item.href === "/admin"
                    ? location === "/admin"
                    : location.startsWith(item.href + "/") || location === item.href;
                  return (
                    <Link key={item.href} href={item.href} onClick={onNav}>
                      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border">
        <Link href="/" onClick={onNav}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-background cursor-pointer transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Site
          </div>
        </Link>
      </div>
    </>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin, isStaff, staffPermissions } = useAuth();

  // Page-level guard: if a staff member lands on an admin page they don't
  // have permission for (e.g. /admin dashboard with no `dashboard` perm),
  // redirect them to the first page they ARE allowed to see. Without this
  // guard the page would render and call APIs that 403, leaving a confusing
  // "all zeros" dashboard.
  useEffect(() => {
    if (isAdmin || !isStaff || !staffPermissions) return;
    if (location === "/admin/staff") {
      // Staff can never see Staff & Access — bounce them.
      const safe = getStaffLandingPath(staffPermissions);
      if (safe) setLocation(safe);
      return;
    }
    const required = permissionForPath(location);
    if (required && staffPermissions[required] !== true) {
      const safe = getStaffLandingPath(staffPermissions);
      if (safe && safe !== location) setLocation(safe);
    }
  }, [location, isAdmin, isStaff, staffPermissions, setLocation]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden md:flex w-56 border-r border-border bg-card flex-shrink-0 flex-col h-screen">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <AdminLogo />
            <div className="leading-none">
              <p className="font-bold text-xs text-foreground tracking-wide">VK ACADEMY</p>
              <p className="text-[10px] text-primary/80 tracking-wider uppercase font-medium">Admin Panel</p>
            </div>
          </div>
        </div>
        <NavContent location={location} />
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
        <Button variant="ghost" size="sm" className="px-2" onClick={() => setMobileOpen(o => !o)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
        <AdminLogo />
        <div className="leading-none">
          <p className="font-bold text-xs text-foreground">VK ACADEMY</p>
          <p className="text-[10px] text-primary/80 tracking-wide uppercase">Admin Panel</p>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute top-14 left-0 bottom-0 w-64 bg-card border-r border-border flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <AdminLogo />
                <div className="leading-none">
                  <p className="font-bold text-xs text-foreground tracking-wide">VK ACADEMY</p>
                  <p className="text-[10px] text-primary/80 tracking-wider uppercase">Admin Panel</p>
                </div>
              </div>
            </div>
            <NavContent location={location} onNav={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto min-w-0 md:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
