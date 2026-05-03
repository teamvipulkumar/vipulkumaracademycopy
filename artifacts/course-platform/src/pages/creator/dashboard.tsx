import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Wallet, Clock, CheckCircle2, TrendingUp, TrendingDown, Sparkles,
  ArrowUpRight, AlertTriangle, ShieldCheck, BookOpen, Calendar, IndianRupee,
} from "lucide-react";
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DashboardData {
  creator: { id: number; name: string; status: string; kycStatus: string; hasBank: boolean };
  totals: {
    lifetimeEarnings: number;
    pending: number;
    paid: number;
    salesCount: number;
    thisMonth: number;
    thisMonthSales: number;
    lastMonth: number;
    growthPct: number;
  };
  chart: Array<{ date: string; amount: number; sales: number }>;
  topCourses: Array<{ courseId: number | null; title: string; earnings: number; sales: number }>;
  nextPayout: { date: string; amount: number };
  recentSales: Array<{
    id: number;
    courseTitle: string | null;
    bundleName: string | null;
    saleAmount: number;
    commissionAmount: number;
    status: string;
    createdAt: string;
  }>;
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch(`${API_BASE}/api/creator/dashboard`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load dashboard");
  return res.json();
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtCompact = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n.toFixed(0)}`;

export default function CreatorDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["creator-dashboard"], queryFn: fetchDashboard });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-muted rounded-2xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-muted rounded-xl" />)}
          </div>
          <div className="h-72 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }
  if (!data) return <div className="p-6">No data</div>;

  const { creator, totals, recentSales } = data;
  const chart = data.chart ?? [];
  const topCourses = data.topCourses ?? [];
  const nextPayout = data.nextPayout ?? { date: new Date().toISOString(), amount: totals.pending };
  const kycOk = creator.kycStatus === "approved";
  const bankOk = !!creator.hasBank;
  const showSetupBanner = !kycOk || !bankOk;
  const nextPayoutDate = new Date(nextPayout.date);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* ── Hero header ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-5 md:p-6">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Welcome back, {creator.name.split(" ")[0]} 👋
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Here's how your courses are performing.
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            creator.status === "active"
              ? "bg-green-500/10 text-green-400 border-green-500/40"
              : "bg-red-500/10 text-red-400 border-red-500/40"
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            {creator.status === "active" ? "Active" : "Revoked"}
          </span>
        </div>
      </div>

      {/* ── Setup-needed banner (only if KYC or bank missing) ── */}
      {showSetupBanner && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-semibold">Finish your setup to receive payouts</p>
            <p className="text-xs text-muted-foreground">
              {!kycOk && !bankOk ? "Complete KYC and add bank/UPI details — both are required."
                : !kycOk ? "Your KYC is not approved yet — payouts will be on hold."
                : "Add your bank or UPI details so we can release your payouts."}
            </p>
          </div>
          <Link
            href="/creator/kyc"
            className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-amber-950 text-xs font-semibold cursor-pointer transition-colors"
          >
            Complete now →
          </Link>
        </div>
      )}

      {/* ── Stat cards (4) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={TrendingUp} color="green"
          label="Lifetime Earnings" value={fmt(totals.lifetimeEarnings)}
          sub={`${totals.salesCount} total sale${totals.salesCount === 1 ? "" : "s"}`}
        />
        <StatCard
          icon={Clock} color="amber"
          label="Pending" value={fmt(totals.pending)}
          sub="Awaiting payout"
        />
        <StatCard
          icon={CheckCircle2} color="blue"
          label="Paid Out" value={fmt(totals.paid)}
          sub="All-time received"
        />
        <StatCard
          icon={Wallet} color="violet"
          label="This Month" value={fmt(totals.thisMonth)}
          trend={totals.growthPct}
          sub={`${totals.thisMonthSales} sale${totals.thisMonthSales === 1 ? "" : "s"} this month`}
        />
      </div>

      {/* ── Earnings chart + Next payout side panel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold">Earnings — Last 30 days</h2>
              <p className="text-[11px] text-muted-foreground">Daily commission earned (excludes cancelled).</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">{fmt(chart.reduce((a, c) => a + c.amount, 0))}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">30-day total</div>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="creatorEarn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="creatorEarnBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#4169E1" stopOpacity={1} />
                    <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.9} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(d: string) => {
                    const dt = new Date(d);
                    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                  }}
                  interval={Math.floor(chart.length / 6)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => fmtCompact(v)}
                  width={50}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.25 }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  formatter={(v: number, name: string) => {
                    if (name === "Trend") return [fmt(v), "Trend"];
                    if (name === "Earned") return [fmt(v), "Earned"];
                    return [v, name];
                  }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                />
                <Area type="monotone" dataKey="amount" name="Trend" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#creatorEarn)" />
                <Bar dataKey="amount" name="Earned" fill="url(#creatorEarnBar)" radius={[3, 3, 0, 0]} maxBarSize={22} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Next payout card */}
        <div className="bg-gradient-to-br from-primary/10 via-card to-card border border-border rounded-xl p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Next Payout Cycle</span>
          </div>
          <div className="text-3xl font-bold mb-1 flex items-baseline gap-1">
            <IndianRupee className="w-5 h-5 text-muted-foreground" />
            {nextPayout.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Releases automatically on{" "}
            <span className="text-foreground font-semibold">
              {nextPayoutDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
            </span>
          </p>
          <div className="mt-auto space-y-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              {kycOk
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
              KYC {kycOk ? "approved" : "pending"}
            </div>
            <div className="flex items-center gap-1.5">
              {bankOk
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
              Bank / UPI {bankOk ? "added" : "missing"}
            </div>
          </div>
          <Link
            href="/creator/payouts"
            className="mt-3 w-full px-3 py-2 rounded-md bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            View payout history <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* ── Top courses + Recent sales (two-column) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Top courses */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Top performing courses</h2>
            </div>
            <Link href="/creator/courses" className="text-[11px] text-primary hover:underline cursor-pointer">
              View all →
            </Link>
          </div>
          {topCourses.length === 0 ? (
            <EmptyState text="No course earnings in the last 90 days." />
          ) : (
            <ul className="space-y-2.5">
              {topCourses.map((c, i) => {
                const max = Math.max(...topCourses.map(x => x.earnings), 1);
                const pct = (c.earnings / max) * 100;
                return (
                  <li key={c.courseId ?? i} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-md bg-muted text-[10px] font-bold flex items-center justify-center text-muted-foreground shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium truncate">{c.title}</span>
                      </div>
                      <span className="text-sm font-semibold whitespace-nowrap">{fmt(c.earnings)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground">{c.sales} sale{c.sales === 1 ? "" : "s"}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Recent sales */}
        <div className="lg:col-span-3 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Recent commissions</h2>
            </div>
            <Link href="/creator/sales" className="text-[11px] text-primary hover:underline cursor-pointer">
              View all →
            </Link>
          </div>
          {recentSales.length === 0 ? (
            <EmptyState text="No sales yet — your courses will earn commissions automatically." />
          ) : (
            <div className="overflow-x-auto -mx-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border">
                    <th className="py-2 px-4 font-medium">Date</th>
                    <th className="py-2 px-4 font-medium">Course</th>
                    <th className="py-2 px-4 font-medium text-right">Commission</th>
                    <th className="py-2 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="py-2.5 px-4 truncate max-w-[200px]">
                        {s.courseTitle ?? s.bundleName ?? "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold">{fmt(s.commissionAmount)}</td>
                      <td className="py-2.5 px-4">
                        <SaleStatusPill status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── helpers ─────────────── */
function StatCard({
  icon: Icon, color, label, value, sub, trend,
}: {
  icon: any;
  color: "green" | "amber" | "blue" | "violet";
  label: string;
  value: string;
  sub?: string;
  trend?: number;
}) {
  const colorMap: Record<string, string> = {
    green:  "text-green-400  bg-green-500/10  border-green-500/30",
    amber:  "text-amber-400  bg-amber-500/10  border-amber-500/30",
    blue:   "text-blue-400   bg-blue-500/10   border-blue-500/30",
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  };
  const trendUp = (trend ?? 0) >= 0;
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        {typeof trend === "number" && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            trendUp ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}>
            {trendUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="mt-3 text-xl md:text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground/70 mt-1">{sub}</div>}
    </div>
  );
}

function SaleStatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    earned:    "bg-amber-500/10 text-amber-400 border-amber-500/30",
    paid:      "bg-green-500/10 text-green-400 border-green-500/30",
    cancelled: "bg-red-500/10   text-red-400   border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${styles[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {status}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-8 text-xs text-muted-foreground">{text}</div>
  );
}
