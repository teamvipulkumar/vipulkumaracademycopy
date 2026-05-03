import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, ShoppingCart, Wallet, BookOpen, IdCard, ArrowLeft, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

function CreatorLogo() {
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#7c3aed" />
      <path d="M14 12h12v3H14zM14 18h8v3h-8zM14 24h12v3H14z" fill="white" opacity="0.95" />
      <circle cx="29" cy="13.5" r="2.2" fill="#a78bfa" />
    </svg>
  );
}

const navItems: { path: string; icon: typeof LayoutDashboard; label: string }[] = [
  { path: "/creator", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/creator/sales", icon: ShoppingCart, label: "Sales & Commissions" },
  { path: "/creator/payouts", icon: Wallet, label: "Payouts" },
  { path: "/creator/courses", icon: BookOpen, label: "My Courses" },
  { path: "/creator/kyc", icon: IdCard, label: "KYC & Bank" },
];

function NavContent({ location, onNav }: { location: string; onNav?: () => void }) {
  return (
    <>
      <nav className="flex-1 p-3 overflow-y-auto space-y-0.5">
        {navItems.map(item => {
          const isActive = item.path === "/creator"
            ? location === "/creator" || location === "/creator/"
            : location.startsWith(item.path);
          return (
            <Link key={item.path} href={item.path} onClick={onNav}>
              <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border space-y-1">
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

export function CreatorLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden md:flex w-56 border-r border-border bg-card flex-shrink-0 flex-col h-screen">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <CreatorLogo />
            <div className="leading-none">
              <p className="font-bold text-xs text-foreground tracking-wide">{user?.name ?? "Creator"}</p>
              <p className="text-[10px] text-primary/80 tracking-wider uppercase font-medium">Creator Panel</p>
            </div>
          </div>
        </div>
        <NavContent location={location} />
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
        <Button variant="ghost" size="sm" className="px-2" onClick={() => setMobileOpen(o => !o)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
        <CreatorLogo />
        <div className="leading-none">
          <p className="font-bold text-xs text-foreground">{user?.name ?? "Creator"}</p>
          <p className="text-[10px] text-primary/80 tracking-wide uppercase">Creator Panel</p>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" onClick={() => setMobileOpen(false)} />
          <aside className="absolute top-14 left-0 bottom-0 w-64 bg-card border-r border-border flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <CreatorLogo />
                <div className="leading-none">
                  <p className="font-bold text-xs text-foreground tracking-wide">{user?.name ?? "Creator"}</p>
                  <p className="text-[10px] text-primary/80 tracking-wider uppercase">Creator Panel</p>
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
