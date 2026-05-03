import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ShoppingCart, Clock, CheckCircle2, XCircle, TrendingUp,
  ChevronLeft, ChevronRight, Filter,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Sale {
  id: number;
  courseTitle: string | null;
  bundleName: string | null;
  saleAmount: number;
  commissionAmount: number;
  commissionPercent: number;
  status: string;
  payoutId: number | null;
  createdAt: string;
}

interface DashboardTotals {
  totals: { lifetimeEarnings: number; pending: number; paid: number; salesCount: number };
}

async function fetchSales(page: number, status: string): Promise<{ rows: Sale[]; total: number; pageSize: number }> {
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (status !== "all") params.set("status", status);
  const res = await fetch(`${API_BASE}/api/creator/sales?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load sales");
  return res.json();
}

async function fetchDashboard(): Promise<DashboardTotals> {
  const res = await fetch(`${API_BASE}/api/creator/dashboard`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS_TABS = [
  { value: "all",       label: "All",        icon: Filter },
  { value: "earned",    label: "Pending",    icon: Clock },
  { value: "paid",      label: "Paid",       icon: CheckCircle2 },
  { value: "cancelled", label: "Cancelled",  icon: XCircle },
];

export default function CreatorSalesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const { data, isLoading } = useQuery({
    queryKey: ["creator-sales", page, status],
    queryFn: () => fetchSales(page, status),
  });
  const { data: dash } = useQuery({ queryKey: ["creator-dashboard"], queryFn: fetchDashboard });
  const totals = dash?.totals;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-5 md:p-6">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Sales & Commissions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every sale that earned you a commission. 25% of each sale is split equally across the courses involved.
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={ShoppingCart} color="blue"   label="Total Sales"        value={`${totals?.salesCount ?? "—"}`}        sub="All-time count" />
        <StatCard icon={TrendingUp}   color="green"  label="Lifetime Earnings"  value={totals ? fmt(totals.lifetimeEarnings) : "—"} sub="Net of cancellations" />
        <StatCard icon={Clock}        color="amber"  label="Pending Payout"     value={totals ? fmt(totals.pending) : "—"}    sub="Awaiting next cycle" />
        <StatCard icon={CheckCircle2} color="violet" label="Already Paid"       value={totals ? fmt(totals.paid) : "—"}       sub="Released to bank" />
      </div>

      {/* Filter tab bar */}
      <div className="bg-card border border-border rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto">
        {STATUS_TABS.map(t => (
          <TabBtn
            key={t.value}
            active={status === t.value}
            icon={t.icon}
            onClick={() => { setStatus(t.value); setPage(1); }}
          >
            {t.label}
          </TabBtn>
        ))}
      </div>

      {/* Ledger card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !data || data.rows.length === 0 ? (
          <div className="py-12 text-center">
            <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No commission rows for this filter.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/20">
                    <th className="py-3 px-4 font-medium">Date</th>
                    <th className="py-3 px-4 font-medium">Course / Bundle</th>
                    <th className="py-3 px-4 font-medium text-right">Your sale share</th>
                    <th className="py-3 px-4 font-medium text-right">Rate</th>
                    <th className="py-3 px-4 font-medium text-right">Commission</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Payout Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" })}
                        <div className="text-[10px] text-muted-foreground/70">
                          {new Date(s.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-[260px]">
                        <div className="truncate font-medium">{s.courseTitle ?? s.bundleName ?? "—"}</div>
                        {s.bundleName && s.courseTitle && (
                          <div className="text-[10px] text-muted-foreground">via {s.bundleName}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">{fmt(s.saleAmount)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono">{s.commissionPercent}%</span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-foreground">{fmt(s.commissionAmount)}</td>
                      <td className="py-3 px-4"><SaleStatusPill status={s.status} /></td>
                      <td className="py-3 px-4"><PayoutStatusPill status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between p-4 border-t border-border bg-muted/10">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{(page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)}</span> of <span className="font-semibold text-foreground">{data.total}</span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  className="w-8 h-8 rounded-md border border-border bg-background hover:bg-muted flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 text-xs font-medium tabular-nums">Page {page} / {totalPages}</span>
                <button
                  className="w-8 h-8 rounded-md border border-border bg-background hover:bg-muted flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────── shared helpers (mirrors dashboard) ─────────────── */
function StatCard({
  icon: Icon, color, label, value, sub,
}: {
  icon: LucideIcon;
  color: "green" | "amber" | "blue" | "violet";
  label: string;
  value: string;
  sub?: string;
}) {
  const colorMap: Record<string, string> = {
    green:  "text-green-400  bg-green-500/10  border-green-500/30",
    amber:  "text-amber-400  bg-amber-500/10  border-amber-500/30",
    blue:   "text-blue-400   bg-blue-500/10   border-blue-500/30",
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${colorMap[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="mt-3 text-xl md:text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground/70 mt-1">{sub}</div>}
    </div>
  );
}

function TabBtn({
  active, onClick, icon: Icon, children,
}: {
  active: boolean; onClick: () => void; icon?: LucideIcon; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

function SaleStatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    earned:    { cls: "bg-green-500/10 text-green-400 border-green-500/30", label: "Earned" },
    paid:      { cls: "bg-green-500/10 text-green-400 border-green-500/30", label: "Paid" },
    cancelled: { cls: "bg-red-500/10   text-red-400   border-red-500/30",   label: "Cancelled" },
  };
  const m = map[status] ?? { cls: "bg-muted text-muted-foreground border-border", label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${m.cls}`}>
      {m.label}
    </span>
  );
}

function PayoutStatusPill({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-muted text-muted-foreground border-border">
        —
      </span>
    );
  }
  const isPaid = status === "paid";
  const cls = isPaid
    ? "bg-green-500/10 text-green-400 border-green-500/30"
    : "bg-amber-500/10 text-amber-400 border-amber-500/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {isPaid ? "Paid" : "Pending"}
    </span>
  );
}
