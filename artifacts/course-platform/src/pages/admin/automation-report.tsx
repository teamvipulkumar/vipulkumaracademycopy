import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useAdminBase } from "@/lib/auth-context";
import {
  ChevronLeft, BarChart2, Mail, MailOpen, Activity, Loader2, Search, RefreshCw, Trash2,
  ChevronRight, ChevronDown, Eye, X, Info, CheckCircle2, XCircle, Clock, Users,
  Zap, TrendingUp, Send, Pencil, Circle, AlertCircle, ArrowDown, LogIn,
  MousePointerClick, UserMinus,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Line, ComposedChart } from "recharts";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
async function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${API_BASE}${path}`, { credentials: "include", ...opts });
}

type Tab = "chart" | "step" | "emails";

function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; ring: string; label: string }> = {
    running: { color: "text-blue-400", bg: "bg-blue-500/10", ring: "ring-blue-500/20", label: "Running" },
    completed: { color: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20", label: "Completed" },
    failed: { color: "text-red-400", bg: "bg-red-500/10", ring: "ring-red-500/20", label: "Failed" },
    pending: { color: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/20", label: "Pending" },
    skipped: { color: "text-muted-foreground", bg: "bg-muted/40", ring: "ring-border", label: "Skipped" },
  };
  const m = map[status] ?? { color: "text-muted-foreground", bg: "bg-muted/40", ring: "ring-border", label: status };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium ring-1 ring-inset ${m.bg} ${m.color} ${m.ring}`}>
      {m.label}
    </span>
  );
}

function PublishBadge({ status, isActive }: { status?: string; isActive?: boolean }) {
  const live = status === "published" && isActive;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md font-medium ring-1 ring-inset ${live ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" : "bg-amber-500/10 text-amber-400 ring-amber-500/20"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"} ${live ? "animate-pulse" : ""}`} />
      {live ? "Active" : status === "published" ? "Paused" : "Draft"}
    </span>
  );
}

const TRIGGER_LABELS: Record<string, string> = {
  user_signup: "User Sign Up",
  new_purchase: "New Purchase",
  course_completed: "Course Completed",
  forgot_password: "Forgot Password",
  affiliate_commission: "Affiliate Commission",
  tag_applied: "Tag Applied",
  list_added: "List Added",
};

export default function AutomationReportPage() {
  const adminBase = useAdminBase();
  // Mounted under both `/admin/crm/automation/:id/report` and
  // `/staff/crm/automation/:id/report` — match either prefix.
  const [, paramsAdmin] = useRoute("/admin/crm/automation/:id/report");
  const [, paramsStaff] = useRoute("/staff/crm/automation/:id/report");
  const params = paramsAdmin ?? paramsStaff;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const funnelId = params?.id ? parseInt(params.id) : null;

  const [tab, setTab] = useState<Tab>("chart");
  const [stepReport, setStepReport] = useState<any | null>(null);
  const [emailReport, setEmailReport] = useState<any | null>(null);
  const [emailPreview, setEmailPreview] = useState<string | null>(null);

  // Individual Reporting table state
  const [executions, setExecutions] = useState<any[]>([]);
  const [executionsTotal, setExecutionsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "completed" | "failed">("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [stepDetails, setStepDetails] = useState<Map<number, any[]>>(new Map());

  const [reportLoading, setReportLoading] = useState(false);

  const loadReports = useCallback(async () => {
    if (!funnelId) return;
    setReportLoading(true);
    try {
      const [stepRes, emailRes] = await Promise.all([
        apiFetch(`/api/admin/crm/funnels/${funnelId}/step-report`).then(r => r.json()),
        apiFetch(`/api/admin/crm/funnels/${funnelId}/report`).then(r => r.json()),
      ]);
      setStepReport(stepRes);
      setEmailReport(emailRes);
    } catch {
      toast({ title: "Failed to load report", variant: "destructive" });
    }
    setReportLoading(false);
  }, [funnelId, toast]);

  const loadExecutions = useCallback(async () => {
    if (!funnelId) return;
    setExecutionsLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status: statusFilter,
        search,
      });
      const res = await apiFetch(`/api/admin/crm/funnels/${funnelId}/executions?${qs}`).then(r => r.json());
      setExecutions(res.rows ?? []);
      setExecutionsTotal(res.total ?? 0);
    } catch {
      toast({ title: "Failed to load executions", variant: "destructive" });
    }
    setExecutionsLoading(false);
  }, [funnelId, page, limit, statusFilter, search, toast]);

  useEffect(() => { loadReports(); }, [loadReports]);
  useEffect(() => { loadExecutions(); }, [loadExecutions]);

  // Refs let us check current state synchronously without depending on React's
  // setState updater timing (which can be deferred in React 18 concurrent mode).
  const expandedRef = useRef<Set<number>>(new Set());
  const fetchedRef = useRef<Set<number>>(new Set());
  const inflightRef = useRef<Set<number>>(new Set());

  // Reset expansion + cached step details whenever we switch to a different funnel,
  // otherwise execution IDs from the previous funnel would block fetches here.
  useEffect(() => {
    expandedRef.current.clear();
    fetchedRef.current.clear();
    inflightRef.current.clear();
    setExpanded(new Set());
    setStepDetails(new Map());
  }, [funnelId]);

  const toggleExpand = useCallback(async (executionId: number) => {
    // Toggle expansion synchronously via ref, then sync to React state
    if (expandedRef.current.has(executionId)) {
      expandedRef.current.delete(executionId);
      setExpanded(new Set(expandedRef.current));
      return;
    }
    expandedRef.current.add(executionId);
    setExpanded(new Set(expandedRef.current));

    // Skip fetch if already loaded or another fetch is in flight for this id
    if (fetchedRef.current.has(executionId) || inflightRef.current.has(executionId)) return;

    inflightRef.current.add(executionId);
    try {
      const res = await apiFetch(`/api/admin/crm/funnels/${funnelId}/executions/${executionId}`).then(r => r.json());
      fetchedRef.current.add(executionId);
      setStepDetails(prev => {
        const next = new Map(prev);
        next.set(executionId, res.steps ?? []);
        return next;
      });
    } catch {
      toast({ title: "Failed to load steps", variant: "destructive" });
    } finally {
      inflightRef.current.delete(executionId);
    }
  }, [funnelId, toast]);

  const deleteExecution = async (executionId: number) => {
    if (!confirm("Delete this execution record? This cannot be undone.")) return;
    try {
      await apiFetch(`/api/admin/crm/funnels/${funnelId}/executions/${executionId}`, { method: "DELETE" });
      toast({ title: "Execution deleted" });
      loadExecutions();
      loadReports();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const funnel = stepReport?.funnel ?? emailReport?.funnel;

  // ── Derived KPIs ──
  const kpis = useMemo(() => {
    const totalExecs = stepReport?.totalExecutions ?? 0;
    const steps: any[] = stepReport?.steps ?? [];
    // average completion across non-trivial steps (entered > 0)
    const measured = steps.filter(s => s.entered > 0);
    const avgCompletion = measured.length > 0
      ? Math.round(measured.reduce((a, s) => a + s.completionRate, 0) / measured.length)
      : 0;
    const emailsSent = emailReport?.stats?.total ?? 0;
    const successRate = emailReport?.stats?.successRate ?? 0;
    return { totalExecs, avgCompletion, emailsSent, successRate, stepCount: steps.length };
  }, [stepReport, emailReport]);

  if (!funnelId) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-12">
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-amber-400 mb-3" />
          <p className="text-base font-medium text-foreground">Invalid funnel id</p>
          <p className="text-sm text-muted-foreground mt-1">The URL doesn't include a valid funnel reference.</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(executionsTotal / limit));
  const triggerLabel = funnel?.triggerType ? (TRIGGER_LABELS[funnel.triggerType] ?? funnel.triggerType) : "—";

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-6 space-y-6">
      {/* ── Hero Header Card ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Breadcrumb row */}
        <div className="px-6 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap bg-muted/10">
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap min-w-0">
            <Link href={`${adminBase}/crm?tab=automation`} className="hover:text-foreground cursor-pointer flex items-center gap-1 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />Automation Funnels
            </Link>
            <ChevronRight className="w-3 h-3 opacity-50" />
            <span className="text-foreground font-medium truncate max-w-[320px]">{funnel?.name ?? "Loading…"}</span>
            <ChevronRight className="w-3 h-3 opacity-50" />
            <span>Report</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`${adminBase}/crm?tab=automation&funnel=${funnelId}`)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />Edit Funnel
            </button>
            <button
              onClick={() => { loadReports(); loadExecutions(); }}
              disabled={reportLoading || executionsLoading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer disabled:opacity-50 text-muted-foreground hover:text-foreground transition-colors"
            >
              {reportLoading || executionsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
          </div>
        </div>

        {/* Title row */}
        <div className="px-6 py-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <Zap className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground truncate">
                {funnel?.name ?? "Loading…"}
              </h1>
              <PublishBadge status={funnel?.status} isActive={funnel?.isActive} />
            </div>
            <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground/70">Trigger:</span>
                <span className="text-foreground font-medium">{triggerLabel}</span>
              </span>
              <span className="opacity-30" aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground/70">Steps:</span>
                <span className="text-foreground font-medium">{kpis.stepCount}</span>
              </span>
              {funnel?.createdAt && (
                <>
                  <span className="opacity-30" aria-hidden="true">•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-muted-foreground/70">Created:</span>
                    <span className="text-foreground font-medium">{formatDate(funnel.createdAt)}</span>
                  </span>
                </>
              )}
              <span className="opacity-30" aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground/70">ID:</span>
                <span className="text-foreground font-medium font-mono">#{funnelId}</span>
              </span>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 border-t border-border divide-x divide-border">
          <Kpi
            icon={<Users className="w-4 h-4" />}
            label="Total Subscribers"
            value={formatNumber(kpis.totalExecs)}
            tone="blue"
          />
          <Kpi
            icon={<TrendingUp className="w-4 h-4" />}
            label="Avg Completion"
            value={`${kpis.avgCompletion}%`}
            tone="emerald"
          />
          <Kpi
            icon={<Send className="w-4 h-4" />}
            label="Emails Sent"
            value={formatNumber(kpis.emailsSent)}
            tone="violet"
          />
          <Kpi
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="Delivery Success"
            value={`${kpis.successRate}%`}
            tone="emerald"
          />
          <Kpi
            icon={<Clock className="w-4 h-4" />}
            label="Today"
            value={formatNumber(emailReport?.stats?.today ?? 0)}
            sublabel="emails sent"
            tone="amber"
          />
        </div>
      </div>

      {/* ── Tabs + Tab Content Card ──────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="border-b border-border px-2 flex items-center gap-1 overflow-x-auto">
          {[
            { id: "chart" as Tab, label: "Chart Report", icon: BarChart2 },
            { id: "step" as Tab, label: "Step Report", icon: Activity },
            { id: "emails" as Tab, label: "Email Analytics", icon: Mail },
          ].map(t => {
            const I = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px cursor-pointer transition-colors whitespace-nowrap ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <I className="w-4 h-4" />{t.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {tab === "chart" && <ChartReportPanel report={stepReport} loading={reportLoading} />}
          {tab === "step" && <StepReportPanel report={stepReport} loading={reportLoading} />}
          {tab === "emails" && <EmailsAnalyticsPanel report={emailReport} loading={reportLoading} onPreview={setEmailPreview} />}
        </div>
      </div>

      {/* ── Individual Reporting ─────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground leading-tight">Individual Reporting</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {executionsTotal > 0
                  ? `${executionsTotal.toLocaleString()} contact${executionsTotal === 1 ? "" : "s"} have entered this funnel`
                  : "No contacts yet"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
              className="text-xs px-3 py-2 rounded-md border border-border bg-background cursor-pointer hover:border-primary/40 transition-colors"
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <form onSubmit={submitSearch} className="flex items-center gap-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search by name or email…"
                  className="h-9 pl-8 pr-3 text-xs w-64"
                />
              </div>
            </form>
          </div>
        </div>

        {executionsLoading && executions.length === 0 ? (
          <div className="py-20 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading contacts…
          </div>
        ) : executions.length === 0 ? (
          <div className="py-20 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-foreground font-medium">No executions yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              When a contact triggers this automation, their journey will appear here with full step-by-step timeline.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-[11px] text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left w-8"></th>
                  <th className="px-4 py-3 text-left font-semibold">Contact</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Latest Action</th>
                  <th className="px-4 py-3 text-left font-semibold">Next Step</th>
                  <th className="px-4 py-3 text-left font-semibold">Last Activity</th>
                  <th className="px-4 py-3 text-left font-semibold">Started</th>
                  <th className="px-4 py-3 text-right font-semibold w-16">Actions</th>
                </tr>
              </thead>
              <tbody>
                {executions.map(row => {
                  const isOpen = expanded.has(row.id);
                  const steps = stepDetails.get(row.id) ?? [];
                  return (
                    <Fragment key={row.id}>
                      <tr className={`border-t border-border transition-colors ${isOpen ? "bg-muted/20" : "hover:bg-muted/15"}`}>
                        <td className="px-4 py-3 align-middle">
                          <button
                            onClick={() => toggleExpand(row.id)}
                            className="cursor-pointer text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                            title={isOpen ? "Collapse" : "Expand timeline"}
                          >
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                              {(row.userName ?? row.userEmail ?? "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate max-w-[200px]">{row.userName ?? "Unknown"}</div>
                              <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{row.userEmail ?? ""}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle"><StatusBadge status={row.status} /></td>
                        <td className="px-4 py-3 align-middle">
                          {row.latestActionLabel ? (
                            <span className="text-foreground text-xs truncate max-w-[200px] inline-block">{row.latestActionLabel}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {row.nextStepLabel ? (
                            <span className="text-foreground text-xs truncate max-w-[200px] inline-block">{row.nextStepLabel}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-xs" title="Completed">
                              <CheckCircle2 className="w-3.5 h-3.5" />Done
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle text-muted-foreground text-xs whitespace-nowrap">{timeAgo(row.lastExecutedAt)}</td>
                        <td className="px-4 py-3 align-middle text-muted-foreground text-xs whitespace-nowrap">{timeAgo(row.startedAt)}</td>
                        <td className="px-4 py-3 align-middle text-right">
                          <button
                            onClick={() => deleteExecution(row.id)}
                            className="inline-flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                            title="Delete execution"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-border bg-muted/10">
                          <td className="px-4 py-5"></td>
                          <td colSpan={7} className="px-4 py-5">
                            <div className="text-[11px] text-muted-foreground mb-4 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                              <Info className="w-3 h-3" />Step-by-step Timeline
                            </div>
                            <ol className="relative pl-1 space-y-5" aria-busy={steps.length === 0}>
                              {/* Continuous vertical line behind dots */}
                              <span aria-hidden="true" className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

                              {/* Entrance entry — funnel trigger event (only when funnel loaded) */}
                              {funnel?.name && (
                                <li className="relative pl-7 min-h-[1.75rem]">
                                  <span aria-hidden="true" className="absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full bg-card border-2 border-blue-500 flex items-center justify-center">
                                    <span className="w-1 h-1 rounded-full bg-blue-500" />
                                  </span>
                                  <div className="text-foreground text-sm font-medium leading-snug">
                                    Entrance ({funnel.name})
                                  </div>
                                  <div className="text-muted-foreground text-[11px] mt-1">{timeAgo(row.startedAt)}</div>
                                </li>
                              )}

                              {/* Step entries */}
                              {steps.length === 0 ? (
                                <li role="status" className="relative pl-7 text-xs text-muted-foreground flex items-center gap-2">
                                  <span aria-hidden="true" className="absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full bg-muted border-2 border-border" />
                                  <Loader2 aria-hidden="true" className="w-3 h-3 animate-spin" />Loading steps…
                                </li>
                              ) : steps.map((s: any) => {
                                const dotBg =
                                  s.status === "completed" ? "bg-emerald-500" :
                                  s.status === "failed" ? "bg-red-500" :
                                  s.status === "skipped" ? "bg-muted-foreground" :
                                  "bg-blue-500";
                                return (
                                  <li key={s.id} className="relative pl-7 min-h-[1.75rem]">
                                    <span aria-hidden="true" className={`absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full ${dotBg} ring-4 ring-card`} />
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-foreground text-sm font-medium leading-snug">{s.label}</span>
                                      <StatusBadge status={s.status} />
                                    </div>
                                    <div className="text-muted-foreground text-[11px] mt-1">
                                      {s.executedAt ? timeAgo(s.executedAt) : "Not yet executed"}
                                    </div>
                                    {s.errorMessage && (
                                      <div className="text-red-400 text-[11px] mt-1 truncate max-w-[600px]" title={s.errorMessage}>
                                        {s.errorMessage}
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {executionsTotal > 0 && (
          <div className="px-6 py-3 border-t border-border flex items-center justify-between flex-wrap gap-3 text-xs">
            <div className="text-muted-foreground">
              Showing <span className="text-foreground font-medium">{(page - 1) * limit + 1}–{Math.min(page * limit, executionsTotal)}</span> of <span className="text-foreground font-medium">{executionsTotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={e => { setLimit(parseInt(e.target.value)); setPage(1); }}
                className="px-2.5 py-1.5 rounded-md border border-border bg-background cursor-pointer hover:border-primary/40 transition-colors"
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="px-3 py-1.5 text-muted-foreground">
                  Page <span className="text-foreground font-medium">{page}</span> of <span className="text-foreground font-medium">{totalPages}</span>
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Email preview overlay */}
      {emailPreview !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Email Preview</h3>
              </div>
              <button onClick={() => setEmailPreview(null)} className="cursor-pointer text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/50 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 bg-muted/20">
              {emailPreview ? (
                <iframe srcDoc={emailPreview} sandbox="" className="w-full min-h-[520px] rounded-lg border border-border bg-white" title="email-preview" />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">Email body not available.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Reusable hero KPI tile ─────────────────────────────── */
function Kpi({ icon, label, value, sublabel, tone = "blue" }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: "blue" | "emerald" | "violet" | "amber" | "red";
}) {
  const toneMap: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10",
    emerald: "text-emerald-400 bg-emerald-500/10",
    violet: "text-violet-400 bg-violet-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    red: "text-red-400 bg-red-500/10",
  };
  return (
    <div className="px-5 py-4 flex items-center gap-3 hover:bg-muted/10 transition-colors">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${toneMap[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <div className="text-xl font-bold text-foreground leading-tight">{value}</div>
          {sublabel && <div className="text-[10px] text-muted-foreground">{sublabel}</div>}
        </div>
      </div>
    </div>
  );
}

/* ─── Chart Report Tab: bar chart + side panel ───────────── */
function ChartReportPanel({ report, loading }: { report: any; loading: boolean }) {
  if (loading && !report) {
    return <div className="py-16 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading chart…</div>;
  }
  const steps: any[] = report?.steps ?? [];
  const totalExecutions = report?.totalExecutions ?? 0;

  if (steps.length === 0) {
    return (
      <div className="py-16 text-center">
        <BarChart2 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">No steps configured</p>
        <p className="text-xs text-muted-foreground mt-1">Add steps to your funnel to see step-by-step analytics here.</p>
      </div>
    );
  }

  if (totalExecutions === 0) {
    return (
      <div className="py-16 text-center">
        <BarChart2 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">No contacts yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          Once contacts trigger this automation, you'll see step-by-step completion rates here.
        </p>
      </div>
    );
  }

  const data = steps.map(s => ({
    label: s.label.length > 22 ? s.label.slice(0, 22) + "…" : s.label,
    fullLabel: s.label,
    contacts: s.entered,
    completionRate: s.completionRate,
    completed: s.completed,
  }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Chart */}
      <div className="xl:col-span-8 min-w-0">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Step Performance</h4>
            <p className="text-xs text-muted-foreground mt-0.5">Contacts entering each step and their completion rate</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-teal-600" />
              <span className="text-muted-foreground">Contacts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-blue-400 rounded" />
              <span className="text-muted-foreground">Completion %</span>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={70}
            />
            <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(_, payload) => (payload?.[0]?.payload as any)?.fullLabel ?? ""}
              formatter={(value: any, name: any) => name === "completionRate" ? [`${value}%`, "Completion"] : [value, "Contacts"]}
            />
            <Bar yAxisId="left" dataKey="contacts" radius={[6, 6, 0, 0]} barSize={48}>
              {data.map((_, i) => (
                <Cell key={i} fill="hsl(178, 60%, 35%)" />
              ))}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="completionRate" stroke="hsl(210, 90%, 60%)" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(210, 90%, 60%)" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Right side: per-step quick summary */}
      <div className="xl:col-span-4 min-w-0">
        <div className="bg-muted/15 rounded-xl border border-border p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />Step Overview
          </h4>
          <div className="space-y-3">
            {steps.map((s, idx) => (
              <div key={s.stepId} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs text-foreground font-medium truncate" title={s.label}>{s.label}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    <span className="text-foreground font-semibold">{s.completed}</span>
                    <span className="opacity-50"> / {s.entered}</span>
                  </span>
                </div>
                <div className="relative h-1.5 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all"
                    style={{ width: `${s.completionRate}%` }}
                  />
                </div>
                <div className="flex items-center justify-end text-[10px] text-muted-foreground">
                  {s.completionRate}% completion
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step Report Tab: donut chart cards ─────────────────── */
function StepReportPanel({ report, loading }: { report: any; loading: boolean }) {
  if (loading && !report) {
    return <div className="py-16 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>;
  }
  const steps: any[] = report?.steps ?? [];
  const totalExecutions: number = report?.totalExecutions ?? 0;
  if (steps.length === 0) {
    return (
      <div className="py-16 text-center">
        <Activity className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">No steps configured</p>
      </div>
    );
  }

  // Build cards: synthetic "Entrance" tile first, then one per real step.
  const cards: Array<{
    key: string; label: string; entered: number; completed: number; failed: number; completionRate: number; isEntrance?: boolean;
  }> = [
    {
      key: "__entrance",
      label: "Entrance",
      entered: totalExecutions,
      completed: totalExecutions,
      failed: 0,
      completionRate: totalExecutions > 0 ? 100 : 0,
      isEntrance: true,
    },
    ...steps.map((s: any) => ({
      key: String(s.stepId),
      label: s.label,
      entered: s.entered,
      completed: s.completed,
      failed: s.failed,
      completionRate: s.completionRate,
    })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Step-by-step Breakdown</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{totalExecutions.toLocaleString()} total execution{totalExecutions === 1 ? "" : "s"} across all steps</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map(({ key, ...rest }) => <StepDonutCard key={key} {...rest} />)}
      </div>
    </div>
  );
}

/* ─── Single donut card showing completion + failure breakdown ─── */
function StepDonutCard({
  label, entered, completed, failed, completionRate, isEntrance,
}: {
  label: string; entered: number; completed: number; failed: number; completionRate: number; isEntrance?: boolean;
}) {
  // Clamp the failure rate so success + failure never exceeds 100% of the ring's
  // circumference, even if upstream data is inconsistent (e.g., retries inflating counts).
  const rawFailRate = entered > 0 ? Math.round((failed / entered) * 100) : 0;
  const failRate = Math.max(0, Math.min(rawFailRate, 100 - completionRate));
  const hasFailure = failed > 0 && failRate > 0;

  // Donut geometry
  const size = 132;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const successLen = Math.max(0, Math.min(C, C * (completionRate / 100)));
  const failLen = Math.max(0, Math.min(C, C * (failRate / 100)));

  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center hover:border-primary/40 transition-colors">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 overflow-visible">
          {/* Background ring */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
          />
          {/* Success arc (completion%) */}
          {completionRate > 0 && (
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke="hsl(245, 75%, 62%)"
              strokeWidth={stroke}
              strokeDasharray={`${successLen} ${C}`}
              strokeDashoffset={0}
              strokeLinecap={completionRate >= 100 ? "butt" : "round"}
            />
          )}
          {/* Failure arc, rendered after success */}
          {hasFailure && (
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke="hsl(0, 78%, 60%)"
              strokeWidth={stroke}
              strokeDasharray={`${failLen} ${C}`}
              strokeDashoffset={-successLen}
              strokeLinecap="round"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold text-foreground tabular-nums">{completionRate}%</span>
        </div>
      </div>

      <div className="mt-4 text-sm font-semibold text-foreground line-clamp-2 min-h-[2.5rem] flex items-center" title={label}>
        {isEntrance ? (
          <span className="inline-flex items-center gap-1.5"><LogIn className="w-3.5 h-3.5 text-primary" />{label}</span>
        ) : label}
      </div>

      <div className="mt-3 flex items-center gap-1.5 flex-wrap justify-center">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-[11px] text-muted-foreground"
          title={`${entered.toLocaleString()} contact${entered === 1 ? "" : "s"} entered`}
        >
          <Users className="w-3 h-3" />{entered.toLocaleString()}
        </span>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 text-[11px] text-primary font-medium"
          title={`${completed.toLocaleString()} completed (${completionRate}%)`}
        >
          {completionRate}%
        </span>
        {hasFailure && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-red-500/30 bg-red-500/10 text-[11px] text-red-400 font-medium"
            title={`${failed.toLocaleString()} failed (${failRate}%)`}
          >
            <ArrowDown className="w-3 h-3" />{failRate}%
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Emails Analytics Tab ───────────────────────────────── */
function EmailsAnalyticsPanel({ report, loading, onPreview }: { report: any; loading: boolean; onPreview: (html: string) => void }) {
  if (loading && !report) {
    return <div className="py-16 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>;
  }
  const stats = report?.stats;
  const daily: any[] = report?.daily ?? [];
  const recent: any[] = report?.recent ?? [];

  if (!stats || stats.total === 0) {
    return (
      <div className="py-16 text-center">
        <Mail className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">No emails sent yet</p>
        <p className="text-xs text-muted-foreground mt-1">When this funnel sends an email, analytics will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top stats — 4 columns at desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Sent" value={stats.total.toLocaleString()} icon={<Mail className="w-4 h-4" />} tone="blue" />
        <StatCard label="Delivered" value={stats.sent.toLocaleString()} icon={<CheckCircle2 className="w-4 h-4" />} tone="emerald" />
        <StatCard label="Failed" value={stats.failed.toLocaleString()} icon={<XCircle className="w-4 h-4" />} tone="red" />
        <StatCard label="Success Rate" value={`${stats.successRate}%`} icon={<TrendingUp className="w-4 h-4" />} tone="violet" />
      </div>

      {/* Time-based stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open Rate" value={stats.openRate != null ? `${stats.openRate}%` : "—"} icon={<MailOpen className="w-4 h-4" />} tone="blue" />
        <StatCard label="Clicked" value={stats.clicked != null ? stats.clicked.toLocaleString() : "—"} icon={<MousePointerClick className="w-4 h-4" />} tone="violet" />
        <StatCard label="Unsubscribed" value={stats.unsubscribed != null ? stats.unsubscribed.toLocaleString() : "—"} icon={<UserMinus className="w-4 h-4" />} tone="red" />
        <StatCard label="Unique Recipients" value={stats.uniqueRecipients.toLocaleString()} icon={<Users className="w-4 h-4" />} tone="amber" />
      </div>

      {/* Daily chart */}
      {daily.length > 0 && (
        <div className="bg-muted/10 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Last 7 Days Activity</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Daily email send volume by status</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                <span className="text-muted-foreground">Delivered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500" />
                <span className="text-muted-foreground">Failed</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="sent" stackId="a" fill="hsl(142, 70%, 45%)" />
              <Bar dataKey="failed" stackId="a" fill="hsl(0, 70%, 55%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent activity */}
      {recent.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/15 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Recent Activity</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Last 25 emails dispatched by this funnel</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/10 text-[11px] text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Recipient</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Subject</th>
                  <th className="px-4 py-2.5 text-left font-semibold w-24">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold w-32">When</th>
                  <th className="px-4 py-2.5 text-right font-semibold w-16">Preview</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r: any) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/15 transition-colors">
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-[11px] font-semibold text-primary flex-shrink-0">
                          {(r.userName ?? r.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-foreground font-medium text-xs truncate max-w-[160px]">{r.userName ?? "—"}</div>
                          <div className="text-muted-foreground text-[11px] truncate max-w-[160px]">{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle text-foreground text-xs truncate max-w-[300px]">{r.subject}</td>
                    <td className="px-4 py-3 align-middle"><StatusBadge status={r.status === "sent" ? "completed" : "failed"} /></td>
                    <td className="px-4 py-3 align-middle text-muted-foreground text-xs whitespace-nowrap">{timeAgo(r.sentAt)}</td>
                    <td className="px-4 py-3 align-middle text-right">
                      <button
                        onClick={() => onPreview(r.htmlBody ?? "")}
                        className="inline-flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer transition-colors"
                        title="Preview email"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report?.note && (
        <div className="text-[11px] text-muted-foreground flex items-start gap-1.5 px-1">
          <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />{report.note}
        </div>
      )}
    </div>
  );
}

/* ─── Polished stat card with colored icon tile ──────────── */
function StatCard({ label, value, icon, tone = "blue" }: {
  label: string;
  value: any;
  icon: React.ReactNode;
  tone?: "blue" | "emerald" | "violet" | "amber" | "red";
}) {
  const toneMap: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10",
    emerald: "text-emerald-400 bg-emerald-500/10",
    violet: "text-violet-400 bg-violet-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    red: "text-red-400 bg-red-500/10",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${toneMap[tone]}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
