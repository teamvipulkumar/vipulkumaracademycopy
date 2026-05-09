import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ShoppingCart, Wallet, BookOpen, IdCard,
  ArrowLeft, Menu, X, Sparkles, BadgeCheck, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─────────── Brand mark (gradient logo) ─────────── */
function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="relative rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20 ring-1 ring-white/10"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 60%, #2563eb 100%)",
      }}
    >
      <Sparkles className="text-white drop-shadow" style={{ width: size * 0.5, height: size * 0.5 }} />
      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-card" />
    </div>
  );
}

/* ─────────── Brand block (logo + product name) ─────────── */
function BrandBlock() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark size={36} />
      <div className="leading-none min-w-0">
        <p className="font-bold text-sm text-foreground tracking-tight">
          Creator <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">Panel</span>
        </p>
        <p className="text-[9.5px] text-muted-foreground tracking-[0.14em] uppercase font-semibold mt-0.5">
          Upcalify · Partner Portal
        </p>
      </div>
    </div>
  );
}

/* ─────────── User profile card (sidebar bottom) ─────────── */
function UserProfileCard({ name, email }: { name: string; email?: string }) {
  // Pull KYC info to show verified badge
  const { data } = useQuery<{ creator: { kycStatus: string; status: string } }>({
    queryKey: ["creator-dashboard"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/creator/dashboard`, { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });
  const kycOk = data?.creator?.kycStatus === "approved";
  const initials = name
    .split(" ")
    .map(s => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-violet-500/5 via-card to-card p-2.5">
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shadow-md">
            {initials || "C"}
          </div>
          {kycOk && (
            <BadgeCheck className="absolute -bottom-0.5 -right-0.5 w-4 h-4 text-blue-400 fill-blue-500/20" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground truncate">{name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{email ?? "Creator"}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {kycOk ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <BadgeCheck className="w-2.5 h-2.5" />
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-2.5 h-2.5" />
            KYC Pending
          </span>
        )}
        <span className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">
          Creator
        </span>
      </div>
    </div>
  );
}

/* ─────────── Nav ─────────── */
const navItems: { path: string; icon: typeof LayoutDashboard; label: string }[] = [
  { path: "/creator", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/creator/sales", icon: ShoppingCart, label: "Sales & Commissions" },
  { path: "/creator/payouts", icon: Wallet, label: "Payouts" },
  { path: "/creator/courses", icon: BookOpen, label: "My Courses" },
  { path: "/creator/kyc", icon: IdCard, label: "KYC & Bank" },
];

function NavContent({
  location, onNav, name, email,
}: { location: string; onNav?: () => void; name: string; email?: string }) {
  return (
    <>
      <div className="px-3 pt-3 pb-2">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 px-3 mb-1.5">
          Workspace
        </p>
      </div>
      <nav className="flex-1 px-3 overflow-y-auto space-y-1">
        {navItems.map(item => {
          const isActive = item.path === "/creator"
            ? location === "/creator" || location === "/creator/"
            : location.startsWith(item.path);
          return (
            <Link key={item.path} href={item.path} onClick={onNav}>
              <div className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                isActive
                  ? "bg-gradient-to-r from-violet-500/15 to-blue-500/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}>
                <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-violet-400" : ""}`} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border space-y-2">
        <UserProfileCard name={name} email={email} />
        <Link href="/" onClick={onNav}>
          <div className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer transition-colors">
            <ArrowLeft className="w-3 h-3" />
            Back to Site
          </div>
        </Link>
      </div>
    </>
  );
}

export function CreatorLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const name = user?.name ?? "Creator";
  const email = user?.email;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 border-r border-border bg-card flex-shrink-0 flex-col h-screen">
        <div className="p-4 border-b border-border bg-gradient-to-br from-violet-500/[0.04] to-transparent">
          <BrandBlock />
        </div>
        <NavContent location={location} name={name} email={email} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-card border-b border-border flex items-center px-3 gap-2">
        <Button variant="ghost" size="sm" className="px-2" onClick={() => setMobileOpen(o => !o)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
        <BrandBlock />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" onClick={() => setMobileOpen(false)} />
          <aside className="absolute top-14 left-0 bottom-0 w-64 bg-card border-r border-border flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border bg-gradient-to-br from-violet-500/[0.04] to-transparent">
              <BrandBlock />
            </div>
            <NavContent location={location} onNav={() => setMobileOpen(false)} name={name} email={email} />
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto min-w-0 md:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
