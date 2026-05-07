import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, BookOpen, Share2, Tag, Settings, ArrowLeft, Menu, X, ShoppingCart, GraduationCap, Landmark, Mail, Layers, FileText, HardDrive, ShieldCheck, Megaphone, Sparkles, Wallet, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, getStaffLandingPath, useAdminBase, adminPathSuffix } from "@/lib/auth-context";

function AdminLogo() {
  // ClickOcean mark (matches the public navbar mark, scaled for admin sidebar).
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="coAdminBg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="55%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#0C4A6E" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#coAdminBg)" />
      <circle cx="20" cy="11.5" r="5.6" stroke="white" strokeOpacity="0.35" strokeWidth="1.1" fill="none" />
      <circle cx="20" cy="11.5" r="2.6" fill="white" />
      <path d="M5 24 C 9 21, 13 21, 17 24 S 25 27, 29 24 S 35 21, 37 23.5" stroke="white" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M5 30.5 C 9 27.5, 13 27.5, 17 30.5 S 25 33.5, 29 30.5 S 35 27.5, 37 30" stroke="white" strokeOpacity="0.65" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/**
 * Maps admin path SUFFIXES (without `/admin` or `/staff` prefix) to the
 * permission key required to view that page. Use `permissionForPath()`
 * which strips the prefix automatically before lookup.
 */
const PERMISSION_MAP: Record<string, string> = {
  "": "dashboard",
  "/orders": "orders",
  "/enrollments": "enrollments",
  "/coupons": "coupons",
  "/affiliates": "affiliates",
  "/affiliate-applications": "affiliates",
  "/automation-report": "crm",
  "/courses": "courses",
  "/courses/new": "courses",
  "/pages": "pages",
  "/page-builder": "pages",
  "/files": "files",
  "/users": "users",
  "/crm": "crm",
  "/payment-gateways": "paymentGateways",
  "/gst-invoicing": "gstInvoicing",
  "/creators": "creators",
  "/creator-payouts": "creators",
  "/settings": "settings",
  "/facebook-pixel": "settings",
  "/code-snippets": "settings",
};

/**
 * Match a current path against the PERMISSION_MAP, taking subroutes into
 * account (e.g. /admin/courses/123/edit → "courses"). Strips the
 * `/admin` or `/staff` prefix first so both URL forms resolve identically.
 * Returns null for the Staff & Access page (admin-only) and unmapped paths.
 */
function permissionForPath(path: string): string | null {
  const suffix = adminPathSuffix(path);
  if (suffix === "/staff") return null; // Staff & Access — admin only
  if (PERMISSION_MAP[suffix] !== undefined) return PERMISSION_MAP[suffix];
  // Longest-prefix match for nested routes (e.g. /courses/123/edit, /page-builder/foo)
  let best: { len: number; perm: string } | null = null;
  for (const key of Object.keys(PERMISSION_MAP)) {
    if (key && suffix.startsWith(key + "/") && (!best || key.length > best.len)) {
      best = { len: key.length, perm: PERMISSION_MAP[key] };
    }
  }
  return best?.perm ?? null;
}

/**
 * Sidebar nav items. `suffix` is the path AFTER the `/admin` or `/staff`
 * prefix (e.g. `""`, `"/orders"`). The active prefix is added at render
 * time via `useAdminBase()` so a team member's URL bar never shows /admin.
 */
const navGroups: { label: string; items: { suffix: string; icon: typeof LayoutDashboard; label: string }[] }[] = [
  {
    label: "Overview",
    items: [
      { suffix: "", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    label: "Sales",
    items: [
      { suffix: "/orders", icon: ShoppingCart, label: "Orders" },
      { suffix: "/enrollments", icon: GraduationCap, label: "Enrollments" },
      { suffix: "/coupons", icon: Tag, label: "Coupons" },
      { suffix: "/affiliates", icon: Share2, label: "Affiliates" },
    ],
  },
  {
    label: "Content",
    items: [
      { suffix: "/courses", icon: BookOpen, label: "Courses" },
      { suffix: "/pages", icon: Layers, label: "Pages" },
      { suffix: "/files", icon: HardDrive, label: "Files" },
    ],
  },
  {
    label: "Users & CRM",
    items: [
      { suffix: "/users", icon: Users, label: "Users" },
      { suffix: "/creators", icon: Sparkles, label: "Creators" },
      { suffix: "/crm", icon: Mail, label: "CRM & Email" },
    ],
  },
  {
    label: "Finance",
    items: [
      { suffix: "/payment-gateways", icon: Landmark, label: "Payment Gateways" },
      { suffix: "/gst-invoicing", icon: FileText, label: "GST Invoicing" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { suffix: "/settings", icon: Settings, label: "Settings" },
      { suffix: "/facebook-pixel", icon: Megaphone, label: "Facebook Pixel" },
      { suffix: "/code-snippets", icon: Code2, label: "Code Snippets" },
      { suffix: "/staff", icon: ShieldCheck, label: "Staff & Access" },
    ],
  },
];

function NavContent({ location, onNav }: { location: string; onNav?: () => void }) {
  const { isAdmin, isStaff, staffPermissions } = useAuth();
  const base = useAdminBase();
  const currentSuffix = adminPathSuffix(location);

  function canSee(suffix: string): boolean {
    if (isAdmin) return true;
    if (suffix === "/staff") return false; // Staff & Access — admin only
    if (isStaff && staffPermissions) {
      const perm = PERMISSION_MAP[suffix];
      return perm ? staffPermissions[perm] === true : false;
    }
    return false;
  }

  return (
    <>
      <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin space-y-4">
        {navGroups.map(group => {
          const visibleItems = group.items.filter(item => canSee(item.suffix));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const href = `${base}${item.suffix}`;
                  const isActive = item.suffix === ""
                    ? currentSuffix === ""
                    : currentSuffix.startsWith(item.suffix + "/") || currentSuffix === item.suffix;
                  return (
                    <Link key={item.suffix} href={href} onClick={onNav}>
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
  const base = useAdminBase();
  // Sidebar branding label changes by role so a team member never sees
  // "Admin Panel" — they see "Staff Panel" instead.
  const panelLabel = isStaff ? "Staff Panel" : "Admin Panel";

  // Page-level guard: if a staff member lands on an admin page they don't
  // have permission for (e.g. dashboard with no `dashboard` perm), redirect
  // them to the first page they ARE allowed to see. Without this guard the
  // page would render and call APIs that 403, leaving a confusing "all
  // zeros" dashboard. Works for both `/admin/*` and `/staff/*` URLs.
  useEffect(() => {
    if (isAdmin || !isStaff || !staffPermissions) return;
    const suffix = adminPathSuffix(location);
    if (suffix === "/staff") {
      // Staff can never see Staff & Access — bounce them.
      const safe = getStaffLandingPath(staffPermissions, base);
      if (safe) setLocation(safe);
      return;
    }
    const required = permissionForPath(location);
    if (required && staffPermissions[required] !== true) {
      const safe = getStaffLandingPath(staffPermissions, base);
      if (safe && safe !== location) setLocation(safe);
    }
  }, [location, isAdmin, isStaff, staffPermissions, setLocation, base]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden md:flex w-56 border-r border-border bg-card flex-shrink-0 flex-col h-screen">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <AdminLogo />
            <div className="leading-none">
              <p className="font-bold text-xs text-foreground tracking-wide">CLICKOCEAN</p>
              <p className="text-[10px] text-primary/80 tracking-wider uppercase font-medium">{panelLabel}</p>
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
          <p className="font-bold text-xs text-foreground">CLICKOCEAN</p>
          <p className="text-[10px] text-primary/80 tracking-wide uppercase">{panelLabel}</p>
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
                  <p className="font-bold text-xs text-foreground tracking-wide">CLICKOCEAN</p>
                  <p className="text-[10px] text-primary/80 tracking-wider uppercase">{panelLabel}</p>
                </div>
              </div>
            </div>
            <NavContent location={location} onNav={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto min-w-0 md:pt-0 pt-14 [scrollbar-gutter:stable]">
        {children}
      </main>
    </div>
  );
}
