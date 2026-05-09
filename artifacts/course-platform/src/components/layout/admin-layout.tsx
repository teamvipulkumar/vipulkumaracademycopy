import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, BookOpen, Share2, Tag, Settings, ArrowLeft, Menu, X, ShoppingCart, GraduationCap, Landmark, Mail, Layers, FileText, HardDrive, ShieldCheck, Megaphone, Sparkles, Wallet, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, getStaffLandingPath, useAdminBase, adminPathSuffix } from "@/lib/auth-context";
import { UpcalifyLogo } from "@/components/upcalify-logo";
import { useBranding, useThemedLogo } from "@/lib/branding-context";

/**
 * Logo for the admin/staff sidebar header. Reads the configured `logoSize`
 * from Site Identity & SEO but caps it for the sidebar — the public navbar
 * is wide enough for big logos, but a 224px sidebar needs a tighter mark
 * to stay legible and professional. The 28/22px ceilings are tuned so the
 * brand mark sits like a typical SaaS dashboard wordmark (Linear, Stripe).
 */
// Tight caps so the logo + "ADMIN PANEL" / "STAFF PANEL" label both fit
// inside the narrow 224px sidebar without truncation. Bumping these up
// will start clipping the panel label on the desktop sidebar.
const SIDEBAR_LOGO_MAX_DESKTOP = 28;
const SIDEBAR_LOGO_MAX_MOBILE = 24;

function AdminLogo({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const themedLogo = useThemedLogo();
  const { siteName, logoSize, logoSizeMobile } = useBranding();
  const cap = variant === "mobile" ? SIDEBAR_LOGO_MAX_MOBILE : SIDEBAR_LOGO_MAX_DESKTOP;
  const configured = variant === "mobile" ? logoSizeMobile : logoSize;
  const height = Math.min(configured, cap);
  if (themedLogo) {
    return (
      <img
        src={themedLogo}
        alt={siteName || "Logo"}
        className="object-contain"
        style={{ height, width: "auto", maxWidth: height * 5 }}
      />
    );
  }
  return <UpcalifyLogo height={height} className="text-foreground" />;
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
        {/* Sidebar brand block — left-aligned, two tight rows: brand mark on
            top and a small panel label directly underneath. Mirrors the
            condensed wordmark + section subtitle pattern used by Linear,
            Stripe and Vercel back-offices, which read as far more "product
            grade" than centered marketing-style headers. */}
        {/* Sidebar brand block — logo + panel label sit on a single row,
            label slightly muted and divided from the mark by a thin border
            so the eye reads "{Brand} · ADMIN PANEL" as one unit. */}
        {/* Sidebar brand block — logo shrinks if needed so the panel label
            always shows fully (flex-shrink-0 on the label, min-w-0 + shrink
            on the logo wrapper). */}
        <div className="px-3 py-3.5 border-b border-border">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="min-w-0 flex-shrink overflow-hidden">
              <AdminLogo variant="desktop" />
            </div>
            <span className="flex-shrink-0 text-[9px] text-foreground/80 tracking-[0.18em] uppercase font-bold leading-none border-l border-border pl-1.5 whitespace-nowrap">
              {panelLabel}
            </span>
          </div>
        </div>
        <NavContent location={location} />
      </aside>

      {/* Mobile top bar — same inline pattern: logo + label to the right. */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-card border-b border-border flex items-center px-3 gap-1.5">
        <Button variant="ghost" size="sm" className="px-2 flex-shrink-0" onClick={() => setMobileOpen(o => !o)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
        <div className="min-w-0 flex-shrink overflow-hidden">
          <AdminLogo variant="mobile" />
        </div>
        <span className="flex-shrink-0 text-[9px] text-foreground/80 tracking-[0.18em] uppercase font-bold leading-none border-l border-border pl-1.5 whitespace-nowrap">
          {panelLabel}
        </span>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute top-14 left-0 bottom-0 w-64 bg-card border-r border-border flex flex-col shadow-2xl">
            {/* Mobile drawer mirrors the desktop sidebar layout exactly. */}
            <div className="px-3 py-3.5 border-b border-border">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="min-w-0 flex-shrink overflow-hidden">
                  <AdminLogo variant="desktop" />
                </div>
                <span className="flex-shrink-0 text-[9px] text-foreground/80 tracking-[0.18em] uppercase font-bold leading-none border-l border-border pl-1.5 whitespace-nowrap">
                  {panelLabel}
                </span>
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
