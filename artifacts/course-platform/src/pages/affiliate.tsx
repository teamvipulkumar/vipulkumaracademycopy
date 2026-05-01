import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import WelcomeOnboarding from "@/components/affiliate/WelcomeOnboarding";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line,
} from "recharts";
import {
  BadgeIndianRupee, Users, MousePointerClick, Copy, Check, TrendingUp,
  Clock, CheckCircle2, XCircle, AlertCircle, Link2, Image, FileText,
  ShieldCheck, Wallet, Zap, Building2, RefreshCw, Download, Plus,
  Trash2, Eye, EyeOff, Send, ChevronRight, ChevronLeft, ChevronDown, Activity, Target,
  Calendar, Star, Lock, Loader2, Menu, X, ExternalLink, Share2,
  ArrowUpRight, TrendingDown, Banknote, Info, Percent, Cookie,
  Upload, FileImage, Rocket
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...opts });
  return res;
}

type Tab = "earnings" | "sales" | "links" | "clicks" | "creatives" | "kyc" | "payouts" | "pixel" | "bank";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "earnings",   label: "Dashboard",      icon: <BadgeIndianRupee className="w-4 h-4" /> },
  { id: "sales",      label: "Sales Report",   icon: <FileText className="w-4 h-4" /> },
  { id: "links",      label: "Affiliate Links", icon: <Link2 className="w-4 h-4" /> },
  { id: "clicks",     label: "Clicks",         icon: <MousePointerClick className="w-4 h-4" /> },
  { id: "creatives",  label: "Creatives",      icon: <Image className="w-4 h-4" /> },
  { id: "kyc",        label: "KYC",            icon: <ShieldCheck className="w-4 h-4" /> },
  { id: "payouts",    label: "Payouts",        icon: <Wallet className="w-4 h-4" /> },
  { id: "pixel",      label: "Pixel",          icon: <Zap className="w-4 h-4" /> },
  { id: "bank",       label: "Bank",           icon: <Building2 className="w-4 h-4" /> },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:  "text-amber-400 border-amber-400/30 bg-amber-400/10",
    approved: "text-green-400 border-green-400/30 bg-green-400/10",
    rejected: "text-red-400 border-red-400/30 bg-red-400/10",
  };
  const icons: Record<string, React.ReactNode> = {
    pending: <Clock className="w-3 h-3" />,
    approved: <CheckCircle2 className="w-3 h-3" />,
    rejected: <XCircle className="w-3 h-3" />,
  };
  return (
    <Badge className={`text-xs gap-1 capitalize ${map[status] ?? ""}`}>
      {icons[status]}{status}
    </Badge>
  );
}

/* ─── Apply Form ─── */
function ApplyForm({ user, onSubmitted }: { user: any; onSubmitted: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ fullName: user?.name ?? "", email: user?.email ?? "", promoteDescription: "" });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!agreed) { toast({ title: "Please agree to the terms", variant: "destructive" }); return; }
    if (!form.promoteDescription.trim()) { toast({ title: "Please describe how you'll promote", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await apiFetch("/api/affiliate/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast({ title: "Application submitted!", description: "We'll review your application soon." });
      onSubmitted();
    } catch (e: any) {
      toast({ title: "Failed to submit", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Star className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">Become an Affiliate</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Earn commissions by promoting our courses. Fill in your details and our team will review your application.
          </p>
        </div>

        {/* Perks */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon: <BadgeIndianRupee className="w-4 h-4 text-green-400" />, label: "Up to 30%", sub: "Commission" },
            { icon: <Activity className="w-4 h-4 text-blue-400" />, label: "Real-time", sub: "Analytics" },
            { icon: <Wallet className="w-4 h-4 text-amber-400" />, label: "Fast", sub: "Payouts" },
          ].map(p => (
            <div key={p.label} className="bg-card border border-border rounded-xl p-3 text-center">
              <div className="flex justify-center mb-1">{p.icon}</div>
              <p className="text-sm font-bold text-foreground">{p.label}</p>
              <p className="text-[10px] text-muted-foreground">{p.sub}</p>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} className="bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={form.email} readOnly className="bg-background border-border opacity-70" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">How will you promote our courses?</Label>
            <Textarea
              placeholder="Describe your audience, channels (YouTube, blog, Instagram, etc.), and how you plan to promote..."
              value={form.promoteDescription}
              onChange={e => setForm(f => ({ ...f, promoteDescription: e.target.value }))}
              rows={4}
              className="bg-background border-border resize-none"
            />
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 accent-primary w-4 h-4"
            />
            <span className="text-xs text-muted-foreground leading-relaxed">
              I agree to the <span className="text-primary underline cursor-pointer">Affiliate Terms & Conditions</span>, including promoting ethically and not engaging in fraudulent activity.
            </span>
          </label>
          <Button onClick={handleSubmit} disabled={loading} className="w-full bg-primary hover:bg-primary/90 gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? "Submitting…" : "Submit Application"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Status Views ─── */
function PendingView() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Application Under Review</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Your affiliate application has been submitted and is being reviewed by our team. We'll notify you via email once a decision is made.
        </p>
        <Badge className="text-sm gap-1 text-amber-400 border-amber-400/30 bg-amber-400/10 px-3 py-1">
          <Clock className="w-3.5 h-3.5" />Pending Review
        </Badge>
      </div>
    </div>
  );
}

function RejectedView({ note, onReapply }: { note?: string | null; onReapply: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Application Rejected</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Unfortunately your application was not approved at this time.
        </p>
        {note && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-left mb-4">
            <p className="text-xs font-semibold text-red-400 mb-1">Reason from admin:</p>
            <p className="text-sm text-muted-foreground">{note}</p>
          </div>
        )}
        <Button onClick={onReapply} className="w-full gap-2 mb-3">
          <Send className="w-4 h-4" />
          Resubmit Application
        </Button>
        <p className="text-xs text-muted-foreground">Contact support if you believe this is a mistake.</p>
      </div>
    </div>
  );
}

/* ─── Reusable page section header ─── */
function TabHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ─── Stat card ─── */
function StatCard2({ label, value, color, sub }: { icon?: React.ReactNode; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center gap-1">
      <p className="text-muted-foreground text-[14px] font-semibold">{label}</p>
      <p className="text-[#05df72] text-[24px] font-bold">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

/* ─── Paginator ─── */
const PAGE_SIZE = 10;
function Paginator({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background/30">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}–{to}</span> of <span className="font-medium text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-white/5 cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />Prev
        </button>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p =>
            p === 1 || p === totalPages || Math.abs(p - page) <= 1
          ).reduce<(number | "…")[]>((acc, p, idx, arr) => {
            if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
            acc.push(p);
            return acc;
          }, []).map((p, i) =>
            p === "…"
              ? <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
              : <button
                  key={p}
                  onClick={() => onPage(p as number)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    page === p
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >{p}</button>
          )}
        </div>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-white/5 cursor-pointer"
        >
          Next<ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── Custom earnings bar shape: real bar for non-zero, ghost stub for zero ─── */
const EarningsBarShape = (props: any) => {
  const { x, y, width, height, value, fill, style } = props;
  const w = Math.max(width ?? 20, 1);
  if (!value || value === 0) {
    const ghostFill = fill && fill !== "#2563eb" ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.1)";
    return <rect x={x} y={y} width={w} height={3} fill={ghostFill} rx={2} ry={2} />;
  }
  return <rect x={x} y={y} width={w} height={height} fill={fill ?? "#2563eb"} rx={4} ry={4} style={style} />;
};

/* ─── Full Dashboard ─── */
function AffiliateDashboard({ user }: { user: any }) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  // Theme-aware Recharts tooltip styling — defaults are dark, so in light
  // mode we flip to a white surface with darker text and borders. Reused by
  // both the earnings and clicks charts.
  const tooltipContentStyle = {
    background: isLight ? "#ffffff" : "#0d1424",
    border: `1px solid ${isLight ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.1)"}`,
    borderRadius: 8,
    fontSize: 12,
    boxShadow: isLight ? "0 4px 12px rgba(0,0,0,0.08)" : "0 4px 12px rgba(0,0,0,0.4)",
  };
  const tooltipLabelStyle = { color: isLight ? "#0f172a" : "#f8fafc", fontWeight: 600 };
  const tooltipItemStyle = { color: isLight ? "#334155" : "#cbd5e1" };
  const tooltipCursorFill = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.03)";
  const chartGridStroke = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.05)";
  // Persist the active tab across page refreshes. Without this, every
  // refresh would dump the user back on the Dashboard tab even if they were
  // looking at KYC, Pixel, Bank, etc.
  const VALID_TABS: Tab[] = ["earnings", "sales", "links", "clicks", "creatives", "kyc", "payouts", "pixel", "bank"];
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem("vka-affiliate-tab");
      if (saved && VALID_TABS.includes(saved as Tab)) return saved as Tab;
    } catch {}
    return "earnings";
  });
  useEffect(() => {
    try { localStorage.setItem("vka-affiliate-tab", tab); } catch {}
  }, [tab]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [clicks, setClicks] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [upcomingPayout, setUpcomingPayout] = useState<any>(null);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [kyc, setKyc] = useState<any>(null);
  const [bank, setBank] = useState<any>(null);
  const [pixel, setPixel] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [chartDays, setChartDays] = useState<7 | 30>(7);
  const [salesPage, setSalesPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [tourActive, setTourActive] = useState(false);
  const [tourSidebarOpen, setTourSidebarOpen] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  // Manual "Replay tour" trigger. When true we mount a fresh WelcomeOnboarding
  // in skipWelcomeModal mode, so any user (including admins who have no
  // first-time popup) can re-watch the interactive walkthrough on demand.
  const [replayingTour, setReplayingTour] = useState(false);
  // Sticky flag: decided ONCE from the first successful dashboard load. We don't
  // want background polling refreshes (every 45s) to unmount the modal/tour
  // mid-flow once the auto-stamp has set welcomedAt server-side.
  const [showWelcomeForSession, setShowWelcomeForSession] = useState<boolean | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    setRefreshing(true);
    const [d, c, s, p, up, cr, k, b, px] = await Promise.all([
      apiFetch("/api/affiliate/dashboard").then(r => r.json()),
      apiFetch("/api/affiliate/clicks").then(r => r.json()),
      apiFetch("/api/affiliate/sales").then(r => r.json()),
      apiFetch("/api/affiliate/payouts").then(r => r.json()),
      apiFetch("/api/affiliate/upcoming-payout").then(r => r.ok ? r.json() : null),
      apiFetch("/api/affiliate/creatives").then(r => r.json()),
      apiFetch("/api/affiliate/kyc").then(r => r.ok ? r.json() : null),
      apiFetch("/api/affiliate/bank").then(r => r.ok ? r.json() : null),
      apiFetch("/api/affiliate/pixel").then(r => r.ok ? r.json() : null),
    ]);
    setDashboard(d); setClicks(c); setSales(Array.isArray(s) ? s : []);
    setPayouts(Array.isArray(p) ? p : []);
    setUpcomingPayout(up);
    setCreatives(Array.isArray(cr) ? cr : []); setKyc(k); setBank(b); setPixel(px);
    // Decide once on the FIRST dashboard load whether to show the welcome onboarding.
    // Subsequent polling refreshes won't flip this back to false even after the
    // server stamps welcomedAt, so the modal/tour stays mounted until the user dismisses it.
    setShowWelcomeForSession((prev) => prev === null ? !d?.welcomedAt : prev);
    setLoading(false);
    setRefreshing(false);
  };

  const copyLink = () => {
    if (dashboard?.referralLink) {
      navigator.clipboard.writeText(dashboard.referralLink);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  const navClick = (id: Tab) => { setTab(id); setSidebarOpen(false); if (id === "sales") setSalesPage(1); };

  const SidebarContent = () => (
    <>
      <nav className="flex-1 pt-2 pb-3 overflow-y-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            data-tour={`nav-${t.id === "earnings" ? "earnings" : t.id}`}
            onClick={() => navClick(t.id)}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-all text-left cursor-pointer ${
              tab === t.id
                ? "bg-primary/10 text-primary border-r-2 border-r-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-border space-y-1">
        <div className="flex items-center gap-2 px-2 py-1 mb-1">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        {/* Tab-style action buttons — same hover treatment as the main nav
            tabs above so they feel interactive and grouped with the rest of
            the sidebar navigation. */}
        <button
          onClick={() => {
            setSidebarOpen(false);
            setReplayingTour(true);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all text-left cursor-pointer"
        >
          <Rocket className="w-4 h-4" />Replay tour
        </button>
        <Link href="/">
          <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all text-left cursor-pointer">
            <ChevronRight className="w-4 h-4 rotate-180" />Back to Site
          </button>
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed top-16 inset-x-0 bottom-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      {/* Sidebar — fixed on desktop, slide-over on mobile (force-open during tour) */}
      <aside className={`
        fixed lg:sticky top-16 h-[calc(100vh-4rem)] z-50 lg:z-auto
        w-56 flex-shrink-0 bg-card border-r border-border flex flex-col overflow-hidden
        transition-transform duration-200
        ${sidebarOpen || tourSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <SidebarContent />
      </aside>
      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-4 sm:px-6 py-6">
          {/* Mobile: inline breadcrumb row (no second header) */}
          <div className="lg:hidden flex items-center gap-2 mb-5">
            <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0 cursor-pointer">
              <Menu className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground">Affiliate</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs font-medium text-foreground capitalize">{TABS.find(t => t.id === tab)?.label}</span>
          </div>

          {/* ── Loading skeleton ── shown for ANY tab during initial fetch
              so users don't briefly see stale/empty data (e.g. "0 sales",
              empty KYC form) before the real data hydrates. */}
          {loading && (
            <div className="space-y-6 animate-pulse">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-7 w-48 bg-white/[0.06] rounded-lg" />
                  <div className="h-4 w-64 bg-white/[0.04] rounded-lg" />
                </div>
                <div className="h-8 w-24 bg-white/[0.06] rounded-lg flex-shrink-0" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="h-3.5 w-16 bg-white/[0.06] rounded" />
                      <div className="h-8 w-8 bg-white/[0.06] rounded-xl" />
                    </div>
                    <div className="h-7 w-24 bg-white/[0.06] rounded-lg" />
                  </div>
                ))}
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-28 bg-white/[0.06] rounded" />
                  <div className="h-7 w-20 bg-white/[0.06] rounded-lg" />
                </div>
                <div className="h-[200px] bg-white/[0.03] rounded-xl" />
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-border">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="text-center px-3 py-5 space-y-2 flex flex-col items-center">
                      <div className="h-5 w-20 bg-white/[0.06] rounded" />
                      <div className="h-3 w-16 bg-white/[0.04] rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "earnings" && !loading && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2
                    className="text-[26px] sm:text-[32px] leading-tight font-extrabold tracking-tight flex items-center flex-wrap gap-x-2"
                    style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.02em" }}
                  >
                    {/* Gradient text — explicit inline styles so it works
                        reliably in both light and dark modes. Tailwind's
                        bg-clip utilities sometimes get hijacked by light-mode
                        global overrides, so we set everything by hand here. */}
                    <span
                      style={{
                        backgroundImage: "linear-gradient(90deg, #2563eb 0%, #7c3aed 50%, #db2777 100%)",
                        backgroundClip: "text",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        color: "transparent",
                      }}
                    >
                      Hello, {user?.name?.split(" ")[0] ?? "there"}
                    </span>
                    {/* Emoji is a SIBLING of the gradient span (not a child)
                        so the parent h2's normal text color applies and the
                        emoji renders in its native colors. */}
                    <span className="wave-emoji" aria-hidden="true">👋</span>
                  </h2>
                  <p
                    className="text-[13px] sm:text-sm text-muted-foreground mt-1.5 font-medium"
                    style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "0.005em" }}
                  >
                    Welcome back to your affiliate dashboard.
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={loadDashboard} disabled={refreshing}>
                  <RefreshCw className={`w-3.5 h-3.5 transition-transform ${refreshing ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
                </Button>
              </div>

              {/* Overview stats */}
              <div data-tour="earnings-stats" className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                {[
                  { label: "Today", value: `₹${(dashboard?.todayEarnings ?? 0).toLocaleString("en-IN")}`, icon: <BadgeIndianRupee className="w-4 h-4 text-green-400" />, color: "text-green-400" },
                  { label: "Yesterday", value: `₹${(dashboard?.yesterdayEarnings ?? 0).toLocaleString("en-IN")}`, icon: <Calendar className="w-4 h-4 text-blue-400" />, color: "text-blue-400" },
                  { label: "Last 7 Days", value: `₹${(dashboard?.last7Earnings ?? 0).toLocaleString("en-IN")}`, icon: <TrendingUp className="w-4 h-4 text-purple-400" />, color: "text-purple-400" },
                  { label: "Last 30 Days", value: `₹${(dashboard?.last30Earnings ?? 0).toLocaleString("en-IN")}`, icon: <Activity className="w-4 h-4 text-amber-400" />, color: "text-amber-400" },
                ].map(s => <StatCard2 key={s.label} {...s} />)}
              </div>

              {/* Daily chart */}
              <div data-tour="earnings-chart" className="bg-card border border-border rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Daily Earnings</h3>
                  <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
                    {([7, 30] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => setChartDays(d)}
                        className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                          chartDays === d
                            ? "bg-primary text-white"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={chartDays === 30 && isDesktop ? 240 : 200}>
                  <ComposedChart
                    data={(dashboard?.dailyChart ?? []).slice(-chartDays)}
                    margin={{ top: 5, right: 5, bottom: chartDays === 30 && isDesktop ? 40 : 5, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="earningsLineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.9} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      tickFormatter={v => `${v.substring(8)}-${v.substring(5, 7)}`}
                      interval={chartDays === 7 ? 0 : isDesktop ? 0 : 3}
                      angle={chartDays === 30 && isDesktop ? -45 : 0}
                      textAnchor={chartDays === 30 && isDesktop ? "end" : "middle"}
                      height={chartDays === 30 && isDesktop ? 50 : 30}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={v => `₹${v}`} width={50} />
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                      formatter={(v: any, name: string) => [`₹${Number(v).toFixed(2)}`, name === "amount" ? "Earnings" : "Trend"]}
                      labelFormatter={(v: string) => `${v.substring(8)}-${v.substring(5, 7)}-${v.substring(0, 4)}`}
                      cursor={{ fill: tooltipCursorFill }}
                    />
                    <Bar dataKey="amount" fill="#2563eb" name="amount" maxBarSize={40}
                      shape={<EarningsBarShape />}
                      activeBar={<EarningsBarShape fill="#3b82f6" style={{ filter: "drop-shadow(0 0 6px rgba(59,130,246,0.7))" }} />} />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      name="Trend"
                      stroke="url(#earningsLineGrad)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "#a78bfa", stroke: "#1e1b4b", strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Summary strip */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-border">
                  {[
                    { label: "Total Earned", value: `₹${(dashboard?.totalEarnings ?? 0).toLocaleString("en-IN")}`, color: "text-foreground" },
                    { label: "Pending Payout", value: `₹${(dashboard?.pendingEarnings ?? 0).toLocaleString("en-IN")}`, color: "text-amber-400" },
                    { label: "Total Paid", value: `₹${(dashboard?.paidEarnings ?? 0).toLocaleString("en-IN")}`, color: "text-green-400" },
                  ].map(s => (
                    <div key={s.label} className="text-center px-3 py-4">
                      <p className="text-[11px] text-muted-foreground mb-1">{s.label}</p>
                      <p className={`text-base sm:text-lg font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Account info strip */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-border">
                  <div className="text-center px-3 py-4">
                    <p className="text-[11px] text-muted-foreground mb-1">Commission</p>
                    <p className="text-base sm:text-lg font-bold text-blue-400">{dashboard?.commissionRate ?? "–"}%</p>
                  </div>
                  <div className="text-center px-3 py-4">
                    <p className="text-[11px] text-muted-foreground mb-1">Cookie Duration</p>
                    <p className="text-base sm:text-lg font-bold text-purple-400">{dashboard?.cookieDays ?? 30} Days</p>
                  </div>
                  <div className="text-center px-3 py-4">
                    <p className="text-[11px] text-muted-foreground mb-1">Account Health</p>
                    <p className="text-base sm:text-lg font-bold text-green-400">Healthy</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Sales Tab ── */}
          {tab === "sales" && !loading && (() => {
            const pagedSales = sales.slice((salesPage - 1) * PAGE_SIZE, salesPage * PAGE_SIZE);
            return (
              <div className="space-y-5">
                <TabHeader title="My Sales" subtitle="All successful purchases made through your referral link." />

                {/* Summary row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <p className="text-xl font-bold text-foreground">{sales.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total Sales</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 text-center transition-colors hover:border-blue-500/40 hover:bg-blue-500/5 cursor-default">
                    <p className="text-xl font-bold text-blue-400">₹{sales.reduce((s, r) => s + (r.saleAmount ?? 0), 0).toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total Revenue</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <p className="text-xl font-bold text-green-400">₹{sales.reduce((s, r) => s + r.commission, 0).toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total Commission</p>
                  </div>
                </div>

                {/* Sales table */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  {sales.length === 0 ? (
                    <div className="py-20 text-center">
                      <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-semibold text-foreground mb-1">No sales yet</p>
                      <p className="text-sm text-muted-foreground">Share your affiliate link to start earning commissions.</p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-background/50">
                              <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3">#</th>
                              <th className="text-xs font-semibold text-muted-foreground px-5 py-3 text-left">Commission</th>
                              <th className="text-xs font-semibold text-muted-foreground px-5 py-3 text-left">Sale Amount</th>
                              <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3">Date & Time</th>
                              <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3">Course</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {pagedSales.map((sale, i) => {
                              const dt = new Date(sale.createdAt);
                              const globalIdx = (salesPage - 1) * PAGE_SIZE + i + 1;
                              return (
                                <tr key={sale.id}>
                                  <td className="px-5 py-3.5 text-xs text-muted-foreground">{globalIdx}</td>
                                  <td className="px-5 py-3.5 text-left">
                                    <span className="font-bold text-green-400">₹{sale.commission.toLocaleString("en-IN")}</span>
                                  </td>
                                  <td className="px-5 py-3.5 text-left">
                                    {sale.saleAmount != null
                                      ? <span className="font-semibold text-foreground">₹{Number(sale.saleAmount).toLocaleString("en-IN")}</span>
                                      : <span className="text-muted-foreground text-xs">—</span>
                                    }
                                  </td>
                                  <td className="px-5 py-3.5">
                                    <div>
                                      <p className="text-sm text-foreground">{dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                                      <p className="text-[11px] text-muted-foreground">{dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</p>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3.5">
                                    <span className="font-medium text-foreground text-sm">{sale.courseTitle}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <Paginator page={salesPage} total={sales.length} onPage={setSalesPage} />
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Links Tab ── */}
          {tab === "links" && !loading && (
            <div className="space-y-4 max-w-2xl">
              <TabHeader title="My Affiliate Links" subtitle="Share your unique link to earn commissions on every sale." />

              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Your affiliate ID</Label>
                  <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <p className="font-mono font-extrabold text-primary text-2xl tracking-widest flex-1">{dashboard?.referralCode ?? "–"}</p>
                    <Badge className="text-[10px] text-green-400 border-green-400/30 bg-green-400/10 gap-1"><CheckCircle2 className="w-3 h-3" />Active</Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Affiliate link</Label>
                  <div className="flex gap-2">
                    <Input value={dashboard?.referralLink ?? ""} readOnly className="bg-background font-mono text-xs min-w-0" />
                    <Button variant="outline" onClick={copyLink} className={`gap-1.5 flex-shrink-0 ${copied ? "border-green-500/30 text-green-400" : ""}`}>
                      {copied ? <><Check className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
                    </Button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
                  <p className="text-xs text-blue-400 flex items-center gap-1.5"><Info className="w-3 h-3 flex-shrink-0" />You earn <span className="font-bold">{dashboard?.commissionRate ?? "–"}%</span> commission on every successful purchase through your link.</p>
                </div>
              </div>

              <CustomLinkGenerator referralCode={dashboard?.referralCode ?? ""} siteBaseUrl={dashboard?.siteBaseUrl ?? ""} />
            </div>
          )}

          {/* ── Clicks Tab ── */}
          {tab === "clicks" && !loading && (
            <div className="space-y-6">
              <TabHeader title="Click Analytics" subtitle="Track traffic and conversions from your referral links." />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard2 icon={<MousePointerClick className="w-4 h-4 text-blue-400" />} label="Total Clicks" value={clicks?.total ?? 0} color="text-blue-400" />
                <StatCard2 icon={<Users className="w-4 h-4 text-purple-400" />} label="Unique Visitors" value={clicks?.unique ?? 0} color="text-purple-400" />
                <StatCard2 icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} label="Conversions" value={clicks?.conversions ?? 0} color="text-green-400"
                  sub={clicks?.total > 0 ? `${((clicks.conversions / clicks.total) * 100).toFixed(1)}% conversion rate` : undefined} />
              </div>

              <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Daily Analytics — Last 30 Days</h3>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Clicks</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />Unique</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Conv.</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={clicks?.dailyChart ?? []} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={v => v.substring(5)} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                      cursor={{ fill: tooltipCursorFill }}
                    />
                    <Bar dataKey="clicks" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Clicks" />
                    <Bar dataKey="unique" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Unique" />
                    <Bar dataKey="conversions" fill="#22c55e" radius={[3, 3, 0, 0]} name="Conv." />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Creatives Tab ── */}
          {tab === "creatives" && !loading && (
            <div>
              <TabHeader title="Marketing Creatives" subtitle="Download banners, copy, and assets to promote your affiliate link." />
              <CreativesTab creatives={creatives} />
            </div>
          )}

          {/* ── KYC Tab ── */}
          {tab === "kyc" && !loading && (
            <div>
              <TabHeader title="KYC Verification" subtitle="Submit identity documents to enable payouts." />
              <KycTab kyc={kyc} onSaved={k => setKyc(k)} />
            </div>
          )}

          {/* ── Payouts Tab ── */}
          {tab === "payouts" && !loading && (
            <div>
              <TabHeader title="Payouts" subtitle="View your earnings and payout history." />
              <PayoutsTab dashboard={dashboard} payouts={payouts} upcomingPayout={upcomingPayout} />
            </div>
          )}

          {/* ── Pixel Tab ── */}
          {tab === "pixel" && !loading && (
            <div>
              <TabHeader title="Tracking Pixel" subtitle="Connect your Facebook Pixel to track conversions from your referrals." />
              <PixelTab pixel={pixel} onSaved={p => setPixel(p)} />
            </div>
          )}

          {/* ── Bank Tab ── */}
          {tab === "bank" && !loading && (
            <div>
              <TabHeader title="Bank Account" subtitle="Add your bank details to receive payout transfers." />
              <BankTab bank={bank} onSaved={b => setBank(b)} />
            </div>
          )}

        </div>
      </main>

      {/* First-time welcome popup + interactive dashboard tour */}
      {!loading && dashboard && showWelcomeForSession && !welcomeDismissed && (
        <WelcomeOnboarding
          userName={user?.name ?? ""}
          commissionRate={dashboard?.commissionRate ?? 20}
          cookieDays={dashboard?.cookieDays ?? 30}
          referralCode={dashboard?.referralCode ?? ""}
          onTourStart={() => {
            setTourActive(true);
            // Always start on the earnings tab so the first two tour steps have valid targets.
            setTab("earnings");
          }}
          onTourEnd={() => {
            setTourActive(false);
            setTourSidebarOpen(false);
          }}
          onTourStepChange={({ isNavTarget }) => {
            // Only force-open the sidebar (which on mobile is a slide-over) for nav steps.
            // For earnings-content steps, leave it closed so the highlighted area is visible.
            setTourSidebarOpen(isNavTarget);
          }}
          onComplete={() => {
            setWelcomeDismissed(true);
            setDashboard((d: any) => d ? { ...d, welcomedAt: new Date().toISOString() } : d);
          }}
        />
      )}

      {/* Manual replay tour — mounts a fresh WelcomeOnboarding in tour-only
          mode whenever the user clicks "Replay tour" in the sidebar. Resets
          its own state on finish so the user can replay as many times as they
          want. Independent of the first-time popup above. */}
      {!loading && dashboard && replayingTour && (
        <WelcomeOnboarding
          key={`replay-${replayingTour}`}
          userName={user?.name ?? ""}
          commissionRate={dashboard?.commissionRate ?? 20}
          cookieDays={dashboard?.cookieDays ?? 30}
          referralCode={dashboard?.referralCode ?? ""}
          skipWelcomeModal
          onTourStart={() => {
            setTourActive(true);
            setTab("earnings");
          }}
          onTourEnd={() => {
            setTourActive(false);
            setTourSidebarOpen(false);
          }}
          onTourStepChange={({ isNavTarget }) => {
            setTourSidebarOpen(isNavTarget);
          }}
          onComplete={() => {
            setReplayingTour(false);
          }}
        />
      )}
    </div>
  );
}

/* ─── Custom Link Generator ─── */
function CustomLinkGenerator({ referralCode, siteBaseUrl }: { referralCode: string; siteBaseUrl: string }) {
  const [inputUrl, setInputUrl] = useState("");
  const [copiedGenerated, setCopiedGenerated] = useState(false);
  const browserOrigin = window.location.origin;

  // Compute the canonical public origin (custom domain when configured) and
  // also keep the current browser origin as an accepted origin. This way:
  //  - On the deployed custom domain → both equal the custom domain.
  //  - On dev/preview → user can paste either preview URLs OR custom-domain
  //    URLs, and we always rewrite into the canonical custom-domain link.
  const canonicalOrigin = (() => {
    try { return siteBaseUrl ? new URL(siteBaseUrl).origin : browserOrigin; }
    catch { return browserOrigin; }
  })();
  const acceptedOrigins = Array.from(new Set([canonicalOrigin, browserOrigin]));
  // Display string — the custom domain wins for placeholder/error UX.
  const displayOrigin = canonicalOrigin;

  const isValidSiteUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return acceptedOrigins.includes(parsed.origin);
    } catch {
      return false;
    }
  };

  const buildAffiliateUrl = (url: string) => {
    if (!url.trim() || !referralCode) return "";
    try {
      const parsed = new URL(url.trim());
      // Always emit the canonical (custom-domain) origin, even if the user
      // pasted a dev/preview URL. Affiliates should always share the public
      // brand URL, never the *.replit.dev preview.
      const rewritten = new URL(parsed.pathname + parsed.search + parsed.hash, canonicalOrigin);
      rewritten.searchParams.set("ref", referralCode);
      return rewritten.toString();
    } catch {
      return "";
    }
  };

  const generatedUrl = buildAffiliateUrl(inputUrl);
  const isValid = inputUrl.trim() === "" || isValidSiteUrl(inputUrl.trim());

  const copyGenerated = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setCopiedGenerated(true);
    setTimeout(() => setCopiedGenerated(false), 2000);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-0.5">Custom Affiliate Link Generator</h3>
        <p className="text-xs text-muted-foreground">Paste any page URL from this site — get your personalised affiliate link instantly.</p>
      </div>

      {/* Input */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Paste a site URL</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              placeholder={`${displayOrigin}/courses/1`}
              className={`bg-background border-border pl-9 font-mono text-xs ${!isValid ? "border-red-500/50 focus-visible:ring-red-500/30" : ""}`}
            />
          </div>
        </div>
        {!isValid && (
          <p className="text-[11px] text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />URL must be from this site ({displayOrigin})
          </p>
        )}
      </div>

      {/* Generated link output */}
      {generatedUrl && isValid && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Your affiliate link</Label>
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl p-3">
            <ExternalLink className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-xs font-mono text-primary flex-1 truncate">{generatedUrl}</span>
            <button
              onClick={copyGenerated}
              className={`flex-shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                copiedGenerated
                  ? "bg-green-500/15 text-green-400 border border-green-500/20"
                  : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
              }`}
            >
              {copiedGenerated ? <><Check className="w-3 h-3" />Copied!</> : <><Copy className="w-3 h-3" />Copy</>}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

/* ─── Creatives Tab ─── */
function CreativesTab({ creatives }: { creatives: any[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key); setTimeout(() => setCopied(null), 2000);
  };
  if (creatives.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl py-20 text-center">
        <Image className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-semibold text-foreground mb-1">No creatives yet</p>
        <p className="text-sm text-muted-foreground">The admin hasn't uploaded any promotional materials yet.</p>
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {creatives.map(c => (
        <div key={c.id} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="text-[10px] capitalize border-border text-muted-foreground">{c.type}</Badge>
            <h4 className="font-medium text-sm text-foreground truncate flex-1">{c.title}</h4>
          </div>
          {c.url && c.type !== "link" && (
            <img src={c.url} alt={c.title} className="w-full h-28 object-contain rounded-lg bg-background border border-border mb-3" />
          )}
          {c.content && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">Primary Text / Ad Copy</p>
                <button onClick={() => copy(c.content, `${c.id}-c`)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  {copied === `${c.id}-c` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground bg-background border border-border rounded-lg p-2.5 line-clamp-3">{c.content}</p>
            </div>
          )}
          {c.headline && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">Headline</p>
                <button onClick={() => copy(c.headline, `${c.id}-h`)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  {copied === `${c.id}-h` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-xs text-foreground font-medium bg-background border border-border rounded-lg p-2.5">{c.headline}</p>
            </div>
          )}
          {c.description && <p className="text-xs text-muted-foreground mb-3">{c.description}</p>}
          <div className="flex gap-2">
            {c.url && c.type === "link" && (
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" size="sm" className="w-full gap-1.5 border-border text-xs cursor-pointer">
                  <ArrowUpRight className="w-3 h-3" />Open Link
                </Button>
              </a>
            )}
            {c.url && c.type !== "link" && (
              <a href={c.url} download className="flex-1">
                <Button variant="outline" size="sm" className="w-full gap-1.5 border-border text-xs cursor-pointer">
                  <Download className="w-3 h-3" />Download
                </Button>
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── KYC Tab ─── */
function KycTab({ kyc, onSaved }: { kyc: any; onSaved: (k: any) => void }) {
  const { toast } = useToast();
  const [panName, setPanName] = useState(kyc?.idProofName ?? "");
  const [panNumber, setPanNumber] = useState(kyc?.panNumber ?? "");
  const [panPhotoUrl, setPanPhotoUrl] = useState(kyc?.addressProofName ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [panInput, setPanInput] = useState("");
  const [panInputSaving, setPanInputSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const savePanOnly = async () => {
    const val = panInput.trim().toUpperCase();
    if (!val || val.length !== 10) {
      toast({ title: "Enter a valid 10-character PAN number", variant: "destructive" }); return;
    }
    setPanInputSaving(true);
    try {
      const res = await apiFetch("/api/affiliate/kyc/pan-number", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panNumber: val }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      onSaved(data);
      toast({ title: "PAN number saved!" });
    } catch {
      toast({ title: "Failed to save PAN number", variant: "destructive" });
    } finally { setPanInputSaving(false); }
  };

  const handlePanPhoto = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file (JPEG, PNG, WebP)."); return;
    }
    if (file.size > 1 * 1024 * 1024) {
      setUploadError("PAN photo must be smaller than 1 MB."); return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${API_BASE}/api/upload/image`, {
        method: "POST", credentials: "include", body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setPanPhotoUrl(data.url);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }, []);

  const save = async () => {
    if (!panName.trim()) { toast({ title: "Name as per PAN is required", variant: "destructive" }); return; }
    if (!panNumber.trim() || panNumber.trim().length !== 10) { toast({ title: "Enter a valid 10-character PAN number", variant: "destructive" }); return; }
    if (!panPhotoUrl) { toast({ title: "Please upload your PAN front photo", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/affiliate/kyc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idProofName: panName.trim(), addressProofName: panPhotoUrl, panNumber: panNumber.trim().toUpperCase() }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      onSaved(data);
      toast({ title: "KYC submitted!", description: "Under review by admin." });
    } catch { toast({ title: "Failed to submit KYC", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  /* ── "Pending" state — under review message ── */
  if (kyc?.status === "pending") {
    return (
      <div className="max-w-lg space-y-4">
        <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">KYC Under Review</h3>
            <p className="text-sm text-muted-foreground mt-1">Your documents have been submitted successfully and are being reviewed by our team.</p>
          </div>
          <div className="p-3 bg-amber-400/5 border border-amber-400/20 rounded-xl text-left space-y-2">
            <p className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />Estimated review time: up to 24 hours
            </p>
            <p className="text-xs text-muted-foreground">You'll be notified once your KYC is approved or if any action is required.</p>
          </div>
          <div className="text-left space-y-2 pt-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Submitted Details</p>
            <div className="bg-background border border-border rounded-xl p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">Name as Per PAN</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{kyc.idProofName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">PAN Number</p>
                  <p className="text-sm font-mono font-medium text-foreground mt-0.5 tracking-widest">{kyc.panNumber ?? "—"}</p>
                </div>
              </div>
              {kyc.addressProofName && (
                <div>
                  <p className="text-[11px] text-muted-foreground">PAN Front Photo</p>
                  <img src={kyc.addressProofName} alt="PAN" className="mt-1.5 w-full max-h-40 object-cover rounded-lg border border-border" />
                </div>
              )}
            </div>
          </div>
          {!kyc.panNumber && (
            <div className="text-left bg-amber-400/5 border border-amber-400/20 rounded-xl p-4 space-y-2.5">
              <p className="text-xs font-medium text-amber-300 flex items-center gap-1.5"><Lock className="w-3 h-3" />PAN number missing — add it without resubmitting</p>
              <div className="flex gap-2">
                <Input
                  value={panInput}
                  onChange={e => setPanInput(e.target.value.toUpperCase())}
                  placeholder="e.g. ABCDE1234F"
                  maxLength={10}
                  className="bg-background border-border font-mono uppercase tracking-widest text-sm flex-1"
                />
                <Button onClick={savePanOnly} disabled={panInputSaving} size="sm" className="bg-primary shrink-0 gap-1.5">
                  {panInputSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  {panInputSaving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── "Approved" state ── */
  if (kyc?.status === "approved") {
    return (
      <div className="max-w-lg space-y-4">
        <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-green-400/10 border border-green-400/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7 text-green-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">KYC Verified</h3>
            <p className="text-sm text-muted-foreground mt-1">Your identity has been successfully verified. You're fully activated as an affiliate.</p>
          </div>
          <div className="text-left space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Verified Details</p>
            <div className="bg-background border border-border rounded-xl p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">Name as Per PAN</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{kyc.idProofName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">PAN Number</p>
                  <p className="text-sm font-mono font-medium text-foreground mt-0.5 tracking-widest">{kyc.panNumber ?? "—"}</p>
                </div>
              </div>
              {kyc.addressProofName && (
                <div>
                  <p className="text-[11px] text-muted-foreground">PAN Front Photo</p>
                  <img src={kyc.addressProofName} alt="PAN" className="mt-1.5 w-full max-h-40 object-cover rounded-lg border border-border" />
                </div>
              )}
            </div>
          </div>
          {!kyc.panNumber && (
            <div className="text-left bg-amber-400/5 border border-amber-400/20 rounded-xl p-4 space-y-2.5">
              <p className="text-xs font-medium text-amber-300 flex items-center gap-1.5"><Lock className="w-3 h-3" />PAN number missing — add it for TDS compliance</p>
              <div className="flex gap-2">
                <Input
                  value={panInput}
                  onChange={e => setPanInput(e.target.value.toUpperCase())}
                  placeholder="e.g. ABCDE1234F"
                  maxLength={10}
                  className="bg-background border-border font-mono uppercase tracking-widest text-sm flex-1"
                />
                <Button onClick={savePanOnly} disabled={panInputSaving} size="sm" className="bg-primary shrink-0 gap-1.5">
                  {panInputSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  {panInputSaving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Form (first submit or resubmit after rejection) ── */
  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">KYC Verification</h3>
          {kyc && <StatusBadge status={kyc.status} />}
        </div>
        {kyc?.adminNote && (
          <div className="mb-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
            <p className="text-xs font-medium text-red-400 mb-1">Admin Note:</p>
            <p className="text-sm text-muted-foreground">{kyc.adminNote}</p>
          </div>
        )}
        <div className="space-y-4">
          {/* Field 1 — Name as Per PAN */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Name as Per PAN <span className="text-red-400">*</span></Label>
            <Input
              value={panName}
              onChange={e => setPanName(e.target.value)}
              placeholder="Enter your name exactly as on PAN card"
              className="bg-background border-border"
            />
          </div>

          {/* Field 2 — PAN Number */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">PAN Number <span className="text-red-400">*</span></Label>
            <Input
              value={panNumber}
              onChange={e => setPanNumber(e.target.value.toUpperCase())}
              placeholder="e.g. ABCDE1234F"
              maxLength={10}
              className="bg-background border-border font-mono uppercase tracking-widest"
            />
          </div>

          {/* Field 3 — PAN Front Photo */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">PAN Front Photo <span className="text-red-400">*</span> <span className="text-muted-foreground/60">(Max 1 MB)</span></Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => handlePanPhoto(e.target.files?.[0])}
            />
            {panPhotoUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-border group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <img src={panPhotoUrl} alt="PAN front photo" className="w-full h-40 object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-white text-sm font-medium bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5">
                    <Upload className="w-3.5 h-3.5" /> Replace Photo
                  </div>
                </div>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setPanPhotoUrl(""); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500/80 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full h-32 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2 text-muted-foreground cursor-pointer"
              >
                {uploading ? (
                  <><Loader2 className="w-6 h-6 animate-spin text-primary" /><span className="text-xs text-primary">Uploading…</span></>
                ) : (
                  <><FileImage className="w-6 h-6" /><span className="text-xs">Click to upload PAN front photo</span><span className="text-[11px] text-muted-foreground/60">JPG, PNG, WebP · Max 1 MB</span></>
                )}
              </button>
            )}
            {uploadError && (
              <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" />{uploadError}</p>
            )}
          </div>

          <div className="p-3 bg-amber-400/5 border border-amber-400/20 rounded-lg">
            <p className="text-xs text-amber-300 flex items-center gap-1.5"><Lock className="w-3 h-3" />Stored securely · used only for KYC & TDS purposes.</p>
          </div>
          <Button onClick={save} disabled={saving || uploading} className="w-full bg-primary gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {saving ? "Submitting…" : kyc ? "Resubmit KYC" : "Submit KYC"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Payouts Tab ─── */
function PayoutsTab({ dashboard, payouts, upcomingPayout }: { dashboard: any; payouts: any[]; upcomingPayout: any }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [commissions, setCommissions] = useState<Record<number, any[] | null>>({});
  const [loadingComm, setLoadingComm] = useState<number | null>(null);
  const [payoutsPage, setPayoutsPage] = useState(1);

  const fmt = (n: number) =>
    `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d: string) =>
    new Date(d).toLocaleString("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    }).replace(",", "");

  const toggleDetails = async (id: number) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (commissions[id] !== undefined) return;
    setLoadingComm(id);
    try {
      const r = await apiFetch(`/api/affiliate/payouts/${id}/commissions`);
      setCommissions(c => ({ ...c, [id]: r.ok ? [] : [] }));
      if (r.ok) { const data = await r.json(); setCommissions(c => ({ ...c, [id]: data })); }
    } finally { setLoadingComm(null); }
  };

  const statusMap: Record<string, string> = {
    pending:  "text-amber-400 border-amber-400/30 bg-amber-400/10",
    approved: "text-green-400 border-green-400/30 bg-green-400/10",
    rejected: "text-red-400 border-red-400/30 bg-red-400/10",
    hold:     "text-blue-400 border-blue-400/30 bg-blue-400/10",
  };

  const upcomingStatusColor: Record<string, string> = {
    pending:  "text-amber-400",
    hold:     "text-blue-400",
    approved: "text-green-400",
    rejected: "text-red-400",
  };
  const upcomingStatusLabel: Record<string, string> = {
    pending:  "Processing",
    hold:     "On Hold",
    approved: "Approved",
    rejected: "Rejected",
  };

  return (
    <div className="space-y-5">
      {/* Balance cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Earned", value: dashboard?.totalEarnings ?? 0, color: "text-foreground" },
          { label: "Pending",      value: dashboard?.pendingEarnings ?? 0, color: "text-amber-400" },
          { label: "Paid Out",     value: dashboard?.paidEarnings ?? 0,   color: "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className={`text-xl font-bold ${s.color}`}>₹{Number(s.value).toLocaleString("en-IN")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
        {/* Upcoming Payout card */}
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          {upcomingPayout && upcomingPayout.unpaidAmount > 0 ? (
            <>
              <p className="text-xl font-bold text-violet-400">
                ₹{Number(upcomingPayout.unpaidAmount).toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Upcoming Payout</p>
              {upcomingPayout.latestAction && upcomingPayout.latestAction.status !== "approved" && (
                <>
                  <p className={`text-[10px] mt-1 font-medium ${upcomingStatusColor[upcomingPayout.latestAction.status] ?? "text-muted-foreground"}`}>
                    {upcomingStatusLabel[upcomingPayout.latestAction.status] ?? upcomingPayout.latestAction.status}
                  </p>
                  {upcomingPayout.latestAction.note && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                      {upcomingPayout.latestAction.note}
                    </p>
                  )}
                </>
              )}
              {upcomingPayout.nextDueDate && !upcomingPayout.isDue && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Due {new Date(upcomingPayout.nextDueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </p>
              )}
              {upcomingPayout.isDue && !upcomingPayout.latestAction && (
                <p className="text-[10px] text-violet-400 mt-0.5">Ready for payout</p>
              )}
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-muted-foreground">₹0</p>
              <p className="text-xs text-muted-foreground mt-0.5">Upcoming Payout</p>
            </>
          )}
        </div>
      </div>
      {/* Payout history table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Payout History</h3>
        </div>
        {payouts.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No payouts yet. Payouts are processed by the admin.
          </div>
        ) : (() => {
          const pagedPayouts = payouts.slice((payoutsPage - 1) * PAGE_SIZE, payoutsPage * PAGE_SIZE);
          return (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs">
                      <th className="px-5 py-2.5 text-left font-medium">ID</th>
                      <th className="px-5 py-2.5 text-left font-medium">Amount</th>
                      <th className="px-5 py-2.5 text-left font-medium">Date</th>
                      <th className="px-5 py-2.5 text-left font-medium">Status</th>
                      <th className="px-5 py-2.5 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedPayouts.map(p => (
                      <Fragment key={p.id}>
                        <tr className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                          <td className="px-5 py-3 text-muted-foreground text-xs">{p.id}</td>
                          <td className="px-5 py-3 font-semibold">{fmt(p.amount)}</td>
                          <td className="px-5 py-3 text-muted-foreground text-xs">
                            {fmtDate(p.processedAt ?? p.requestedAt)}
                          </td>
                          <td className="px-5 py-3">
                            <Badge className={`text-[10px] capitalize ${statusMap[p.status] ?? ""}`}>
                              {p.status === "approved" ? "Paid" : p.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => toggleDetails(p.id)}
                              className="flex items-center gap-0.5 text-xs text-primary hover:underline cursor-pointer whitespace-nowrap ml-auto"
                            >
                              Details
                              <ChevronDown className={`w-3 h-3 transition-transform ${expanded === p.id ? "rotate-180" : ""}`} />
                            </button>
                          </td>
                        </tr>
                        {expanded === p.id && (
                          <tr key={`${p.id}-detail`}>
                            <td colSpan={5} className="px-5 py-4 bg-muted/5 border-b border-border">
                              {loadingComm === p.id ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Loading commissions…
                                </div>
                              ) : (
                                <>
                                  <p className="font-semibold text-sm mb-0.5">Commissions</p>
                                  <p className="text-xs text-muted-foreground mb-3">
                                    The following commissions have been included in this payout.
                                  </p>
                                  {!commissions[p.id] || commissions[p.id]!.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">No commission records found for this payout.</p>
                                  ) : (
                                    <div className="border border-border rounded-lg overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead className="bg-muted/40 text-muted-foreground">
                                          <tr>
                                            <th className="px-4 py-2 text-left font-medium">ID</th>
                                            <th className="px-4 py-2 text-left font-medium">Amount</th>
                                            <th className="px-4 py-2 text-left font-medium">Reference</th>
                                            <th className="px-4 py-2 text-left font-medium">Type</th>
                                            <th className="px-4 py-2 text-left font-medium">Date</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                          {commissions[p.id]!.map((c: any) => (
                                            <tr key={c.id} className="hover:bg-muted/10">
                                              <td className="px-4 py-2 text-muted-foreground">{c.id}</td>
                                              <td className="px-4 py-2 font-medium">{fmt(c.commission)}</td>
                                              <td className="px-4 py-2 text-muted-foreground">
                                                {c.productName ?? ""}
                                              </td>
                                              <td className="px-4 py-2">Sale</td>
                                              <td className="px-4 py-2 text-muted-foreground">{fmtDate(c.createdAt)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginator page={payoutsPage} total={payouts.length} onPage={p => { setPayoutsPage(p); setExpanded(null); }} />
            </>
          );
        })()}
      </div>
    </div>
  );
}

/* ─── Pixel Tab ─── */
function PixelTab({ pixel, onSaved }: { pixel: any; onSaved: (p: any) => void }) {
  const { toast } = useToast();

  /* Setup form */
  const [pixelId, setPixelId] = useState(pixel?.facebookPixelId ?? "");
  const [accessToken, setAccessToken] = useState(pixel?.accessToken ?? "");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Test tool */
  const [testEventCode, setTestEventCode] = useState("");
  const [testEventName, setTestEventName] = useState<"InitiateCheckout" | "Purchase">("Purchase");
  const [testValue, setTestValue] = useState("999");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const isConnected = !!(pixel?.facebookPixelId && pixel?.accessToken);

  const save = async () => {
    if (!pixelId.trim()) { toast({ title: "Pixel ID is required", variant: "destructive" }); return; }
    if (!accessToken.trim()) { toast({ title: "Access Token is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/affiliate/pixel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facebookPixelId: pixelId.trim(), accessToken: accessToken.trim(), trackPageView: true, trackPurchase: true }),
      });
      if (!res.ok) throw new Error("Failed");
      const saved = await res.json();
      onSaved(saved);
      toast({ title: "Pixel settings saved!", description: "Events will fire automatically on your referral activity." });
    } catch { toast({ title: "Failed to save pixel settings", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const sendTestEvent = async () => {
    if (!testEventCode.trim()) { toast({ title: "Test Event Code is required", variant: "destructive" }); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/affiliate/pixel/test-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEventCode: testEventCode.trim(), eventName: testEventName, value: parseFloat(testValue) || 999 }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: data.message ?? "Test event sent successfully!" });
      } else {
        setTestResult({ success: false, error: data.error ?? "Failed to send test event." });
      }
    } catch { setTestResult({ success: false, error: "Network error. Please try again." }); }
    finally { setTesting(false); }
  };

  return (
    <div className="max-w-xl space-y-4">

      {/* Status bar */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
        isConnected
          ? "bg-green-500/8 border-green-500/20 text-green-400"
          : "bg-amber-500/8 border-amber-500/20 text-amber-400"
      }`}>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? "bg-green-400" : "bg-amber-400"}`} />
        {isConnected
          ? `Connected — Pixel ${pixel.facebookPixelId}`
          : "Not connected — add your Pixel ID and Access Token to start tracking"}
      </div>

      {/* Setup card */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Facebook Pixel Setup</h3>
            <p className="text-[11px] text-muted-foreground">Connect via Conversions API — events fire server-side, no browser required.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Facebook Pixel ID <span className="text-red-400">*</span></Label>
            <Input
              value={pixelId}
              onChange={e => setPixelId(e.target.value)}
              placeholder="e.g. 123456789012345"
              className="bg-background border-border font-mono"
            />
            <p className="text-[11px] text-muted-foreground">Found in Meta Events Manager → Data Sources → your Pixel.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Conversions API Access Token <span className="text-red-400">*</span></Label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={accessToken}
                onChange={e => setAccessToken(e.target.value)}
                placeholder="EAAxxxxxxxxxxxxxxxx…"
                className="bg-background border-border font-mono pr-10 text-xs"
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {showToken
                  ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">Generate in Events Manager → Settings → Conversions API → Generate Access Token.</p>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {saving ? "Saving…" : "Save & Connect"}
        </Button>
      </div>

      {/* Active events info */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Active Events</h3>
        <p className="text-[11px] text-muted-foreground">These events fire automatically server-side whenever activity occurs via your referral link.</p>
        <div className="space-y-2">
          {[
            {
              name: "InitiateCheckout",
              trigger: "Someone clicks your affiliate link and lands on the site",
              color: "text-blue-400",
              bg: "bg-blue-500/10",
              border: "border-blue-500/20",
            },
            {
              name: "Purchase",
              trigger: "A sale is completed through your link",
              value: "Value = your commission earned (₹)",
              color: "text-green-400",
              bg: "bg-green-500/10",
              border: "border-green-500/20",
            },
          ].map(ev => (
            <div key={ev.name} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${ev.bg} ${ev.border}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-bold font-mono ${ev.color}`}>{ev.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/20 font-medium">ACTIVE</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{ev.trigger}</p>
                {ev.value && <p className={`text-[10px] mt-0.5 font-medium ${ev.color}`}>{ev.value}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Test event tool */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
            <Activity className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Event Testing Tool</h3>
            <p className="text-[11px] text-muted-foreground">Send a test event to verify your Pixel & Access Token are working.</p>
          </div>
        </div>

        {!isConnected && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/8 border border-amber-500/20">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-400">Save your Pixel ID and Access Token above before testing.</p>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Test Event Code <span className="text-red-400">*</span></Label>
            <Input
              value={testEventCode}
              onChange={e => setTestEventCode(e.target.value)}
              placeholder="e.g. TEST12345"
              className="bg-background border-border font-mono uppercase"
              disabled={!isConnected}
            />
            <p className="text-[11px] text-muted-foreground">Find this in Meta Events Manager → Test Events tab.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Event Type</Label>
              <select
                value={testEventName}
                onChange={e => setTestEventName(e.target.value as "InitiateCheckout" | "Purchase")}
                disabled={!isConnected}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                <option value="Purchase">Purchase</option>
                <option value="InitiateCheckout">InitiateCheckout</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Value (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={testValue}
                onChange={e => setTestValue(e.target.value)}
                placeholder="999"
                className="bg-background border-border"
                disabled={!isConnected}
              />
            </div>
          </div>
        </div>

        <Button
          onClick={sendTestEvent}
          disabled={testing || !isConnected}
          variant="outline"
          className="w-full gap-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/50 hover:text-purple-300 disabled:opacity-40"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          {testing ? "Sending…" : "Send Test Event"}
        </Button>

        {testResult && (
          <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs ${
            testResult.success
              ? "bg-green-500/8 border-green-500/20 text-green-400"
              : "bg-red-500/8 border-red-500/20 text-red-400"
          }`}>
            {testResult.success
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            }
            <div>
              <p className="font-semibold">{testResult.success ? "Success" : "Failed"}</p>
              <p className="opacity-80 mt-0.5">{testResult.success ? testResult.message : testResult.error}</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

/* ─── Bank Tab ─── */
function BankTab({ bank, onSaved }: { bank: any; onSaved: (b: any) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    accountHolderName: bank?.accountHolderName ?? "",
    accountNumber: bank?.accountNumber ?? "",
    ifscCode: bank?.ifscCode ?? "",
    bankName: bank?.bankName ?? "",
  });
  const [showAcc, setShowAcc] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.accountHolderName || !form.accountNumber || !form.ifscCode || !form.bankName) {
      toast({ title: "All fields are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/affiliate/bank", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      onSaved(await res.json());
      toast({ title: "Bank details saved!" });
    } catch { toast({ title: "Failed to save bank details", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-lg">
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Bank Account Details</h3>
          {bank && <Badge className="text-[10px] text-green-400 border-green-400/30 bg-green-400/10 gap-1"><CheckCircle2 className="w-3 h-3" />Saved</Badge>}
        </div>

        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-primary" />Bank details are encrypted and only used for processing payouts.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Account Holder Name</Label>
            <Input value={form.accountHolderName} onChange={e => setForm(f => ({ ...f, accountHolderName: e.target.value }))}
              placeholder="As per bank records" className="bg-background border-border" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Account Number</Label>
            <div className="relative">
              <Input type={showAcc ? "text" : "password"} value={form.accountNumber}
                onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
                placeholder="Enter account number" className="bg-background border-border pr-9 font-mono" />
              <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => setShowAcc(v => !v)}>
                {showAcc ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">IFSC Code</Label>
              <Input value={form.ifscCode} onChange={e => setForm(f => ({ ...f, ifscCode: e.target.value.toUpperCase() }))}
                placeholder="e.g. HDFC0001234" className="bg-background border-border font-mono uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bank Name</Label>
              <Input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                placeholder="e.g. HDFC Bank" className="bg-background border-border" />
            </div>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full bg-primary gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
          {saving ? "Saving…" : bank ? "Update Bank Details" : "Save Bank Details"}
        </Button>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function AffiliatePage() {
  const { user, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<"loading" | "no-app" | "pending" | "rejected" | "approved">("loading");
  const [appNote, setAppNote] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    if ((user as any)?.role === "affiliate" || (user as any)?.role === "admin") {
      setStatus("approved"); return;
    }
    apiFetch("/api/affiliate/application")
      .then(async r => {
        if (r.status === 404) { setStatus("no-app"); return; }
        const app = await r.json();
        if (app.status === "approved") { setStatus("approved"); }
        else if (app.status === "rejected") { setStatus("rejected"); setAppNote(app.adminNote ?? null); }
        else { setStatus("pending"); }
      })
      .catch(() => setStatus("no-app"));
  }, [isAuthenticated, user]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "no-app") return <ApplyForm user={user} onSubmitted={() => setStatus("pending")} />;
  if (status === "pending") return <PendingView />;
  if (status === "rejected") return <RejectedView note={appNote} onReapply={() => setStatus("no-app")} />;
  return <AffiliateDashboard user={user} />;
}
