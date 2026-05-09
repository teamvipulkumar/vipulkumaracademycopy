import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useBranding, useThemedLogo } from "@/lib/branding-context";
import { Button } from "@/components/ui/button";
import { useLogout, useListNotifications, getListNotificationsQueryKey, getGetMeQueryKey, useMarkNotificationRead, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Menu, X, Home, BookOpen, Share2, GraduationCap, LogOut, ShieldCheck, ChevronRight, Mail, Youtube, Twitter, Linkedin, Instagram, CheckCheck, Sun, Moon, User, Sparkles } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmailVerificationBanner } from "@/components/email-verification-banner";

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
      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        sideOffset={14}
        // The `notification-popup-mobile` marker class is paired with a
        // `@media (max-width: 767px)` rule in `index.css` that overrides
        // the Radix popper wrapper's transform to viewport-centre the
        // panel on phones (the bell isn't the right-most element on
        // mobile, so the default `align="end"` skews the panel leftward).
        // Desktop (md+) is completely untouched — the marker class only
        // matches inside the mobile media query.
        className="notification-popup-mobile w-[min(20rem,calc(100vw-32px))] border p-0 shadow-2xl"
        style={{ backgroundColor: "var(--dropdown-bg)", borderColor: "var(--dropdown-border)" }}
      >
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
  const { user, isAuthenticated, isAdmin, isStaff, isCreator } = useAuth();
  // Staff/team members and full admins both have access to the admin
  // panel (gated per-permission inside). Show the same nav entry for
  // both so staff aren't forced to type the URL manually.
  const hasAdminAccess = isAdmin || isStaff;
  // Creators get a dedicated "Creator" nav entry pointing at /creator
  // so they don't have to type the URL manually after logging in.
  const showCreatorNav = isCreator === true;
  // Staff users see "Staff Panel" pointing at `/staff`; full admins see
  // "Admin" pointing at `/admin`. Same component renders for both URL
  // prefixes — only the label/href change so a team member's URL bar
  // never says "/admin" (which would mislead them into thinking they
  // own the site).
  const adminNavLabel = isStaff ? "Staff Panel" : "Admin";
  const adminNavHref = isStaff ? "/staff" : "/admin";
  const { theme, toggleTheme } = useTheme();
  const branding = useBranding();
  const themedLogo = useThemedLogo();
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

  // Lock body scroll while the mobile drawer is open so the page behind
  // the overlay doesn't scroll under the user's finger. Restores the
  // previous overflow value on close/unmount to play nice with any other
  // component that might also manage body overflow.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

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
    { href: "/", label: "Home", icon: Home },
    { href: "/courses", label: "Courses", icon: BookOpen },
    ...(isAuthenticated ? [
      { href: "/my-courses", label: "My Learning", icon: GraduationCap },
      { href: "/affiliate", label: "Affiliate", icon: Share2 },
    ] : []),
    ...(showCreatorNav ? [{ href: "/creator", label: "Creator", icon: Sparkles }] : []),
    ...(hasAdminAccess ? [{ href: adminNavHref, label: adminNavLabel, icon: ShieldCheck }] : []),
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
        {/* Header height is fixed (no on-scroll shrink). h-16 = 64px gives
            comfortable top/bottom breathing room around the logo and nav.
            Only the subtle shadow toggles on scroll. */}
        <div className="max-w-screen-xl mx-auto flex items-center px-4 md:px-8 gap-4 h-[60px]">

          {/* ── Logo (left) ── */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group" onClick={() => setMobileOpen(false)}>
            {/* Logo intentionally stays at full scale even when the sticky
                header shrinks — user prefers a consistent brand size and
                explicitly disabled the scroll-shrink behaviour. */}
            <div className="flex-shrink-0 text-foreground">
              {themedLogo ? (
                <>
                  <img
                    src={themedLogo}
                    alt={branding.siteName}
                    className="hidden md:block object-contain"
                    style={{ height: branding.logoSize, width: "auto", maxWidth: branding.logoSize * 4 }}
                  />
                  <img
                    src={themedLogo}
                    alt={branding.siteName}
                    className="block md:hidden object-contain"
                    style={{ height: branding.logoSizeMobile, width: "auto", maxWidth: branding.logoSizeMobile * 4 }}
                  />
                </>
              ) : branding.siteName ? (
                // No admin-uploaded logo — render the site name as a wordmark.
                // We deliberately don't fall back to the built-in default
                // logo so a fresh tenant shows nothing until they brand it.
                <span className="text-lg md:text-xl font-extrabold tracking-tight whitespace-nowrap">
                  {branding.siteName}
                </span>
              ) : null}
            </div>
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
                    {showCreatorNav && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild><Link href="/creator"><Sparkles className="w-3.5 h-3.5 mr-2 text-emerald-400" />Creator Dashboard</Link></DropdownMenuItem>
                      </>
                    )}
                    {hasAdminAccess && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild><Link href={adminNavHref}>{isStaff ? "Staff Panel" : "Admin Panel"}</Link></DropdownMenuItem>
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

      {/* ── Mobile right-side drawer ──
          Slides in from the RIGHT (native iOS/Android pattern when the menu
          trigger sits on the right of the header). Uses an animated overlay
          + translate transform so opening/closing feels native rather than
          the previous abrupt top-down dropdown. The drawer is its own
          scrollable column so long menus never push the close/CTA controls
          off-screen on small phones. */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        {/* Backdrop — fades in/out with the drawer for a smooth feel. */}
        <div
          className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        {/* Drawer panel — anchored to the right edge, slides in via
            translate-x. Width caps at 320px so it never feels cramped on
            tiny phones nor oversized on phablets. */}
        <aside
          className={`absolute top-0 right-0 h-full w-[85vw] max-w-[320px] flex flex-col shadow-2xl transition-transform duration-300 ease-out border-l ${
            mobileOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ backgroundColor: "var(--mobile-drawer-bg)", borderColor: "var(--nav-border)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
        >
          {/* Drawer header — brand on the left, close button on the right.
              Mirrors the layout of the main app header so the user has a
              consistent anchor while the menu is open. */}
          <div
            className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0"
            style={{ borderColor: "var(--nav-border)" }}
          >
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground/80">
              Menu
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="w-9 h-9 p-0 rounded-lg hover:bg-white/5"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Scrollable content area — clean SaaS drawer layout:
              - User chip in a subtle elevated card (Linear / Notion pattern)
              - Section headers in tiny uppercase tracking
              - Nav rows are rounded pills with hover/active states; no
                trailing chevrons (felt like a list-of-folders, not a nav)
              - Icons sit in slightly-tinted square tiles for visual rhythm. */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-5">
            {isAuthenticated && (
              <div
                className="flex items-center gap-3 p-3 rounded-xl border"
                style={{ backgroundColor: "var(--elevate-1)", borderColor: "var(--button-outline)" }}
              >
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-white overflow-hidden flex-shrink-0 ring-2 ring-primary/20">
                  {(user as any)?.avatarUrl ? (
                    <img src={(user as any).avatarUrl} alt={user?.name ?? ""} className="w-full h-full object-cover" />
                  ) : (
                    user?.name?.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-foreground truncate leading-tight">{user?.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user?.email}</p>
                </div>
              </div>
            )}

            <div>
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                Navigate
              </p>
              <div className="space-y-0.5">
                {navLinks.map(link => {
                  const active = location === link.href;
                  return (
                    <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
                      <div className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-foreground/80 hover:bg-white/5 active:bg-white/10"
                      }`}>
                        <span className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                          active ? "bg-primary/15 text-primary" : "bg-white/5 text-foreground/70"
                        }`}>
                          <link.icon className="w-[15px] h-[15px]" />
                        </span>
                        <span className="flex-1 truncate">{link.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {isAuthenticated && (
              <div>
                <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                  Account
                </p>
                <div className="space-y-0.5">
                  <Link href="/profile" onClick={() => setMobileOpen(false)}>
                    <div className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                      location === "/profile"
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/80 hover:bg-white/5 active:bg-white/10"
                    }`}>
                      <span className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                        location === "/profile" ? "bg-primary/15 text-primary" : "bg-white/5 text-foreground/70"
                      }`}>
                        <User className="w-[15px] h-[15px]" />
                      </span>
                      <span className="flex-1 truncate">My Profile</span>
                    </div>
                  </Link>
                  <button
                    onClick={toggleTheme}
                    className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-[14px] font-medium text-foreground/80 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                  >
                    <span className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 bg-white/5 text-foreground/70">
                      {theme === "dark" ? <Moon className="w-[15px] h-[15px]" /> : <Sun className="w-[15px] h-[15px]" />}
                    </span>
                    <span className="flex-1 text-left truncate">{theme === "dark" ? "Dark Mode" : "Light Mode"}</span>
                    <span className={`relative inline-flex h-[18px] w-8 items-center rounded-full transition-colors flex-shrink-0 ${theme === "dark" ? "bg-primary" : "bg-muted"}`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${theme === "dark" ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pinned CTA footer — always visible without scrolling. */}
          <div className="px-4 py-4 space-y-2 flex-shrink-0">
            {!isAuthenticated ? (
              <>
                <Button className="w-full h-11 bg-primary hover:bg-primary/90 font-semibold" asChild onClick={() => setMobileOpen(false)}>
                  <Link href="/register">Get Started Free</Link>
                </Button>
                <Button variant="outline" className="w-full h-11 border-white/10 hover:bg-white/5" asChild onClick={() => setMobileOpen(false)}>
                  <Link href="/login">Log In</Link>
                </Button>
              </>
            ) : (
              // Permanent red-tinted background — touch devices have no hover
              // state, so the destructive intent must be visible at rest.
              // Border + bg are always-on; hover just deepens them.
              <Button
                variant="ghost"
                className="w-full h-11 text-red-400 bg-red-500/10 border border-red-500/20 hover:text-red-300 hover:bg-red-500/15 hover:border-red-500/30 active:bg-red-500/20 flex items-center gap-2 justify-center font-semibold"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />Sign Out
              </Button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const branding = useBranding();
  const themedLogo = useThemedLogo();

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
              {themedLogo ? (
                <img
                  src={themedLogo}
                  alt={branding.siteName}
                  className="object-contain"
                  style={{ height: branding.logoSize, width: "auto", maxWidth: branding.logoSize * 4 }}
                />
              ) : branding.siteName ? (
                <span className="text-xl font-extrabold tracking-tight text-foreground whitespace-nowrap">
                  {branding.siteName}
                </span>
              ) : null}
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
      {/* `pt-[60px]` matches the fixed Navbar height (60px) so the page
          content sits flush below the header with no visible gap. */}
      <div className="pt-[60px]">
        <EmailVerificationBanner />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      {!noFooter && <SiteFooter />}
    </div>
  );
}
