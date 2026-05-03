import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  UserPlus, ChevronRight, ShieldOff, ShieldCheck, Sparkles, Search,
  Users, ShieldAlert, Wallet, CheckCircle2, PlayCircle, Eye, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminBase } from "@/lib/auth-context";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─────────────── Types ─────────────── */
interface Creator {
  id: number;
  userId: number;
  name: string;
  email: string;
  status: "active" | "revoked";
  kycStatus: "pending" | "approved" | "rejected" | null;
  notes: string | null;
  createdAt: string;
  totalEarnings: number;
  pendingAmount: number;
  courseCount: number;
  panName: string | null;
  panNumber: string | null;
  panFrontUrl: string | null;
  kycReviewedAt: string | null;
  phone: string | null;
}

interface Payout {
  id: number;
  creatorId: number;
  creatorName: string;
  creatorEmail: string;
  amount: number;
  status: "pending" | "paid" | "failed" | "cancelled";
  releaseDate: string | null;
  paidAt: string | null;
  releasedBy: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdAt: string;
}

interface CreatorDetail {
  creator: {
    id: number; userId: number; name: string; email: string;
    status: string; notes: string | null; createdAt: string;
    kyc: {
      panName: string | null; panNumber: string | null; panFrontUrl: string | null;
      idProofUrl: string | null; addressProofUrl: string | null;
      status: string | null; adminNote: string | null; reviewedAt: string | null;
    };
    bank: {
      accountHolderName: string | null; accountNumber: string | null;
      ifscCode: string | null; bankName: string | null; upiId: string | null;
    };
  };
}

/* ─────────────── Helpers ─────────────── */
async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function fmt(n: number) {
  return `₹${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "paid" || s === "active" || s === "approved") return "default";
  if (s === "failed" || s === "cancelled" || s === "rejected" || s === "revoked") return "destructive";
  return "secondary";
}

/* ─────────────── Main page ─────────────── */
export default function AdminCreatorsPage() {
  const [tab, setTab] = useState<"all" | "kyc" | "payouts">("all");

  const { data: creators } = useQuery<Creator[]>({
    queryKey: ["admin-creators"],
    queryFn: () => apiFetch("/api/admin/creators"),
  });

  /* Stat cards (computed from creators list) */
  const stats = useMemo(() => {
    const list = creators ?? [];
    return {
      total: list.length,
      active: list.filter(c => c.status === "active").length,
      pendingKyc: list.filter(c => c.kycStatus === "pending").length,
      pendingPayouts: list.reduce((s, c) => s + (c.pendingAmount || 0), 0),
      lifetimeEarned: list.reduce((s, c) => s + (c.totalEarnings || 0), 0),
    };
  }, [creators]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Creators</h1>
            <p className="text-sm text-muted-foreground">
              Manage external course creators, review their KYC, and release commission payouts.
              Each creator earns 25% of every sale of their assigned courses.
            </p>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} color="blue" label="Active Creators" value={`${stats.active}`} sub={`${stats.total} total`} />
        <StatCard icon={ShieldAlert} color="amber" label="Pending KYC" value={`${stats.pendingKyc}`} sub="Awaiting review" />
        <StatCard icon={Wallet} color="amber" label="Pending Payouts" value={fmt(stats.pendingPayouts)} sub="Across all creators" />
        <StatCard icon={CheckCircle2} color="green" label="Lifetime Earned" value={fmt(stats.lifetimeEarned)} sub="All creators combined" />
      </div>

      {/* ── Tab bar (affiliate-style icon pill nav inside a card) ── */}
      <div className="bg-card border border-border rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto">
        <TabBtn active={tab === "all"} onClick={() => setTab("all")} icon={Users}>
          All Creators {stats.total > 0 && <span className="opacity-80">({stats.total})</span>}
        </TabBtn>
        <TabBtn active={tab === "kyc"} onClick={() => setTab("kyc")} icon={ShieldCheck}>
          KYC Review
          {stats.pendingKyc > 0 && (
            <span className={`ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold ${
              tab === "kyc" ? "bg-white/20 text-white" : "bg-amber-400/20 text-amber-400"
            }`}>
              {stats.pendingKyc}
            </span>
          )}
        </TabBtn>
        <TabBtn active={tab === "payouts"} onClick={() => setTab("payouts")} icon={Wallet}>
          Payouts
        </TabBtn>
      </div>

      {/* ── Tab content ── */}
      {tab === "all" && <AllCreatorsTab creators={creators} />}
      {tab === "kyc" && <KycReviewTab creators={creators ?? []} />}
      {tab === "payouts" && <PayoutsTab />}
    </div>
  );
}

/* ─────────────── Stat card ─────────────── */
function StatCard({
  icon: Icon, color, label, value, sub,
}: {
  icon: any; color: "blue" | "amber" | "green" | "red"; label: string; value: string; sub?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    amber: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    green: "text-green-400 bg-green-400/10 border-green-400/20",
    red: "text-red-400 bg-red-400/10 border-red-400/20",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-md border flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ─────────────── Tab button (icon pill, fills primary when active) ─────────────── */
function TabBtn({
  active, onClick, icon: Icon, children,
}: {
  active: boolean; onClick: () => void; icon?: any; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      <span className="flex items-center gap-1">{children}</span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
 * TAB 1 — All Creators (list + add + revoke)
 * ═══════════════════════════════════════════════════════════ */
function AllCreatorsTab({ creators }: { creators: Creator[] | undefined }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const base = useAdminBase();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ email: "", notes: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "revoked">("all");

  const filtered = useMemo(() => {
    const list = creators ?? [];
    const s = search.trim().toLowerCase();
    return list.filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (s && !c.name.toLowerCase().includes(s) && !c.email.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [creators, search, statusFilter]);

  const addMut = useMutation({
    mutationFn: (payload: { email: string; notes: string }) =>
      apiFetch("/api/admin/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({ title: "Creator added", description: "User is now flagged as a creator." });
      qc.invalidateQueries({ queryKey: ["admin-creators"] });
      setModalOpen(false);
      setForm({ email: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "active" | "revoked" }) =>
      apiFetch(`/api/admin/creators/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_d, vars) => {
      toast({ title: vars.status === "revoked" ? "Creator revoked" : "Creator restored" });
      qc.invalidateQueries({ queryKey: ["admin-creators"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar: search + filter + add */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {(["all", "active", "revoked"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 text-xs rounded capitalize transition-colors cursor-pointer ${
                statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button onClick={() => setModalOpen(true)} size="sm">
          <UserPlus className="w-4 h-4 mr-2" />
          Add Creator
        </Button>
      </div>

      {/* Table card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {creators === undefined ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {creators.length === 0 ? "No creators yet. Click 'Add Creator' to mark an existing user." : "No creators match your filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2.5 px-3">Name / Email</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">KYC</th>
                  <th className="py-2.5 px-3 text-right">Courses</th>
                  <th className="py-2.5 px-3 text-right">Lifetime</th>
                  <th className="py-2.5 px-3 text-right">Pending</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="py-2.5 px-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {c.status === "active" ? (
                        <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/50">
                          Active
                        </span>
                      ) : (
                        <Badge variant={statusVariant(c.status)} className="capitalize">{c.status}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant={statusVariant(c.kycStatus ?? "")} className="capitalize">
                        {c.kycStatus ?? "not submitted"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right">{c.courseCount}</td>
                    <td className="py-2.5 px-3 text-right">{fmt(c.totalEarnings)}</td>
                    <td className="py-2.5 px-3 text-right text-amber-400">{fmt(c.pendingAmount)}</td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          title={c.status === "active" ? "Revoke" : "Restore"}
                          onClick={() => toggleMut.mutate({ id: c.id, status: c.status === "active" ? "revoked" : "active" })}
                          disabled={toggleMut.isPending}
                        >
                          {c.status === "active" ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        </Button>
                        <Link href={`${base}/creators/${c.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 px-2" title="View detail">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Creator modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Creator</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="email">User Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="creator@example.com"
              />
              <p className="text-[11px] text-muted-foreground mt-1">User must already be registered. They'll get creator panel access on next login.</p>
            </div>
            <div>
              <Label htmlFor="notes">Internal Notes (optional)</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addMut.mutate({ email: form.email.trim(), notes: form.notes.trim() })}
              disabled={!form.email.trim() || addMut.isPending}
            >
              {addMut.isPending ? "Adding…" : "Add Creator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * TAB 2 — KYC Review (affiliate-style table with All/Pending/Approved/Rejected pills)
 * ═══════════════════════════════════════════════════════════ */
function KycReviewTab({ creators }: { creators: Creator[] }) {
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [sub, setSub] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null);

  /* Only show creators who have actually submitted KYC (kycStatus !== null) */
  const submitted = useMemo(
    () => creators.filter(c => c.kycStatus !== null),
    [creators],
  );

  const buckets = useMemo(() => ({
    all: submitted,
    pending: submitted.filter(c => c.kycStatus === "pending"),
    approved: submitted.filter(c => c.kycStatus === "approved"),
    rejected: submitted.filter(c => c.kycStatus === "rejected"),
  }), [submitted]);

  const filtered = useMemo(() => {
    const list = buckets[sub];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(c =>
      c.name.toLowerCase().includes(s) ||
      c.email.toLowerCase().includes(s) ||
      (c.panName ?? "").toLowerCase().includes(s) ||
      (c.panNumber ?? "").toLowerCase().includes(s) ||
      (c.phone ?? "").toLowerCase().includes(s)
    );
  }, [buckets, sub, search]);

  const statusBadge = (s: string | null) => {
    if (s === "approved") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-400/15 text-green-400 border border-green-400/30">Approved</span>;
    if (s === "rejected") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-400/15 text-red-400 border border-red-400/30">Rejected</span>;
    if (s === "pending") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-400/15 text-amber-400 border border-amber-400/30">Pending</span>;
    return <span className="text-xs text-muted-foreground">—</span>;
  };

  return (
    <div className="space-y-4">
      {/* Search bar (full width) */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, phone or PAN number…"
          className="pl-9"
        />
      </div>

      {/* Status pills: All / Pending / Approved / Rejected (with counts) */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: "all", label: "All" },
          { key: "pending", label: "Pending" },
          { key: "approved", label: "Approved" },
          { key: "rejected", label: "Rejected" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSub(key)}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors cursor-pointer ${
              sub === key
                ? "bg-primary text-primary-foreground font-medium"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {label} ({buckets[key].length})
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">
              {submitted.length === 0
                ? "No KYC submissions yet"
                : search
                  ? "No matches"
                  : `No ${sub === "all" ? "" : sub} KYC entries`}
            </p>
            <p className="text-xs text-muted-foreground">
              {submitted.length === 0
                ? "Creators will appear here once they submit their KYC."
                : search
                  ? "Try adjusting your search."
                  : "Switch tabs to see other statuses."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-3 px-4">Creator</th>
                  <th className="py-3 px-4">Name as Per PAN</th>
                  <th className="py-3 px-4">PAN Number</th>
                  <th className="py-3 px-4">PAN Photo</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const dateStr = (c.kycReviewedAt ?? c.createdAt);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-3 px-4">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.email}</div>
                        {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                      </td>
                      <td className="py-3 px-4 font-medium">{c.panName ?? "—"}</td>
                      <td className="py-3 px-4 font-mono text-xs">{c.panNumber ?? "—"}</td>
                      <td className="py-3 px-4">
                        {c.panFrontUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightbox({ url: c.panFrontUrl!, title: `${c.name} · PAN Card` })}
                            className="group relative inline-block w-14 h-10 rounded border border-border overflow-hidden hover:border-primary hover:ring-2 hover:ring-primary/30 bg-muted transition-all cursor-pointer"
                            title="Click to preview"
                          >
                            <img src={c.panFrontUrl} alt="PAN" className="w-full h-full object-cover" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Eye className="w-3.5 h-3.5 text-white" />
                            </span>
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="py-3 px-4">{statusBadge(c.kycStatus)}</td>
                      <td className="py-3 px-4 text-right">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setReviewId(c.id)}>
                          <Eye className="w-3.5 h-3.5 mr-1.5" />
                          {c.kycStatus === "pending" ? "Review" : "View"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewId !== null && (
        <KycReviewDialog id={reviewId} onClose={() => setReviewId(null)} />
      )}

      {/* In-page PAN photo lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{lightbox?.title ?? "PAN Card"}</DialogTitle>
          </DialogHeader>
          {lightbox && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border overflow-hidden bg-muted/30 flex items-center justify-center">
                <img
                  src={lightbox.url}
                  alt="PAN card"
                  className="max-h-[70vh] w-auto object-contain"
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[11px] text-muted-foreground truncate flex-1 mr-3">{lightbox.url}</p>
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline whitespace-nowrap"
                >
                  Open in new tab ↗
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* KYC review modal — fetches detail + lets admin approve/reject */
function KycReviewDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("approved");
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery<CreatorDetail>({
    queryKey: ["admin-creator-detail", id],
    queryFn: () => apiFetch(`/api/admin/creators/${id}`),
  });

  /* Pre-fill status & note once detail loads (so re-review of approved/rejected
     creators starts with their existing decision, not a blank approval). */
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (data && !prefilled) {
      const cur = data.creator.kyc.status;
      if (cur === "approved" || cur === "rejected") setStatus(cur);
      if (data.creator.kyc.adminNote) setNote(data.creator.kyc.adminNote);
      setPrefilled(true);
    }
  }, [data, prefilled]);

  const patchMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/creators/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycStatus: status, kycAdminNote: note }),
      }),
    onSuccess: () => {
      toast({ title: status === "approved" ? "KYC approved" : "KYC rejected" });
      qc.invalidateQueries({ queryKey: ["admin-creators"] });
      qc.invalidateQueries({ queryKey: ["admin-creator-detail", id] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const c = data?.creator;
  const kyc = c?.kyc;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review KYC{c ? ` · ${c.name}` : ""}</DialogTitle>
        </DialogHeader>

        {isLoading || !c || !kyc ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div><span className="text-xs text-muted-foreground">Name (as per PAN)</span><div className="font-medium">{kyc.panName || "—"}</div></div>
              <div><span className="text-xs text-muted-foreground">PAN Number</span><div className="font-mono font-medium">{kyc.panNumber || "—"}</div></div>
            </div>

            <div>
              <Label className="text-xs">PAN Card (front)</Label>
              {kyc.panFrontUrl ? (
                <a href={kyc.panFrontUrl} target="_blank" rel="noreferrer" className="block mt-2 border border-border rounded-md overflow-hidden hover:opacity-90">
                  <img src={kyc.panFrontUrl} alt="PAN front" className="max-h-72 w-full object-contain bg-muted" />
                </a>
              ) : (
                <div className="text-sm text-muted-foreground mt-2">— not uploaded</div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">Click image to open full size in new tab</p>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div>
                <Label>Decision</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approve</SelectItem>
                    <SelectItem value="rejected">Reject</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Admin Note {status === "rejected" && <span className="text-destructive">*</span>}
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    {status === "rejected"
                      ? "(required, ≥5 chars — visible to creator)"
                      : "(optional)"}
                  </span>
                </Label>
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder={status === "rejected" ? "e.g. PAN image is blurry, please re-upload a clearer photo." : ""}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant={status === "rejected" ? "destructive" : "default"}
            onClick={() => {
              if (status === "rejected" && note.trim().length < 5) {
                toast({ title: "Reason required", description: "Add a rejection reason of at least 5 characters.", variant: "destructive" });
                return;
              }
              patchMut.mutate();
            }}
            disabled={patchMut.isPending || !c}
          >
            {patchMut.isPending ? "Saving…" : status === "approved" ? "Approve KYC" : "Reject KYC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════
 * TAB 3 — Payouts (release / mark paid / status filters)
 * ═══════════════════════════════════════════════════════════ */
function PayoutsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [sub, setSub] = useState<"pending" | "paid" | "failed" | "all">("pending");
  const [markDialog, setMarkDialog] = useState<Payout | null>(null);
  const [markForm, setMarkForm] = useState({ status: "paid", paymentMethod: "bank", paymentReference: "", notes: "" });

  const { data: payouts, isLoading } = useQuery<Payout[]>({
    queryKey: ["admin-creator-payouts", sub],
    queryFn: () => apiFetch(`/api/admin/creator-payouts${sub === "all" ? "" : `?status=${sub}`}`),
  });

  const releaseMut = useMutation({
    mutationFn: () => apiFetch("/api/admin/creator-payouts/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }),
    onSuccess: (data: { payoutCount: number; totalAmount: number }) => {
      toast({ title: "Payouts released", description: `${data.payoutCount} payout(s) totalling ${fmt(data.totalAmount)}` });
      qc.invalidateQueries({ queryKey: ["admin-creator-payouts"] });
      qc.invalidateQueries({ queryKey: ["admin-creators"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const runCycleMut = useMutation({
    mutationFn: () => apiFetch("/api/admin/creator-payouts/run-cycle", { method: "POST" }),
    onSuccess: (data: { ran: boolean; payoutIds?: number[]; reason?: string }) => {
      toast({
        title: data.ran ? "Saturday cycle ran" : "Cycle skipped",
        description: data.ran ? `${data.payoutIds?.length ?? 0} payout(s) created` : (data.reason ?? "Already ran today"),
      });
      qc.invalidateQueries({ queryKey: ["admin-creator-payouts"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markMut = useMutation({
    mutationFn: (vars: { id: number; payload: typeof markForm }) =>
      apiFetch(`/api/admin/creator-payouts/${vars.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars.payload),
      }),
    onSuccess: () => {
      toast({ title: "Payout updated" });
      qc.invalidateQueries({ queryKey: ["admin-creator-payouts"] });
      qc.invalidateQueries({ queryKey: ["admin-creators"] });
      setMarkDialog(null);
      setMarkForm({ status: "paid", paymentMethod: "bank", paymentReference: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar: status sub-tabs + action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {(["pending", "paid", "failed", "all"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSub(s)}
              className={`px-2.5 py-1 text-xs rounded capitalize transition-colors cursor-pointer ${
                sub === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => runCycleMut.mutate()} disabled={runCycleMut.isPending}>
          <PlayCircle className="w-4 h-4 mr-2" />
          Run Saturday Cycle
        </Button>
        <Button size="sm" onClick={() => releaseMut.mutate()} disabled={releaseMut.isPending}>
          <Wallet className="w-4 h-4 mr-2" />
          Release All Pending
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !payouts || payouts.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No payouts in this tab.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2.5 px-3">Creator</th>
                  <th className="py-2.5 px-3">Released</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">By</th>
                  <th className="py-2.5 px-3">Reference</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map(p => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="py-2.5 px-3">
                      <div className="font-medium">{p.creatorName}</div>
                      <div className="text-xs text-muted-foreground">{p.creatorEmail}</div>
                    </td>
                    <td className="py-2.5 px-3 text-xs">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="py-2.5 px-3 text-right font-semibold">{fmt(p.amount)}</td>
                    <td className="py-2.5 px-3"><Badge variant={statusVariant(p.status)} className="capitalize">{p.status}</Badge></td>
                    <td className="py-2.5 px-3 text-xs">{p.releasedBy ?? "—"}</td>
                    <td className="py-2.5 px-3 text-xs font-mono">{p.paymentReference ?? "—"}</td>
                    <td className="py-2.5 px-3 text-right">
                      {p.status === "pending" && (
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setMarkDialog(p)}>Mark…</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mark-payout dialog */}
      <Dialog open={!!markDialog} onOpenChange={(o) => !o && setMarkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Payout · {markDialog?.creatorName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Status</Label>
              <Select value={markForm.status} onValueChange={v => setMarkForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={markForm.paymentMethod} onValueChange={v => setMarkForm(f => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="manual">Other / Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transaction Reference</Label>
              <Input value={markForm.paymentReference} onChange={e => setMarkForm(f => ({ ...f, paymentReference: e.target.value }))} placeholder="UTR / txn id" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={markForm.notes} onChange={e => setMarkForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkDialog(null)}>Cancel</Button>
            <Button
              onClick={() => markDialog && markMut.mutate({ id: markDialog.id, payload: markForm })}
              disabled={markMut.isPending}
            >
              {markMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
