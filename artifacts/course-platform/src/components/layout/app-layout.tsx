import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useBranding } from "@/lib/branding-context";
import { Button } from "@/components/ui/button";
import { useLogout, useListNotifications, getListNotificationsQueryKey, getGetMeQueryKey, useMarkNotificationRead, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Menu, X, BookOpen, Share2, GraduationCap, LogOut, ShieldCheck, ChevronRight, Mail, Youtube, Twitter, Linkedin, Instagram, CheckCheck, Sun, Moon, User } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmailVerificationBanner } from "@/components/email-verification-banner";

function AcademyLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="shineGrad" x1="0" y1="0" x2="40" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.15" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Background */}
      <rect width="40" height="40" rx="10" fill="url(#logoGrad)" />
      <rect width="40" height="40" rx="10" fill="url(#shineGrad)" />
      {/* Mortarboard cap top */}
      <polygon points="20,9 33,15.5 20,22 7,15.5" fill="white" opacity="0.97" />
      {/* Cap brim highlight */}
      <polygon points="20,9 33,15.5 20,16.5 7,15.5" fill="white" opacity="0.2" />
      {/* Gown / diploma scroll body */}
      <path d="M13 18.2v7.3c0 2 3.1 4.5 7 4.5s7-2.5 7-4.5v-7.3L20 21.5l-7-3.3z" fill="white" opacity="0.88" />
      {/* Tassel cord */}
      <line x1="33" y1="15.5" x2="33" y2="25" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
      {/* Tassel ball */}
      <circle cx="33" cy="26.5" r="2" fill="#93c5fd" />
      {/* Star spark top-left */}
      <circle cx="9" cy="10" r="1" fill="white" opacity="0.5" />
    </svg>
  );
}

/* ─── Notification Popup ─── */
function NotificationPopup({ iconSize = "w-4 h-4" }: { iconSize?: string }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { data: notifications } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), enabled: isAuthenticated } });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  const handleMarkRead = (id: number) => {
    markRead.mutate({ notificationId: id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
    });
  };
  const handleMarkAll = () => {
    markAll.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
    });
  };
  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };
  const typeStyle: Record<string, { dot: string; border: string }> = {
    success: { dot: "bg-green-400", border: "border-l-green-500" },
    info:    { dot: "bg-blue-400",  border: "border-l-blue-500"  },
    warning: { dot: "bg-amber-400", border: "border-l-amber-500" },
    error:   { dot: "bg-red-400",   border: "border-l-red-500"   },
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative w-9 h-9 p-0 rounded-lg hover:bg-white/5 cursor-pointer">
          <Bell className={`${iconSize} text-foreground/70`} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-primary text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8} className="w-[min(20rem,calc(100vw-16px))] border p-0 shadow-2xl" style={{ backgroundColor: "var(--dropdown-bg)", borderColor: "var(--dropdown-border)" }} sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] bg-primary/15 text-primary rounded-full px-1.5 py-0.5 font-bold">{unreadCount} new</span>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={handleMarkAll} className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 cursor-pointer">
              <CheckCheck className="w-3 h-3" />Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.05]">
          {!notifications || notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            notifications.slice(0, 8).map(n => {
              const ts = typeStyle[n.type] ?? typeStyle.info;
              return (
                <div
                  key={n.id}
                  onClick={() => { if (!n.isRead) handleMarkRead(n.id); }}
                  className={`flex gap-3 px-4 py-3 border-l-2 ${ts.border} transition-colors ${
                    n.isRead ? "opacity-55 cursor-default hover:opacity-75 hover:bg-white/[0.03]" : "bg-white/[0.025] cursor-pointer hover:bg-white/[0.05]"
                  }`}
                >
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${ts.dot} ${n.isRead ? "opacity-40" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-semibold leading-snug ${n.isRead ? "text-muted-foreground" : "text-foreground"}`}>{n.title}</p>
                      <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 mt-0.5">{timeAgo(String(n.createdAt))}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {notifications && notifications.length > 0 && (
          <div className="px-4 py-2.5 border-t border-white/10">
            <Link href="/notifications" className="text-xs text-primary hover:text-primary/80 transition-colors font-medium flex items-center justify-center gap-1">
              View all notifications <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Navbar() {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const branding = useBranding();
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        // Instantly clear auth state so UI updates immediately without a refresh
        queryClient.setQueryData(getGetMeQueryKey(), null);
        queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
        setMobileOpen(false);
        setLocation("/");
      },
      onError: () => {
        // Even on error, clear client-side auth state and redirect
        queryClient.setQueryData(getGetMeQueryKey(), null);
        queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
        setMobileOpen(false);
        setLocation("/");
      },
    });
  };

  const navLinks = [
    { href: "/courses", label: "Courses", icon: BookOpen },
    ...(isAuthenticated ? [
      { href: "/my-courses", label: "My Learning", icon: GraduationCap },
      { href: "/affiliate", label: "Affiliate", icon: Share2 },
    ] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  const linkClass = (href: string) =>
    `relative py-1 text-sm font-medium transition-colors hover:text-foreground after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:rounded-full after:bg-primary after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-200 ${
      location === href
        ? "text-foreground after:scale-x-100"
        : "text-foreground/60"
    }`;

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300 ${
        scrolled ? "shadow-[0_2px_20px_0_rgba(0,0,0,0.15)]" : ""
      }`} style={{ backgroundColor: "var(--nav-bg)" }}>
        <div className={`max-w-screen-xl mx-auto flex items-center px-4 md:px-8 gap-4 transition-all duration-300 ${scrolled ? "h-12" : "h-16"}`}>

          {/* ── Logo (left) ── */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group" onClick={() => setMobileOpen(false)}>
            <div className={`transition-all duration-300 flex-shrink-0 ${scrolled ? "scale-[0.85] origin-left" : "scale-100"}`}>
              {branding.siteLogo ? (
                <>
                  <img
                    src={branding.siteLogo}
                    alt={branding.siteName}
                    className="hidden md:block object-contain"
                    style={{ height: branding.logoSize, width: "auto", maxWidth: branding.logoSize * 4 }}
                  />
                  <img
                    src={branding.siteLogo}
                    alt={branding.siteName}
                    className="block md:hidden object-contain"
                    style={{ height: branding.logoSizeMobile, width: "auto", maxWidth: branding.logoSizeMobile * 4 }}
                  />
                </>
              ) : (
                <AcademyLogo size={34} />
              )}
            </div>
            {!branding.siteLogo && (
              <div className="leading-tight">
                <p className="font-extrabold text-sm tracking-wide text-foreground whitespace-nowrap leading-none">
                  VIPUL KUMAR
                </p>
                <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase leading-none mt-0.5">
                  ACADEMY
                </p>
              </div>
            )}
          </Link>

          {/* ── Center nav (desktop) ── */}
          <nav className="hidden md:flex items-center gap-7 flex-1 justify-end">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                {link.label}
              </Link>
            ))}
          </nav>

          {/* ── Right actions (desktop) ── */}
          <div className="hidden md:flex items-center gap-2 ml-auto flex-shrink-0">
            {!isAuthenticated ? (
              <>
                <Button variant="ghost" size="sm" asChild className="text-foreground/70 hover:text-foreground">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button size="sm" asChild className="bg-primary hover:bg-primary/90 text-white font-semibold px-4 rounded-lg">
                  <Link href="/register">Get Started</Link>
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <NotificationPopup iconSize="w-4 h-4" />
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 h-9 px-2 rounded-lg hover:bg-white/5 cursor-pointer">
                      <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden">
                        {(user as any)?.avatarUrl ? (
                          <img src={(user as any).avatarUrl} alt={user?.name ?? ""} className="w-full h-full object-cover" />
                        ) : (
                          user?.name?.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="hidden lg:block text-sm font-medium text-foreground/80">{user?.name?.split(" ")[0]}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 border" style={{ backgroundColor: "var(--dropdown-bg)", borderColor: "var(--dropdown-border)" }}>
                    <div className="px-3 py-2 border-b mb-1" style={{ borderColor: "var(--dropdown-border)" }}>
                      <p className="text-xs font-semibold text-foreground truncate">{user?.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                    <DropdownMenuItem asChild><Link href="/profile">My Profile</Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link href="/my-courses">My Learning</Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link href="/affiliate">Affiliate</Link></DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild><Link href="/admin">Admin Panel</Link></DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 mb-1">Preferences</p>
                      <button
                        onClick={toggleTheme}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-accent transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          {theme === "dark" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                          {theme === "dark" ? "Dark Mode" : "Light Mode"}
                        </span>
                        <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${theme === "dark" ? "bg-primary" : "bg-muted"}`}>
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${theme === "dark" ? "translate-x-3.5" : "translate-x-0.5"}`} />
                        </span>
                      </button>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-400 focus:text-red-400 focus:bg-red-500/10">
                      <LogOut className="w-3.5 h-3.5 mr-2" />Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* ── Mobile right controls ── */}
          <div className="flex md:hidden items-center gap-1 ml-auto">
            {isAuthenticated && <NotificationPopup iconSize="w-5 h-5" />}
            <Button
              variant="ghost"
              size="sm"
              className="w-9 h-9 p-0 rounded-lg hover:bg-white/5"
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* ── Mobile full-screen drawer ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <nav className="absolute top-16 left-0 right-0 border-b shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto" style={{ backgroundColor: "var(--mobile-drawer-bg)", borderColor: "var(--nav-border)" }}>
            {isAuthenticated && (
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-white overflow-hidden flex-shrink-0">
                  {(user as any)?.avatarUrl ? (
                    <img src={(user as any).avatarUrl} alt={user?.name ?? ""} className="w-full h-full object-cover" />
                  ) : (
                    user?.name?.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
            )}

            <div className="py-2">
              {navLinks.map(link => (
                <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
                  <div className={`flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors ${
                    location === link.href
                      ? "text-primary bg-primary/8 border-l-2 border-primary"
                      : "text-foreground/70 hover:text-foreground hover:bg-white/5"
                  }`}>
                    <link.icon className="w-4 h-4 flex-shrink-0" />
                    {link.label}
                    <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground/50" />
                  </div>
                </Link>
              ))}
            </div>

            {isAuthenticated && (
              <div className="border-t border-white/5 py-2">
                <Link href="/profile" onClick={() => setMobileOpen(false)}>
                  <div className={`flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors ${
                    location === "/profile"
                      ? "text-primary bg-primary/8 border-l-2 border-primary"
                      : "text-foreground/70 hover:text-foreground hover:bg-white/5"
                  }`}>
                    <User className="w-4 h-4 flex-shrink-0" />
                    My Profile
                    <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground/50" />
                  </div>
                </Link>
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
                >
                  {theme === "dark" ? <Moon className="w-4 h-4 flex-shrink-0" /> : <Sun className="w-4 h-4 flex-shrink-0" />}
                  {theme === "dark" ? "Dark Mode" : "Light Mode"}
                  <span className={`ml-auto relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${theme === "dark" ? "bg-primary" : "bg-muted"}`}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${theme === "dark" ? "translate-x-3.5" : "translate-x-0.5"}`} />
                  </span>
                </button>
              </div>
            )}

            <div className="px-4 py-4 border-t border-white/5 space-y-2">
              {!isAuthenticated ? (
                <>
                  <Button className="w-full bg-primary hover:bg-primary/90 font-semibold" asChild onClick={() => setMobileOpen(false)}>
                    <Link href="/register">Get Started Free</Link>
                  </Button>
                  <Button variant="outline" className="w-full border-white/10 hover:bg-white/5" asChild onClick={() => setMobileOpen(false)}>
                    <Link href="/login">Log In</Link>
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 justify-center"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />Sign Out
                </Button>
              )}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const branding = useBranding();

  const footerNav = {
    platform: [
      { label: "Browse Courses", href: "/courses" },
      { label: "My Learning", href: "/my-courses" },
      { label: "Affiliate Program", href: "/affiliate" },
    ],
    company: [
      { label: "About Us", href: "/about-us" },
      { label: "Careers", href: "/careers" },
      { label: "Contact Us", href: "/contact-us" },
      { label: "Help Center", href: "/help-center" },
    ],
    legal: [
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Service", href: "/terms-of-service" },
      { label: "Cookie Policy", href: "/cookie-policy" },
      { label: "Refund Policy", href: "/refund-policy" },
    ],
  };

  const social = [
    { icon: Youtube, label: "YouTube", href: "#", color: "hover:text-red-400" },
    { icon: Twitter, label: "Twitter / X", href: "#", color: "hover:text-sky-400" },
    { icon: Linkedin, label: "LinkedIn", href: "#", color: "hover:text-blue-400" },
    { icon: Instagram, label: "Instagram", href: "#", color: "hover:text-pink-400" },
    { icon: Mail, label: "Email", href: "mailto:support@vipulkumaracademy.com", color: "hover:text-primary" },
  ];

  return (
    <footer className="border-t" style={{ backgroundColor: "var(--footer-bg)", borderColor: "var(--nav-border)" }}>
      {/* ── Main grid ── */}
      <div className="max-w-screen-xl mx-auto px-4 md:px-8 pt-14 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">

          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-4 group">
              {branding.siteLogo ? (
                <img
                  src={branding.siteLogo}
                  alt={branding.siteName}
                  className="object-contain"
                  style={{ height: branding.logoSize, width: "auto", maxWidth: branding.logoSize * 4 }}
                />
              ) : (
                <>
                  <AcademyLogo size={36} />
                  <div className="leading-tight">
                    <p className="font-extrabold text-sm tracking-wide text-foreground whitespace-nowrap leading-none">VIPUL KUMAR</p>
                    <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase leading-none mt-0.5">ACADEMY</p>
                  </div>
                </>
              )}
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mb-5">
              Premium online education platform for aspiring entrepreneurs. Master affiliate marketing, e-commerce, and dropshipping — built by operators.
            </p>
            {/* Social links */}
            <div className="flex items-center gap-2">
              {social.map(({ icon: Icon, label, href, color }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center text-muted-foreground transition-all hover:text-foreground ${color}`} style={{ backgroundColor: "var(--elevate-1)", borderColor: "var(--button-outline)" }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Platform</h4>
            <ul className="space-y-2.5">
              {footerNav.platform.map(item => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Company</h4>
            <ul className="space-y-2.5">
              {footerNav.company.map(item => (
                <li key={item.label}>
                  <Link href={item.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Legal</h4>
            <ul className="space-y-2.5">
              {footerNav.legal.map(item => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            {/* Trust badge */}
            <div className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <svg className="w-3.5 h-3.5 text-green-500/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              SSL Secured &amp; GDPR Compliant
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-white/[0.05]" />

      {/* ── Bottom bar ── */}
      <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Copyright */}
          <p className="text-xs text-muted-foreground/60 text-center sm:text-left">
            &copy; {year} {branding.siteName}. All rights reserved.
          </p>

          {/* Legal quick links */}
          <div className="flex items-center gap-4 flex-wrap justify-center">
            {footerNav.legal.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

export function AppLayout({ children, noFooter }: { children: React.ReactNode; noFooter?: boolean }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Navbar />
      <div className="pt-16">
        <EmailVerificationBanner />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      {!noFooter && <SiteFooter />}
    </div>
  );
}
