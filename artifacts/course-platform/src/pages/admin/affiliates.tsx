import { useState, useEffect, useCallback, Fragment } from "react";
import { ViewProfileDialog } from "./users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Users, DollarSign, Clock, CheckCircle2, XCircle, AlertCircle,
  Search, Eye, MessageSquare, ShieldCheck,
  Ban, RotateCcw, Percent, Loader2, Plus, Trash2, Download,
  Settings, FileText, CreditCard, BadgeIndianRupee, BarChart3,
  Shield, Image, Edit2, Save, X, Calendar, ChevronDown, ChevronUp
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
async function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${API_BASE}${path}`, { credentials: "include", ...opts });
}

/* ── Types ── */
type Affiliate = {
  applicationId: number;
  userId: number;
  name: string;
  email: string;
  referralCode: string | null;
  role: string;
  isBlocked: boolean;
  commissionOverride: number | null;
  commissionGroupId: number | null;
  commissionGroupName: string | null;
  commissionGroupRate: number | null;
  approvedAt: string | null;
  totalClicks: number;
  totalConversions: number;
  totalEarnings: number;
  pendingPayout: number;
  paidOut: number;
  kycStatus: string;
};

type CommissionGroup = {
  id: number;
  name: string;
  description: string | null;
  commissionRate: number;
  affiliateCount: number;
};

type Application = {
  id: number;
  userId: number;
  fullName: string;
  email: string;
  promoteDescription: string;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
  userRole: string;
  enrollments: { courseId: number; courseTitle: string }[];
  purchases: {
    id: number;
    amount: string | number;
    courseId: number | null;
    courseTitle: string | null;
    bundleId: number | null;
    bundleName: string | null;
    createdAt: string;
    gateway: string | null;
  }[];
};

type Payout = {
  id: number;
  userId: number;
  amount: number;
  paymentMethod: string;
  paymentDetails: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  requestedAt: string;
  processedAt: string | null;
  userName: string;
  userEmail: string;
  bankName: string | null;
  accountNumber: string | null;
};

type KycRecord = {
  id: number;
  userId: number;
  idProofName: string | null;
  panNumber: string | null;
  addressProofName: string | null;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  userName: string;
  userEmail: string;
  userPhone: string | null;
};

type Creative = {
  id: number;
  title: string;
  type: "image" | "banner" | "text" | "link";
  url: string | null;
  content: string | null;
  headline: string | null;
  description: string | null;
  createdAt: string;
};

type AffSettings = {
  commissionRate: number;
  affiliateEnabled: boolean;
  affiliateCookieDays: number;
  affiliateMinPayout: number;
  payoutPeriodDays: number;
  payoutWeekDay: number | null;
};

type ScheduledPayout = {
  affiliateId: number;
  name: string;
  email: string;
  phone: string | null;
  panNumber: string | null;
  kycStatus: string | null;
  bank: { accountHolderName: string; accountNumber: string; ifscCode: string; bankName: string } | null;
  totalEarned: number;
  totalPaidOut: number;
  unpaidAmount: number;
  lastPayoutDate: string | null;
  nextDueDate: string | null;
  isDue: boolean;
  payoutPeriodDays: number;
  latestAction: { id: number; status: string; amount: number; note: string | null; date: string | null } | null;
};

/* ── Status helpers ── */
const STATUS = {
  pending:  { label: "Pending",  cls: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  approved: { label: "Approved", cls: "text-green-400 border-green-400/30 bg-green-400/10" },
  rejected: { label: "Rejected", cls: "text-red-400  border-red-400/30  bg-red-400/10" },
  hold:     { label: "On Hold",  cls: "text-blue-400  border-blue-400/30  bg-blue-400/10" },
  not_submitted: { label: "Not Submitted", cls: "text-muted-foreground border-border bg-card" },
} as const;

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? STATUS.not_submitted;
  return <Badge className={`text-[10px] ${s.cls}`}>{s.label}</Badge>;
}

function fmt(n: number) { return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

/* ══════════════════════════════════════════
   TAB 1 — Overview: Manage Affiliates
══════════════════════════════════════════ */
function OverviewTab() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [groups, setGroups] = useState<CommissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assigningGroup, setAssigningGroup] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [affRes, grpRes] = await Promise.all([
        apiFetch("/api/affiliate/admin/all-affiliates"),
        apiFetch("/api/affiliate/admin/commission-groups"),
      ]);
      if (affRes.ok) setAffiliates(await affRes.json());
      if (grpRes.ok) setGroups(await grpRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = affiliates.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalEarnings = affiliates.reduce((s, a) => s + a.totalEarnings, 0);
  const totalPending = affiliates.reduce((s, a) => s + a.pendingPayout, 0);
  const blocked = affiliates.filter(a => a.isBlocked).length;

  const doBlock = async (appId: number, block: boolean) => {
    setActionLoading(`block-${appId}`);
    try {
      const res = await apiFetch(`/api/affiliate/admin/affiliates/${appId}/${block ? "block" : "unblock"}`, { method: "POST" });
      if (res.ok) { toast({ title: block ? "Affiliate blocked" : "Affiliate unblocked" }); load(); }
      else toast({ title: "Action failed", variant: "destructive" });
    } finally { setActionLoading(null); }
  };

  const doAssignGroup = async (appId: number, groupId: number | null) => {
    setActionLoading(`grp-${appId}`);
    try {
      const res = await apiFetch(`/api/affiliate/admin/affiliates/${appId}/commission-group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (res.ok) { toast({ title: groupId ? "Group assigned" : "Group removed" }); setAssigningGroup(null); load(); }
      else toast({ title: "Failed to assign group", variant: "destructive" });
    } finally { setActionLoading(null); }
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Affiliates", value: affiliates.length, color: "text-blue-400", icon: <Users className="w-4 h-4" /> },
          { label: "Total Earned", value: fmt(totalEarnings), color: "text-green-400", icon: <BadgeIndianRupee className="w-4 h-4" /> },
          { label: "Pending Payouts", value: fmt(totalPending), color: "text-amber-400", icon: <Clock className="w-4 h-4" /> },
          { label: "Blocked", value: blocked, color: "text-red-400", icon: <Ban className="w-4 h-4" /> },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">{s.icon}<span className="text-xs">{s.label}</span></div>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search affiliate…" className="pl-8 bg-card border-border h-8 text-sm" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-card rounded animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl py-16 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No approved affiliates yet</p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet table — unchanged from original */}
          <div className="hidden md:block border border-border rounded-xl overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[950px]">
              <thead className="bg-card border-b border-border">
                <tr>{["Affiliate", "Code", "Clicks", "Conv.", "Earned", "Pending", "KYC", "Group", "Status", "Actions"].map(h =>
                  <th key={h} className="text-left text-xs font-medium text-muted-foreground px-3 py-3 whitespace-nowrap">{h}</th>
                )}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(a => (
                  <tr key={a.userId} className={`hover:bg-card/50 transition-colors ${a.isBlocked ? "opacity-60" : ""}`}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-sm">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-primary whitespace-nowrap">{a.referralCode ?? "—"}</td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap">{a.totalClicks}</td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap">{a.totalConversions}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-green-400 whitespace-nowrap">{fmt(a.totalEarnings)}</td>
                    <td className="px-3 py-3 text-sm text-amber-400 whitespace-nowrap">{fmt(a.pendingPayout)}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><StatusBadge status={a.kycStatus} /></td>
                    {/* Group */}
                    <td className="px-3 py-3">
                      {assigningGroup === a.applicationId ? (
                        <div className="flex items-center gap-1">
                          <select
                            defaultValue={String(a.commissionGroupId ?? "")}
                            onChange={e => {
                              const val = e.target.value === "" ? null : parseInt(e.target.value);
                              doAssignGroup(a.applicationId, val);
                            }}
                            className="h-6 text-xs bg-background border border-border rounded px-1 text-foreground"
                          >
                            <option value="">No group</option>
                            {groups.map(g => (
                              <option key={g.id} value={String(g.id)}>{g.name} ({g.commissionRate}%)</option>
                            ))}
                          </select>
                          <button onClick={() => setAssigningGroup(null)} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {a.commissionGroupId ? (
                            <Badge className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20 gap-0.5">
                              <Percent className="w-2.5 h-2.5" />{a.commissionGroupName} · {a.commissionGroupRate}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                          <button onClick={() => setAssigningGroup(a.applicationId)} className="text-muted-foreground hover:text-primary cursor-pointer">
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {a.isBlocked
                        ? <Badge className="text-[10px] text-red-400 border-red-400/30 bg-red-400/10">Blocked</Badge>
                        : <Badge className="text-[10px] text-green-400 border-green-400/30 bg-green-400/10">Active</Badge>
                      }
                    </td>
                    {/* Actions */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!actionLoading}
                        onClick={() => doBlock(a.applicationId, !a.isBlocked)}
                        className={`h-6 text-[10px] gap-1 ${a.isBlocked ? "border-green-500/30 text-green-400 hover:bg-green-500/10" : "border-red-500/30 text-red-400 hover:bg-red-500/10"}`}
                      >
                        {actionLoading === `block-${a.applicationId}` ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : a.isBlocked ? <RotateCcw className="w-2.5 h-2.5" /> : <Ban className="w-2.5 h-2.5" />}
                        {a.isBlocked ? "Unblock" : "Block"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list — only renders below md */}
          <div className="md:hidden space-y-3">
            {filtered.map(a => (
              <div key={a.userId} className={`bg-card border border-border rounded-xl p-3.5 space-y-3 ${a.isBlocked ? "opacity-60" : ""}`}>
                {/* Top: name + status badges */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">{a.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{a.email}</p>
                    {a.referralCode && (
                      <p className="text-[11px] font-mono text-primary mt-0.5">{a.referralCode}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {a.isBlocked
                      ? <Badge className="text-[10px] text-red-400 border-red-400/30 bg-red-400/10">Blocked</Badge>
                      : <Badge className="text-[10px] text-green-400 border-green-400/30 bg-green-400/10">Active</Badge>
                    }
                    <StatusBadge status={a.kycStatus} />
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs border-y border-border py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Clicks</span>
                    <span className="font-medium">{a.totalClicks}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Conversions</span>
                    <span className="font-medium">{a.totalConversions}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Earned</span>
                    <span className="font-semibold text-green-400">{fmt(a.totalEarnings)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-semibold text-amber-400">{fmt(a.pendingPayout)}</span>
                  </div>
                </div>

                {/* Group + Actions row */}
                <div className="flex flex-wrap items-center gap-2">
                  {assigningGroup === a.applicationId ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <select
                        defaultValue={String(a.commissionGroupId ?? "")}
                        onChange={e => {
                          const val = e.target.value === "" ? null : parseInt(e.target.value);
                          doAssignGroup(a.applicationId, val);
                        }}
                        className="h-7 text-xs bg-background border border-border rounded px-2 text-foreground flex-1 min-w-0"
                      >
                        <option value="">No group</option>
                        {groups.map(g => (
                          <option key={g.id} value={String(g.id)}>{g.name} ({g.commissionRate}%)</option>
                        ))}
                      </select>
                      <button onClick={() => setAssigningGroup(null)} className="text-muted-foreground hover:text-foreground cursor-pointer p-1"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAssigningGroup(a.applicationId)}
                      className="flex items-center gap-1.5 cursor-pointer hover:bg-background/50 rounded-md px-1.5 py-0.5 transition-colors"
                    >
                      {a.commissionGroupId ? (
                        <Badge className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20 gap-0.5">
                          <Percent className="w-2.5 h-2.5" />{a.commissionGroupName} · {a.commissionGroupRate}%
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">No group</span>
                      )}
                      <Edit2 className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!actionLoading}
                    onClick={() => doBlock(a.applicationId, !a.isBlocked)}
                    className={`ml-auto h-7 text-[11px] gap-1 ${a.isBlocked ? "border-green-500/30 text-green-400 hover:bg-green-500/10" : "border-red-500/30 text-red-400 hover:bg-red-500/10"}`}
                  >
                    {actionLoading === `block-${a.applicationId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : a.isBlocked ? <RotateCcw className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                    {a.isBlocked ? "Unblock" : "Block"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB 2 — Applications
══════════════════════════════════════════ */
function AppCard({ app, commissionGroups, onAction }: { app: Application; commissionGroups: CommissionGroup[]; onAction: () => void }) {
  const [expanded, setExpanded] = useState(app.status === "pending");
  const [note, setNote] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const { toast } = useToast();
  const meta = STATUS[app.status];

  const approve = async () => {
    setLoading("approve");
    try {
      const body: Record<string, any> = {};
      if (selectedGroupId) body.commissionGroupId = parseInt(selectedGroupId);
      const res = await apiFetch(`/api/affiliate/admin/applications/${app.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const groupName = commissionGroups.find(g => String(g.id) === selectedGroupId)?.name;
      toast({ title: "Application approved", description: groupName ? `Assigned to "${groupName}" group` : undefined });
      onAction();
    } catch { toast({ title: "Failed to approve", variant: "destructive" }); }
    finally { setLoading(null); }
  };

  const reject = async () => {
    if (!note.trim()) { toast({ title: "Admin note required to reject", variant: "destructive" }); return; }
    setLoading("reject");
    try {
      const res = await apiFetch(`/api/affiliate/admin/applications/${app.id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNote: note }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Application rejected" });
      onAction();
    } catch { toast({ title: "Failed to reject", variant: "destructive" }); }
    finally { setLoading(null); }
  };

  const enrollments = app.enrollments ?? [];
  const purchases = app.purchases ?? [];

  return (
    <>
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {app.fullName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{app.fullName}</p>
            <Badge className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
            {purchases.length > 0 && (
              <Badge className="text-[10px] text-blue-400 border-blue-400/30 bg-blue-400/10 gap-1">
                <CreditCard className="w-2.5 h-2.5" />{purchases.length} purchase{purchases.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{app.email} · Applied {fmtDate(app.createdAt)}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer flex-shrink-0 h-7 px-2 sm:px-2.5 text-xs"
          onClick={() => setShowProfile(true)}
          title="View Profile"
        >
          <Eye className="w-3 h-3" /><span className="hidden sm:inline">View Profile</span>
        </Button>
        <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground flex-shrink-0 cursor-pointer">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border p-4 bg-background/30 space-y-4">

          {/* Promotion Plan */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><MessageSquare className="w-3 h-3" />Promotion Plan</p>
            <p className="text-sm text-foreground leading-relaxed bg-background border border-border rounded-lg p-3">{app.promoteDescription}</p>
          </div>

          {/* Admin note from rejection */}
          {app.adminNote && (
            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <p className="text-xs font-medium text-red-400 mb-1">Admin Note:</p>
              <p className="text-sm text-muted-foreground">{app.adminNote}</p>
            </div>
          )}

          {/* Action section for pending */}
          {app.status === "pending" && (
            <div className="space-y-3 pt-1 border-t border-border">
              {/* Commission group assignment */}
              {commissionGroups.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><Percent className="w-3 h-3" />Assign to Commission Group (optional)</p>
                  <select
                    value={selectedGroupId}
                    onChange={e => setSelectedGroupId(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                  >
                    <option value="">— Use platform default rate —</option>
                    {commissionGroups.map(g => (
                      <option key={g.id} value={String(g.id)}>{g.name} ({g.commissionRate}%)</option>
                    ))}
                  </select>
                </div>
              )}
              <Textarea
                placeholder="Admin note (required for rejection)…"
                value={note} onChange={e => setNote(e.target.value)}
                rows={2} className="bg-background border-border resize-none text-sm"
              />
              <div className="flex gap-2">
                <Button onClick={approve} disabled={!!loading} size="sm" className="bg-green-500 hover:bg-green-600 text-white gap-1.5">
                  {loading === "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Approve
                </Button>
                <Button onClick={reject} disabled={!!loading} size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5">
                  {loading === "reject" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}Reject
                </Button>
              </div>
            </div>
          )}
          {app.status !== "pending" && app.reviewedAt && (
            <p className="text-xs text-muted-foreground">Reviewed {fmtDate(app.reviewedAt)}</p>
          )}
        </div>
      )}
    </div>
    {showProfile && <ViewProfileDialog userId={app.userId} onClose={() => setShowProfile(false)} />}
    </>
  );
}

function ApplicationsTab() {
  const [apps, setApps] = useState<Application[]>([]);
  const [commissionGroups, setCommissionGroups] = useState<CommissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, groupsRes] = await Promise.all([
        apiFetch("/api/affiliate/admin/applications"),
        apiFetch("/api/affiliate/admin/commission-groups"),
      ]);
      if (appsRes.ok) setApps(await appsRes.json());
      if (groupsRes.ok) setCommissionGroups(await groupsRes.json());
    } catch { toast({ title: "Failed to load", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = apps.filter(a =>
    (filter === "all" || a.status === filter) &&
    (!search || a.fullName.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase()))
  );

  const counts = { all: apps.length, pending: 0, approved: 0, rejected: 0 };
  apps.forEach(a => { counts[a.status]++; });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: "pending", label: "Pending", color: "text-amber-400" },
          { key: "approved", label: "Approved", color: "text-green-400" },
          { key: "rejected", label: "Rejected", color: "text-red-400" },
          { key: "all", label: "Total", color: "text-foreground" },
        ].map(s => (
          <div key={s.key} className="bg-card border border-border rounded-xl p-3 sm:p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => setFilter(s.key as typeof filter)}>
            <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{counts[s.key as keyof typeof counts]}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <div className="relative flex-1 sm:min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" className="pl-8 bg-card border-border h-8 text-sm" />
        </div>
        <div className="overflow-x-auto scrollbar-thin -mx-1 px-1 sm:mx-0 sm:px-0 sm:overflow-visible">
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5 w-max sm:w-auto">
            {(["pending", "approved", "rejected", "all"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${filter === f ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-card rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl py-16 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No applications found</p>
          <p className="text-sm text-muted-foreground mt-1">{search || filter !== "all" ? "Try changing the filters." : "No one has applied yet."}</p>
        </div>
      ) : (
        <div className="space-y-3">{filtered.map(app => <AppCard key={app.id} app={app} commissionGroups={commissionGroups} onAction={load} />)}</div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB 3 — Payouts
══════════════════════════════════════════ */
function AffiliateProfileModal({
  payout, onClose, actionLoading, rejectState, onRejectStateChange, onAction,
}: {
  payout: ScheduledPayout;
  onClose: () => void;
  actionLoading: string | null;
  rejectState: { open: boolean; note: string; holdOpen: boolean; holdNote: string };
  onRejectStateChange: (s: { open: boolean; note: string; holdOpen: boolean; holdNote: string }) => void;
  onAction: (affiliateId: number, action: "paid" | "hold" | "reject", note?: string) => void;
}) {
  const isHold     = payout.latestAction?.status === "hold";
  const isPaid     = payout.latestAction?.status === "approved" && payout.unpaidAmount <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-semibold text-sm">{payout.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{payout.email}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="px-5 py-4 space-y-4">
          {/* Earnings summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-background rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Total Earned</p>
              <p className="text-sm font-bold text-foreground">{fmt(payout.totalEarned)}</p>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Paid Out</p>
              <p className="text-sm font-bold text-foreground">{fmt(payout.totalPaidOut)}</p>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Unpaid</p>
              <p className="text-sm font-bold text-green-400">{fmt(payout.unpaidAmount)}</p>
            </div>
          </div>

          {/* Profile details */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Profile</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              <div><span className="text-muted-foreground">Phone: </span>
                {payout.phone ? <span>{payout.phone}</span> : <span className="text-muted-foreground/50">Not provided</span>}
              </div>
              <div>
                <span className="text-muted-foreground">PAN: </span>
                {payout.panNumber
                  ? <><span className="font-mono tracking-widest">{payout.panNumber}</span>
                      {payout.kycStatus && <span className={`ml-1.5 text-[10px] ${payout.kycStatus === "approved" ? "text-green-400" : "text-amber-400"}`}>({payout.kycStatus})</span>}
                    </>
                  : <span className="text-muted-foreground/50">—</span>}
              </div>
              <div><span className="text-muted-foreground">Period: </span><span>Every {payout.payoutPeriodDays} day{payout.payoutPeriodDays !== 1 ? "s" : ""}</span></div>
              {payout.lastPayoutDate && <div><span className="text-muted-foreground">Last paid: </span><span>{fmtDate(payout.lastPayoutDate)}</span></div>}
              {payout.nextDueDate    && <div><span className="text-muted-foreground">Next due: </span><span>{fmtDate(payout.nextDueDate)}</span></div>}
            </div>
          </div>

          {/* Bank details */}
          {payout.bank ? (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bank Details</p>
              <div className="bg-background rounded-lg p-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                <div><span className="text-muted-foreground">Holder: </span><span>{payout.bank.accountHolderName}</span></div>
                <div><span className="text-muted-foreground">Bank: </span><span>{payout.bank.bankName}</span></div>
                <div><span className="text-muted-foreground">A/C No: </span><span className="font-mono">{payout.bank.accountNumber}</span></div>
                <div><span className="text-muted-foreground">IFSC: </span><span className="font-mono">{payout.bank.ifscCode}</span></div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />No bank details on file
            </p>
          )}

          {payout.latestAction?.note && (
            <p className="text-xs text-muted-foreground border-t border-border pt-3">
              <span className="font-medium">Admin note: </span>{payout.latestAction.note}
            </p>
          )}

          {/* Action buttons */}
          {!isPaid && (
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { onAction(payout.affiliateId, "paid"); onClose(); }} disabled={!!actionLoading} size="sm"
                  className="bg-green-500 hover:bg-green-600 text-white gap-1.5 h-8 text-xs">
                  {actionLoading === `paid-${payout.affiliateId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Mark as Paid
                </Button>
                {!isHold && (
                  <Button onClick={() => onRejectStateChange({ ...rejectState, holdOpen: !rejectState.holdOpen, open: false })} disabled={!!actionLoading} size="sm" variant="outline"
                    className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 gap-1.5 h-8 text-xs">
                    {actionLoading === `hold-${payout.affiliateId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                    Hold
                  </Button>
                )}
                <Button onClick={() => onRejectStateChange({ ...rejectState, open: !rejectState.open, holdOpen: false })}
                  disabled={!!actionLoading} size="sm" variant="outline"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5 h-8 text-xs">
                  <XCircle className="w-3 h-3" />Reject
                </Button>
              </div>
              {/* Hold note input */}
              {rejectState.holdOpen && (
                <div className="flex items-center gap-2">
                  <Input value={rejectState.holdNote} onChange={e => onRejectStateChange({ ...rejectState, holdNote: e.target.value })}
                    placeholder="Hold reason (optional)..." className="bg-background border-blue-500/30 h-8 text-xs flex-1" autoFocus />
                  <Button onClick={() => { onAction(payout.affiliateId, "hold", rejectState.holdNote || undefined); onClose(); }}
                    disabled={!!actionLoading} size="sm"
                    className="bg-blue-500 hover:bg-blue-600 text-white h-8 text-xs gap-1 flex-shrink-0">
                    {actionLoading === `hold-${payout.affiliateId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                    Confirm
                  </Button>
                  <button onClick={() => onRejectStateChange({ ...rejectState, holdOpen: false, holdNote: "" })} className="text-muted-foreground hover:text-foreground flex-shrink-0 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {/* Reject note input */}
              {rejectState.open && (
                <div className="flex items-center gap-2">
                  <Input value={rejectState.note} onChange={e => onRejectStateChange({ ...rejectState, note: e.target.value })}
                    placeholder="Rejection reason (required)..." className="bg-background border-red-500/30 h-8 text-xs flex-1" autoFocus />
                  <Button onClick={() => { onAction(payout.affiliateId, "reject", rejectState.note); onClose(); }}
                    disabled={!!actionLoading || !rejectState.note.trim()} size="sm"
                    className="bg-red-500 hover:bg-red-600 text-white h-8 text-xs gap-1 flex-shrink-0">
                    {actionLoading === `reject-${payout.affiliateId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                    Confirm
                  </Button>
                  <button onClick={() => onRejectStateChange({ ...rejectState, open: false, note: "" })} className="text-muted-foreground hover:text-foreground flex-shrink-0 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
          {isPaid && (
            <div className="border-t border-border pt-3 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              <p className="text-xs text-green-400 font-medium">Paid on {payout.latestAction?.date ? fmtDate(payout.latestAction.date) : "—"}</p>
            </div>
          )}
          {isHold && (
            <div className="border-t border-border pt-3 flex flex-wrap items-center gap-2">
              <p className="text-xs text-blue-400 flex-1">⏸ On hold{payout.latestAction?.note ? `: ${payout.latestAction.note}` : ""}</p>
              <Button onClick={() => { onAction(payout.affiliateId, "paid"); onClose(); }} disabled={!!actionLoading} size="sm"
                className="bg-green-500 hover:bg-green-600 text-white gap-1.5 h-8 text-xs">
                {actionLoading === `paid-${payout.affiliateId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Mark as Paid
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScheduledPayoutCard({
  payout, actionLoading, rejectState, onRejectStateChange, onView, onAction,
}: {
  payout: ScheduledPayout;
  actionLoading: string | null;
  rejectState: { open: boolean; note: string; holdOpen: boolean; holdNote: string };
  onRejectStateChange: (s: { open: boolean; note: string; holdOpen: boolean; holdNote: string }) => void;
  onView: () => void;
  onAction: (affiliateId: number, action: "paid" | "hold" | "reject", note?: string) => void;
}) {
  const isHold = payout.latestAction?.status === "hold";
  const isPaid = payout.latestAction?.status === "approved" && payout.unpaidAmount <= 0;
  const isRejected = payout.latestAction?.status === "rejected";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="p-4 flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${isPaid ? "bg-green-400" : isHold ? "bg-blue-400" : isRejected ? "bg-red-400" : payout.isDue ? "bg-amber-400" : "bg-muted-foreground/40"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">{payout.name}</p>
                {isPaid    && <Badge className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">Paid</Badge>}
                {isHold    && <Badge className="text-[10px] bg-blue-500/10  text-blue-400  border-blue-500/20">On Hold</Badge>}
                {isRejected && <Badge className="text-[10px] bg-red-500/10   text-red-400   border-red-500/20">Rejected</Badge>}
                {!isPaid && !isHold && !isRejected && payout.isDue  && <Badge className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">Due Now</Badge>}
                {!isPaid && !isHold && !isRejected && !payout.isDue && <Badge className="text-[10px] bg-muted text-muted-foreground border-border">Upcoming</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{payout.email}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <p className="text-lg font-bold text-green-400">{fmt(payout.unpaidAmount)}</p>
                <p className="text-[10px] text-muted-foreground">unpaid</p>
              </div>
              <Button onClick={onView} size="sm" variant="outline"
                className="h-7 text-xs px-2.5 gap-1 border-border text-muted-foreground hover:text-foreground">
                <Eye className="w-3 h-3" />View
              </Button>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {payout.lastPayoutDate && <span>Last paid: {fmtDate(payout.lastPayoutDate)}</span>}
            {payout.nextDueDate    && <span>Next due: {fmtDate(payout.nextDueDate)}</span>}
          </div>
        </div>
      </div>

      {/* Action bar — shown when not paid */}
      {!isPaid && (
        <div className="border-t border-border px-4 py-3 flex flex-wrap items-center gap-2 bg-card/30">
          <Button onClick={() => onAction(payout.affiliateId, "paid")} disabled={!!actionLoading} size="sm"
            className="bg-green-500 hover:bg-green-600 text-white gap-1.5 h-7 text-xs">
            {actionLoading === `paid-${payout.affiliateId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Mark as Paid
          </Button>
          {!isHold && (
            <Button
              onClick={() => onRejectStateChange({ ...rejectState, holdOpen: !rejectState.holdOpen, open: false })}
              disabled={!!actionLoading} size="sm" variant="outline"
              className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 gap-1.5 h-7 text-xs">
              {actionLoading === `hold-${payout.affiliateId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
              Hold
            </Button>
          )}
          <Button onClick={() => onRejectStateChange({ ...rejectState, open: !rejectState.open, holdOpen: false })}
            disabled={!!actionLoading} size="sm" variant="outline"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5 h-7 text-xs">
            <XCircle className="w-3 h-3" />Reject
          </Button>
          {/* Hold note input */}
          {rejectState.holdOpen && (
            <div className="w-full flex items-center gap-2 mt-1">
              <Input value={rejectState.holdNote} onChange={e => onRejectStateChange({ ...rejectState, holdNote: e.target.value })}
                placeholder="Hold reason (optional)..." className="bg-background border-blue-500/30 h-7 text-xs flex-1" autoFocus />
              <Button onClick={() => onAction(payout.affiliateId, "hold", rejectState.holdNote || undefined)}
                disabled={!!actionLoading} size="sm"
                className="bg-blue-500 hover:bg-blue-600 text-white h-7 text-xs gap-1 flex-shrink-0">
                {actionLoading === `hold-${payout.affiliateId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                Confirm
              </Button>
              <button onClick={() => onRejectStateChange({ ...rejectState, holdOpen: false, holdNote: "" })} className="text-muted-foreground hover:text-foreground flex-shrink-0 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {/* Reject note input */}
          {rejectState.open && (
            <div className="w-full flex items-center gap-2 mt-1">
              <Input value={rejectState.note} onChange={e => onRejectStateChange({ ...rejectState, note: e.target.value })}
                placeholder="Rejection reason (required)..." className="bg-background border-red-500/30 h-7 text-xs flex-1" autoFocus />
              <Button onClick={() => onAction(payout.affiliateId, "reject", rejectState.note)}
                disabled={!!actionLoading || !rejectState.note.trim()} size="sm"
                className="bg-red-500 hover:bg-red-600 text-white h-7 text-xs gap-1 flex-shrink-0">
                {actionLoading === `reject-${payout.affiliateId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                Confirm
              </Button>
              <button onClick={() => onRejectStateChange({ ...rejectState, open: false, note: "" })} className="text-muted-foreground hover:text-foreground flex-shrink-0 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Paid footer */}
      {isPaid && (
        <div className="border-t border-border px-4 py-2 bg-green-500/5 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
          <p className="text-xs text-green-400 font-medium">Paid on {payout.latestAction?.date ? fmtDate(payout.latestAction.date) : "—"}</p>
        </div>
      )}

      {/* Hold footer with option to still mark paid */}
      {isHold && (
        <div className="border-t border-border px-4 py-3 flex flex-wrap items-center gap-2 bg-blue-500/5">
          <p className="text-xs text-blue-400 flex-1">
            ⏸ On hold{payout.latestAction?.note ? `: ${payout.latestAction.note}` : ""}
          </p>
          <Button onClick={() => onAction(payout.affiliateId, "paid")} disabled={!!actionLoading} size="sm"
            className="bg-green-500 hover:bg-green-600 text-white gap-1.5 h-7 text-xs">
            {actionLoading === `paid-${payout.affiliateId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Mark as Paid
          </Button>
        </div>
      )}
    </div>
  );
}

function PayoutsTab() {
  const [view, setView] = useState<"scheduled" | "paid">("scheduled");
  const [scheduled, setScheduled] = useState<ScheduledPayout[]>([]);
  const [paid, setPaid]           = useState<Payout[]>([]);
  const [loading, setLoading]     = useState(true);
  const [schedFilter, setSchedFilter] = useState<"all" | "due" | "hold">("all");
  const [paidSearch, setPaidSearch]   = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectState, setRejectState]     = useState<Record<number, { open: boolean; note: string; holdOpen: boolean; holdNote: string }>>({});
  const [viewPayout, setViewPayout]       = useState<ScheduledPayout | null>(null);
  const { toast } = useToast();

  const loadScheduled = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/affiliate/admin/scheduled-payouts"); if (r.ok) setScheduled(await r.json()); }
    finally { setLoading(false); }
  }, []);

  const loadPaid = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/affiliate/admin/all-payouts?status=approved"); if (r.ok) setPaid(await r.json()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (view === "scheduled") loadScheduled();
    else loadPaid();
  }, [view, loadScheduled, loadPaid]);

  const doScheduledAction = async (affiliateId: number, action: "paid" | "hold" | "reject", note?: string) => {
    setActionLoading(`${action}-${affiliateId}`);
    try {
      const r = await apiFetch(`/api/affiliate/admin/scheduled-payouts/${affiliateId}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (r.ok) {
        toast({ title: action === "paid" ? "Marked as Paid!" : action === "hold" ? "Put on Hold" : "Payout Rejected" });
        loadScheduled();
        setRejectState(s => ({ ...s, [affiliateId]: { open: false, note: "", holdOpen: false, holdNote: "" } }));
      } else {
        const err = await r.json().catch(() => ({}));
        toast({ title: (err as any).error ?? "Action failed", variant: "destructive" });
      }
    } finally { setActionLoading(null); }
  };

  /* Scheduled computed stats */
  const dueNow  = scheduled.filter(p => p.isDue && p.latestAction?.status !== "hold");
  const onHold  = scheduled.filter(p => p.latestAction?.status === "hold");
  const totalDueAmt = dueNow.reduce((s, p) => s + p.unpaidAmount, 0);

  const filteredScheduled = scheduled.filter(p => {
    if (schedFilter === "due")  return p.isDue && p.latestAction?.status !== "hold";
    if (schedFilter === "hold") return p.latestAction?.status === "hold";
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Affiliate profile modal */}
      {viewPayout && (
        <AffiliateProfileModal
          payout={viewPayout}
          onClose={() => setViewPayout(null)}
          actionLoading={actionLoading}
          rejectState={rejectState[viewPayout.affiliateId] ?? { open: false, note: "", holdOpen: false, holdNote: "" }}
          onRejectStateChange={s => setRejectState(r => ({ ...r, [viewPayout.affiliateId]: s }))}
          onAction={doScheduledAction}
        />
      )}
      {/* ── SCHEDULED VIEW ── */}
      {view === "scheduled" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Due Now</p>
              <p className="text-xl font-bold text-amber-400">{dueNow.length}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Due Amount</p>
              <p className="text-xl font-bold text-amber-400">{fmt(totalDueAmt)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">On Hold</p>
              <p className="text-xl font-bold text-blue-400">{onHold.length}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Affiliates</p>
              <p className="text-xl font-bold text-foreground">{scheduled.length}</p>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5 w-fit">
            {[
              { id: "scheduled", label: "Scheduled Payouts" },
              { id: "paid",      label: "Paid"             },
            ].map(v => (
              <button key={v.id} onClick={() => { setView(v.id as any); setLoading(true); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${view === v.id ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5 w-fit">
            {([
              { id: "all",  label: "All" },
              { id: "due",  label: `Due Now${dueNow.length  > 0 ? ` (${dueNow.length})`  : ""}` },
              { id: "hold", label: `On Hold${onHold.length  > 0 ? ` (${onHold.length})`  : ""}` },
            ] as const).map(f => (
              <button key={f.id} onClick={() => setSchedFilter(f.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${schedFilter === f.id ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-28 bg-card rounded-xl animate-pulse" />)}</div>
          ) : filteredScheduled.length === 0 ? (
            <div className="bg-card border border-border rounded-xl py-16 text-center">
              <BadgeIndianRupee className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">No payouts due</p>
              <p className="text-sm text-muted-foreground mt-1">All affiliate earnings are up to date.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredScheduled.map(p => (
                <ScheduledPayoutCard
                  key={p.affiliateId}
                  payout={p}
                  actionLoading={actionLoading}
                  rejectState={rejectState[p.affiliateId] ?? { open: false, note: "", holdOpen: false, holdNote: "" }}
                  onRejectStateChange={s => setRejectState(r => ({ ...r, [p.affiliateId]: s }))}
                  onView={() => setViewPayout(p)}
                  onAction={doScheduledAction}
                />
              ))}
            </div>
          )}
        </>
      )}
      {/* ── PAID VIEW ── */}
      {view === "paid" && (() => {
        const q = paidSearch.toLowerCase();
        const filtered = paid.filter(p =>
          p.userName.toLowerCase().includes(q) || p.userEmail.toLowerCase().includes(q)
        );
        const totalAmt = paid.reduce((s, p) => s + p.amount, 0);
        return (
          <>
            {/* View toggle */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5 w-fit">
              {[
                { id: "scheduled", label: "Scheduled Payouts" },
                { id: "paid",      label: "Paid"             },
              ].map(v => (
                <button key={v.id} onClick={() => { setView(v.id as any); setLoading(true); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${view === v.id ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                  {v.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Paid Payouts</p>
                <p className="text-xl font-bold text-green-400">{paid.length}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Amount Paid Out</p>
                <p className="text-xl font-bold text-green-400">{fmt(totalAmt)}</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={paidSearch}
                onChange={e => setPaidSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="pl-8 bg-card border-border h-8 text-xs"
              />
            </div>
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-card rounded animate-pulse" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-16 text-center">
                <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold">No paid payouts yet</p>
                <p className="text-sm text-muted-foreground mt-1">Approved payouts will appear here.</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Affiliate</th>
                      <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Method</th>
                      <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Amount</th>
                      <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Processed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, i) => (
                      <tr key={p.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{p.userName}</p>
                          <p className="text-muted-foreground">{p.userEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground capitalize whitespace-nowrap">{p.paymentMethod.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-400 whitespace-nowrap">{fmt(p.amount)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">{p.processedAt ? fmtDate(p.processedAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB 4 — KYC
══════════════════════════════════════════ */
function KycTab() {
  const [records, setRecords] = useState<KycRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState<Record<number, string>>({});
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/affiliate/admin/all-kyc");
      if (res.ok) setRecords(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doAction = async (userId: number, action: "approve" | "reject") => {
    const note = rejectNote[userId] ?? "";
    if (action === "reject" && !note.trim()) {
      toast({ title: "Please enter a rejection reason", variant: "destructive" }); return;
    }
    setActionLoading(`${action}-${userId}`);
    try {
      const res = await apiFetch(`/api/affiliate/admin/kyc/${userId}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "reject" ? { adminNote: note } : {}),
      });
      if (res.ok) { toast({ title: `KYC ${action}d` }); load(); }
      else toast({ title: "Failed", variant: "destructive" });
    } finally { setActionLoading(null); }
  };

  const q = search.trim().toLowerCase();
  const filtered = records.filter(r => {
    const statusMatch = filter === "all" || r.status === filter;
    const searchMatch = !q ||
      r.userName.toLowerCase().includes(q) ||
      r.userEmail.toLowerCase().includes(q) ||
      (r.userPhone ?? "").toLowerCase().includes(q) ||
      (r.panNumber ?? "").toLowerCase().includes(q);
    return statusMatch && searchMatch;
  });
  const pendingCount = records.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Photo lightbox */}
      {expandedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setExpandedPhoto(null)}
        >
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <img src={expandedPhoto} alt="PAN" className="w-full rounded-xl border border-border" />
            <button
              onClick={() => setExpandedPhoto(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center hover:bg-card cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, phone or PAN number…"
          className="bg-card border-border h-9 text-sm pl-9 pr-8"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
          {(["pending", "approved", "rejected", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${filter === f ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {f} {f !== "all" && `(${records.filter(r => r.status === f).length})`}
            </button>
          ))}
        </div>
        {pendingCount > 0 && (
          <span className="text-xs text-amber-400 font-medium">{pendingCount} pending review</span>
        )}
        {q && (
          <span className="text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""} for "<span className="text-foreground">{search}</span>"</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-card rounded animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl py-12 text-center">
          <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No KYC submissions</p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet table — unchanged from original */}
          <div className="hidden md:block border border-border rounded-xl overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[700px]">
              <thead className="bg-card border-b border-border">
                <tr>
                  {["Affiliate", "Name as Per PAN", "PAN Number", "PAN Photo", "Date", "Status", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-3 py-2.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(r => (
                  <Fragment key={r.id}>
                    <tr className="hover:bg-card/40 transition-colors">
                      <td className="px-3 py-2.5">
                        <p className="text-sm font-medium text-foreground leading-tight">{r.userName}</p>
                        <p className="text-[11px] text-muted-foreground">{r.userEmail}</p>
                        {r.userPhone && <p className="text-[11px] text-muted-foreground">{r.userPhone}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-foreground max-w-[160px] truncate" title={r.idProofName ?? ""}>
                        {r.idProofName ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-sm font-mono text-foreground tracking-widest whitespace-nowrap">
                        {r.panNumber ?? <span className="text-muted-foreground font-sans tracking-normal">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.addressProofName ? (
                          <div
                            className="w-12 h-8 rounded overflow-hidden border border-border cursor-pointer group relative flex-shrink-0"
                            onClick={() => setExpandedPhoto(r.addressProofName!)}
                          >
                            <img src={r.addressProofName} alt="PAN" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all" />
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.submittedAt)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5">
                        {r.status === "pending" ? (
                          <div className="flex items-center gap-1.5">
                            <Button onClick={() => doAction(r.userId, "approve")} disabled={!!actionLoading} size="sm"
                              className="bg-green-500 hover:bg-green-600 text-white h-6 text-[10px] px-2 gap-1">
                              {actionLoading === `approve-${r.userId}` ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <CheckCircle2 className="w-2.5 h-2.5" />}Approve
                            </Button>
                            <Button
                              onClick={() => setRejectNote(n => ({ ...n, [r.userId]: n[r.userId] === undefined ? "" : undefined as any }))}
                              size="sm" variant="outline"
                              className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-6 text-[10px] px-2 gap-1">
                              <XCircle className="w-2.5 h-2.5" />Reject
                            </Button>
                          </div>
                        ) : r.adminNote ? (
                          <p className="text-[10px] text-muted-foreground max-w-[120px] truncate" title={r.adminNote}>{r.adminNote}</p>
                        ) : null}
                      </td>
                    </tr>
                    {/* Inline reject reason row */}
                    {r.status === "pending" && rejectNote[r.userId] !== undefined && (
                      <tr className="bg-red-500/5">
                        <td colSpan={7} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Enter rejection reason…"
                              value={rejectNote[r.userId] ?? ""}
                              onChange={e => setRejectNote(n => ({ ...n, [r.userId]: e.target.value }))}
                              className="bg-background border-red-500/30 text-sm h-7 flex-1"
                              autoFocus
                            />
                            <Button onClick={() => doAction(r.userId, "reject")} disabled={!!actionLoading} size="sm"
                              className="bg-red-500 hover:bg-red-600 text-white h-7 text-xs px-3 gap-1 flex-shrink-0">
                              {actionLoading === `reject-${r.userId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}Confirm Reject
                            </Button>
                            <button
                              onClick={() => setRejectNote(n => { const c = { ...n }; delete c[r.userId]; return c; })}
                              className="text-muted-foreground hover:text-foreground flex-shrink-0 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list — only renders below md */}
          <div className="md:hidden space-y-3">
            {filtered.map(r => (
              <div key={r.id} className="bg-card border border-border rounded-xl p-3.5 space-y-3">
                {/* Top: PAN photo + user info + status */}
                <div className="flex gap-3">
                  {r.addressProofName ? (
                    <div
                      className="w-16 h-12 rounded overflow-hidden border border-border cursor-pointer flex-shrink-0"
                      onClick={() => setExpandedPhoto(r.addressProofName!)}
                    >
                      <img src={r.addressProofName} alt="PAN" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-16 h-12 rounded border border-border flex-shrink-0 flex items-center justify-center bg-background">
                      <span className="text-[10px] text-muted-foreground">No photo</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm leading-tight truncate">{r.userName}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{r.userEmail}</p>
                    {r.userPhone && <p className="text-[11px] text-muted-foreground">{r.userPhone}</p>}
                  </div>
                </div>

                {/* PAN details grid */}
                <div className="grid grid-cols-1 gap-1.5 text-xs border-y border-border py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground flex-shrink-0">Name on PAN</span>
                    <span className="text-right truncate" title={r.idProofName ?? ""}>{r.idProofName ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground flex-shrink-0">PAN Number</span>
                    <span className="font-mono tracking-widest text-right">{r.panNumber ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground flex-shrink-0">Submitted</span>
                    <span className="text-muted-foreground">{fmtDate(r.submittedAt)}</span>
                  </div>
                </div>

                {/* Actions / admin note */}
                {r.status === "pending" ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Button onClick={() => doAction(r.userId, "approve")} disabled={!!actionLoading} size="sm"
                        className="bg-green-500 hover:bg-green-600 text-white h-8 text-xs gap-1 flex-1">
                        {actionLoading === `approve-${r.userId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}Approve
                      </Button>
                      <Button
                        onClick={() => setRejectNote(n => ({ ...n, [r.userId]: n[r.userId] === undefined ? "" : undefined as any }))}
                        size="sm" variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-8 text-xs gap-1 flex-1">
                        <XCircle className="w-3 h-3" />Reject
                      </Button>
                    </div>
                    {rejectNote[r.userId] !== undefined && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2.5 space-y-2">
                        <Input
                          placeholder="Enter rejection reason…"
                          value={rejectNote[r.userId] ?? ""}
                          onChange={e => setRejectNote(n => ({ ...n, [r.userId]: e.target.value }))}
                          className="bg-background border-red-500/30 text-sm h-8"
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <Button onClick={() => doAction(r.userId, "reject")} disabled={!!actionLoading} size="sm"
                            className="bg-red-500 hover:bg-red-600 text-white h-7 text-xs gap-1 flex-1">
                            {actionLoading === `reject-${r.userId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}Confirm Reject
                          </Button>
                          <button
                            onClick={() => setRejectNote(n => { const c = { ...n }; delete c[r.userId]; return c; })}
                            className="text-muted-foreground hover:text-foreground cursor-pointer p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : r.adminNote ? (
                  <p className="text-[11px] text-muted-foreground italic">Note: {r.adminNote}</p>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB 5 — Creatives
══════════════════════════════════════════ */
const BLANK_FORM = { title: "", type: "text" as Creative["type"], url: "", content: "", headline: "", description: "" };

function CreativesTab() {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/affiliate/creatives");
      if (res.ok) setCreatives(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowForm(true);
  };

  const startEdit = (c: Creative) => {
    setEditingId(c.id);
    setForm({ title: c.title, type: c.type, url: c.url ?? "", content: c.content ?? "", headline: c.headline ?? "", description: c.description ?? "" });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancel = () => { setShowForm(false); setEditingId(null); setForm(BLANK_FORM); };

  const save = async () => {
    if (!form.title || !form.type) { toast({ title: "Title and type required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/affiliate/admin/creatives/${editingId}` : "/api/affiliate/admin/creatives";
      const method = editingId ? "PUT" : "POST";
      const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) {
        toast({ title: editingId ? "Creative updated" : "Creative added" });
        cancel();
        load();
      } else toast({ title: "Failed to save creative", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const del = async (id: number) => {
    try {
      await apiFetch(`/api/affiliate/admin/creatives/${id}`, { method: "DELETE" });
      toast({ title: "Creative removed" });
      load();
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Promotional materials available to affiliates for download.</p>
        <Button onClick={openNew} size="sm" className="gap-1.5 w-full sm:w-auto">
          <Plus className="w-3.5 h-3.5" />Add Creative
        </Button>
      </div>
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <p className="font-semibold text-sm">{editingId ? "Edit Creative" : "New Creative"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Banner 728x90" className="bg-background border-border text-sm h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type *</Label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Creative["type"] }))}
                className="w-full h-8 rounded-md bg-background border border-border text-sm px-2">
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="banner">Banner</option>
                <option value="link">Link</option>
              </select>
            </div>
          </div>
          {form.type !== "text" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{form.type === "link" ? "Video / Link URL" : "URL"}</Label>
              <Input
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder={form.type === "link" ? "https://drive.google.com/file/d/..." : "https://..."}
                className="bg-background border-border text-sm h-8"
              />
              {form.type === "link" && (
                <p className="text-[10px] text-muted-foreground">Paste a Google Drive, YouTube, or any video link. Affiliates can share this directly.</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Primary Text / Ad Copy</Label>
            <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={3} className="bg-background border-border resize-none text-sm" placeholder="Ad copy text…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Headline</Label>
            <Input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} placeholder="Short headline for the ad…" className="bg-background border-border text-sm h-8" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" className="bg-background border-border text-sm h-8" />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} size="sm" className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {editingId ? "Update" : "Save"}
            </Button>
            <Button onClick={cancel} variant="outline" size="sm">Cancel</Button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-card rounded animate-pulse" />)}</div>
      ) : creatives.length === 0 ? (
        <div className="bg-card border border-border rounded-xl py-12 text-center">
          <Image className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No creatives yet</p>
          <p className="text-sm text-muted-foreground">Add banners, images, and ad copy for your affiliates.</p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden md:block border border-border rounded-xl overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[700px]">
              <thead className="bg-card border-b border-border">
                <tr>{["Title", "Type", "Content", "Added", ""].map(h =>
                  <th key={h} className="text-left text-xs font-medium text-muted-foreground px-3 py-3 whitespace-nowrap">{h}</th>
                )}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creatives.map(c => (
                  <tr key={c.id} className="hover:bg-card/50">
                    <td className="px-3 py-3 font-medium text-sm">{c.title}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 capitalize">{c.type}</Badge></td>
                    <td className="px-3 py-3 text-sm text-muted-foreground max-w-[200px] truncate">{c.content ?? c.url ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(c.createdAt)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(c)} className="text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => del(c.id)} className="text-muted-foreground hover:text-red-400 transition-colors cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {creatives.map(c => (
              <div key={c.id} className="bg-card border border-border rounded-xl p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">{c.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 capitalize">{c.type}</Badge>
                      <span className="text-[11px] text-muted-foreground">{fmtDate(c.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => startEdit(c)} className="text-muted-foreground hover:text-primary transition-colors cursor-pointer p-1.5 -m-1.5">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => del(c.id)} className="text-muted-foreground hover:text-red-400 transition-colors cursor-pointer p-1.5 -m-1.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {(c.content || c.url) && (
                  <p className="text-xs text-muted-foreground line-clamp-2 break-all">{c.content ?? c.url}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB 6 — Settings
══════════════════════════════════════════ */
/* ── Sales Tab ── */
type AffiliateSale = {
  orderId: number;
  buyerUserId: number | null;
  affiliateUserId: number | null;
  amount: number;
  commission: number | null;
  isSelfReferral: boolean;
  gateway: string;
  affiliateRef: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  courseTitle: string | null;
  affiliateName: string | null;
  affiliateEmail: string | null;
  affiliateReferralCode: string | null;
  createdAt: string;
};

type Period = "today" | "yesterday" | "7days" | "30days" | "custom" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "today",     label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7days",     label: "Last 7 Days" },
  { id: "30days",    label: "Last 30 Days" },
  { id: "custom",    label: "Custom" },
  { id: "all",       label: "All Time" },
];

function periodRange(period: Period, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const endOfDay   = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
  if (period === "today")     return { from: startOfDay(now), to: endOfDay(now) };
  if (period === "yesterday") { const y = new Date(now); y.setDate(y.getDate()-1); return { from: startOfDay(y), to: endOfDay(y) }; }
  if (period === "7days")     { const s = new Date(now); s.setDate(s.getDate()-6); return { from: startOfDay(s), to: endOfDay(now) }; }
  if (period === "30days")    { const s = new Date(now); s.setDate(s.getDate()-29); return { from: startOfDay(s), to: endOfDay(now) }; }
  if (period === "custom")    return { from: customFrom ? new Date(customFrom + "T00:00:00") : null, to: customTo ? new Date(customTo + "T23:59:59") : null };
  return { from: null, to: null };
}

function SalesTab() {
  const { toast } = useToast();
  const [sales, setSales] = useState<AffiliateSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    apiFetch("/api/affiliate/admin/sales")
      .then(r => r.json())
      .then(data => setSales(Array.isArray(data) ? data : []))
      .catch(() => toast({ title: "Failed to load affiliate sales", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (v: number) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const { from: pFrom, to: pTo } = periodRange(period, customFrom, customTo);

  const filtered = sales.filter(s => {
    const d = new Date(s.createdAt);
    if (pFrom && d < pFrom) return false;
    if (pTo   && d > pTo)   return false;
    const q = search.toLowerCase();
    return !q || [s.buyerName, s.buyerEmail, s.affiliateName, s.affiliateEmail, s.affiliateRef, s.courseTitle, String(s.orderId)]
      .some(v => v?.toLowerCase().includes(q));
  });

  const totalSales = filtered.reduce((a, s) => a + s.amount, 0);
  const totalComm  = filtered.reduce((a, s) => a + (s.commission ?? 0), 0);
  const selfReferralCount = filtered.filter(s => s.isSelfReferral).length;

  const affiliateGroups = Array.from(
    filtered.reduce((map, s) => {
      const key = s.affiliateRef ?? "unknown";
      if (!map.has(key)) map.set(key, { name: s.affiliateName, email: s.affiliateEmail, ref: s.affiliateRef, count: 0, revenue: 0, commission: 0 });
      const g = map.get(key)!;
      g.count++;
      if (!s.isSelfReferral) { g.revenue += s.amount; g.commission += s.commission ?? 0; }
      return map;
    }, new Map<string, { name: string | null; email: string | null; ref: string | null; count: number; revenue: number; commission: number }>())
    .values()
  ).sort((a, b) => b.revenue - a.revenue);

  const initials = (name: string | null) => (name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  if (loading) return <div className="py-16 text-center text-muted-foreground">Loading sales…</div>;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Orders", value: filtered.length.toString(), sub: selfReferralCount > 0 ? `${selfReferralCount} self-referral${selfReferralCount > 1 ? "s" : ""}` : null },
          { label: "Total Revenue", value: fmt(totalSales) },
          { label: "Total Commission", value: fmt(totalComm) },
          { label: "Active Affiliates", value: affiliateGroups.length.toString() },
        ].map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
            <p className="text-xl font-bold text-foreground">{c.value}</p>
            {"sub" in c && c.sub && <p className="text-[10px] text-amber-500 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Affiliate leaderboard */}
      {affiliateGroups.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold text-foreground">Affiliate Leaderboard</div>
          <div className="divide-y divide-border">
            {affiliateGroups.map((g, i) => (
              <div key={g.ref ?? i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-6 text-xs text-muted-foreground font-mono text-center">{i + 1}</div>
                <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {initials(g.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{g.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{g.email} · <span className="font-mono">{g.ref}</span></p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-foreground">{fmt(g.revenue)}</p>
                  <p className="text-xs text-muted-foreground">{g.count} order{g.count !== 1 ? "s" : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-green-400">{fmt(g.commission)}</p>
                  <p className="text-xs text-muted-foreground">commission</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Period selector */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                period === p.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        )}
      </div>

      {/* Search + table */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Search by buyer, affiliate, course, order…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {search ? "No matching sales found." : period !== "all" ? "No sales in this period." : "No affiliate-attributed sales yet."}
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Order</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Buyer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Course</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Sale ₹</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Commission</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Affiliate</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Gateway</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(s => (
                    <tr key={s.orderId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{s.orderId}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground truncate max-w-[130px]">{s.buyerName || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[130px]">{s.buyerEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground max-w-[140px] truncate">{s.courseTitle ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{fmt(s.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        {s.isSelfReferral ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-500 border border-amber-500/25 whitespace-nowrap">
                            Self-referral
                          </span>
                        ) : s.commission != null ? (
                          <span className="font-semibold text-green-400">{fmt(s.commission)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {initials(s.affiliateName)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate max-w-[110px]">{s.affiliateName ?? s.affiliateRef ?? "—"}</p>
                            <p className="text-xs text-muted-foreground font-mono">{s.affiliateRef}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase font-medium">{s.gateway}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground bg-muted/20">
              {filtered.length} sale{filtered.length !== 1 ? "s" : ""}
              {search && ` matching "${search}"`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState<AffSettings>({ commissionRate: 20, affiliateEnabled: true, affiliateCookieDays: 30, affiliateMinPayout: 500, payoutPeriodDays: 7, payoutWeekDay: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    apiFetch("/api/affiliate/admin/settings").then(async r => {
      if (r.ok) setSettings(await r.json());
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/affiliate/admin/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) toast({ title: "Settings saved" });
      else toast({ title: "Failed to save", variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="h-48 bg-card rounded-xl animate-pulse" />;

  return (
    <div className="max-w-xl space-y-6">
      {/* Program toggle */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Settings className="w-4 h-4 text-primary" />Program Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Affiliate Program Enabled</p>
              <p className="text-xs text-muted-foreground">Allow users to apply and promote courses</p>
            </div>
            <Switch checked={settings.affiliateEnabled} onCheckedChange={v => setSettings(s => ({ ...s, affiliateEnabled: v }))} />
          </div>
        </div>
      </div>

      {/* Cookie & Payout */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><BadgeIndianRupee className="w-4 h-4 text-primary" />Tracking & Payouts</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cookie Duration (days)</Label>
            <Input
              type="number" min={1} max={365}
              value={settings.affiliateCookieDays}
              onChange={e => setSettings(s => ({ ...s, affiliateCookieDays: parseInt(e.target.value) || 30 }))}
              className="bg-background border-border h-9 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">Referral attribution window</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Minimum Payout (₹)</Label>
            <Input
              type="number" min={1}
              value={settings.affiliateMinPayout}
              onChange={e => setSettings(s => ({ ...s, affiliateMinPayout: parseInt(e.target.value) || 500 }))}
              className="bg-background border-border h-9 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">Minimum withdrawal amount</p>
          </div>
        </div>
      </div>

      {/* Payout Schedule */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-sm mb-1 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />Payout Schedule</h3>
          <p className="text-[11px] text-muted-foreground">Choose a fixed weekly payout day, or use a rolling period.</p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setSettings(s => ({ ...s, payoutWeekDay: null }))}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all text-center cursor-pointer ${
              settings.payoutWeekDay === null
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Rolling Period (every N days)
          </button>
          <button
            onClick={() => setSettings(s => ({ ...s, payoutWeekDay: s.payoutWeekDay ?? 1 }))}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all text-center cursor-pointer ${
              settings.payoutWeekDay !== null
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Fixed Weekly Day
          </button>
        </div>

        {/* Rolling period mode */}
        {settings.payoutWeekDay === null && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Every 3 Days", days: 3 },
                { label: "Every Week",   days: 7 },
                { label: "Every 2 Weeks", days: 14 },
                { label: "Every Month",  days: 30 },
              ].map(opt => (
                <button
                  key={opt.days}
                  onClick={() => setSettings(s => ({ ...s, payoutPeriodDays: opt.days }))}
                  className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-all text-center cursor-pointer ${
                    settings.payoutPeriodDays === opt.days
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs text-muted-foreground">Custom period (days)</Label>
                <Input
                  type="number" min={1} max={365}
                  value={settings.payoutPeriodDays}
                  onChange={e => setSettings(s => ({ ...s, payoutPeriodDays: parseInt(e.target.value) || 7 }))}
                  className="bg-background border-border h-9 text-sm"
                />
              </div>
              <div className="pt-5 text-xs text-muted-foreground flex-shrink-0">
                = every <span className="text-foreground font-semibold">{settings.payoutPeriodDays}</span> day{settings.payoutPeriodDays !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        )}

        {/* Fixed weekly day mode */}
        {settings.payoutWeekDay !== null && (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">Every week on this day, all affiliates with pending earnings will show as Due Now.</p>
            <div className="grid grid-cols-7 gap-1.5">
              {[
                { label: "Sun", day: 0 },
                { label: "Mon", day: 1 },
                { label: "Tue", day: 2 },
                { label: "Wed", day: 3 },
                { label: "Thu", day: 4 },
                { label: "Fri", day: 5 },
                { label: "Sat", day: 6 },
              ].map(opt => (
                <button
                  key={opt.day}
                  onClick={() => setSettings(s => ({ ...s, payoutWeekDay: opt.day }))}
                  className={`py-2.5 rounded-lg border text-xs font-semibold transition-all text-center cursor-pointer ${
                    settings.payoutWeekDay === opt.day
                      ? "bg-primary border-primary text-white"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {settings.payoutWeekDay !== null && (
              <p className="text-[11px] text-primary">
                Payouts due every {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][settings.payoutWeekDay]}
              </p>
            )}
          </div>
        )}
      </div>

      <Button onClick={save} disabled={saving} className="gap-1.5">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save Settings
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB — Commission Groups
══════════════════════════════════════════ */
function CommissionGroupsTab() {
  const [groups, setGroups] = useState<CommissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", commissionRate: "" });
  const [editForm, setEditForm] = useState({ name: "", description: "", commissionRate: "" });
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/affiliate/admin/commission-groups");
      if (res.ok) setGroups(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !form.commissionRate) {
      toast({ title: "Name and commission rate are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/affiliate/admin/commission-groups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || null, commissionRate: parseInt(form.commissionRate) }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Group created" });
      setForm({ name: "", description: "", commissionRate: "" });
      load();
    } catch { toast({ title: "Failed to create group", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/affiliate/admin/commission-groups/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name.trim(), description: editForm.description.trim() || null, commissionRate: parseInt(editForm.commissionRate) }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Group updated" });
      setEditingId(null);
      load();
    } catch { toast({ title: "Failed to update group", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const deleteGroup = async (id: number) => {
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/affiliate/admin/commission-groups/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Group deleted" });
      load();
    } catch { toast({ title: "Failed to delete group", variant: "destructive" }); }
    finally { setDeleting(null); }
  };

  return (
    <div className="space-y-6">
      {/* Create group */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" />Create Commission Group
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Group Name <span className="text-red-400">*</span></Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Silver, Gold, VIP" className="bg-background border-border h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Commission Rate (%) <span className="text-red-400">*</span></Label>
            <Input type="number" min={0} max={100} value={form.commissionRate}
              onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))}
              placeholder="e.g. 25" className="bg-background border-border h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description" className="bg-background border-border h-8 text-sm" />
          </div>
        </div>
        <Button onClick={create} disabled={saving} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Create Group
        </Button>
      </div>

      {/* Groups list */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-card rounded animate-pulse" />)}</div>
      ) : groups.length === 0 ? (
        <div className="bg-card border border-border rounded-xl py-16 text-center">
          <Percent className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold text-sm">No commission groups yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first group above to start organising affiliates by commission tier.</p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden md:block border border-border rounded-xl overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-card border-b border-border">
                <tr>
                  {["Group Name", "Rate", "Description", "Affiliates", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map(g => (
                  <tr key={g.id} className="hover:bg-card/50 transition-colors">
                    {editingId === g.id ? (
                      <>
                        <td className="px-4 py-2">
                          <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className="h-7 text-xs bg-background border-border w-36" />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <Input type="number" min={0} max={100} value={editForm.commissionRate}
                              onChange={e => setEditForm(f => ({ ...f, commissionRate: e.target.value }))}
                              className="h-7 text-xs bg-background border-border w-16" />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Description" className="h-7 text-xs bg-background border-border w-48" />
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{g.affiliateCount}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveEdit(g.id)} disabled={saving} className="text-green-400 hover:text-green-300 cursor-pointer">
                              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                              <Percent className="w-3.5 h-3.5 text-purple-400" />
                            </div>
                            <span className="font-medium text-sm">{g.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className="text-[11px] bg-purple-500/10 text-purple-400 border-purple-500/20">{g.commissionRate}%</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{g.description ?? <span className="italic">—</span>}</td>
                        <td className="px-4 py-3 text-sm">{g.affiliateCount} affiliate{g.affiliateCount !== 1 ? "s" : ""}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => { setEditingId(g.id); setEditForm({ name: g.name, description: g.description ?? "", commissionRate: String(g.commissionRate) }); }}
                              className="text-muted-foreground hover:text-primary cursor-pointer">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteGroup(g.id)} disabled={deleting === g.id}
                              className="text-muted-foreground hover:text-red-400 cursor-pointer">
                              {deleting === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {groups.map(g => (
              <div key={g.id} className="bg-card border border-border rounded-xl p-3.5 space-y-3">
                {editingId === g.id ? (
                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Group Name</Label>
                      <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="h-8 text-sm bg-background border-border" />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Rate (%)</Label>
                        <Input type="number" min={0} max={100} value={editForm.commissionRate}
                          onChange={e => setEditForm(f => ({ ...f, commissionRate: e.target.value }))}
                          className="h-8 text-sm bg-background border-border" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Affiliates</Label>
                        <div className="h-8 flex items-center text-sm text-muted-foreground">{g.affiliateCount}</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Description</Label>
                      <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Description" className="h-8 text-sm bg-background border-border" />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" onClick={() => saveEdit(g.id)} disabled={saving}
                        className="h-8 text-xs gap-1 flex-1 bg-green-500 hover:bg-green-600 text-white">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}
                        className="h-8 text-xs gap-1 flex-1">
                        <X className="w-3 h-3" />Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                          <Percent className="w-4 h-4 text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm leading-tight truncate">{g.name}</p>
                          <p className="text-[11px] text-muted-foreground">{g.affiliateCount} affiliate{g.affiliateCount !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <Badge className="text-[11px] bg-purple-500/10 text-purple-400 border-purple-500/20 flex-shrink-0">{g.commissionRate}%</Badge>
                    </div>
                    {g.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{g.description}</p>
                    )}
                    <div className="flex items-center gap-2 pt-1 border-t border-border">
                      <Button size="sm" variant="outline"
                        onClick={() => { setEditingId(g.id); setEditForm({ name: g.name, description: g.description ?? "", commissionRate: String(g.commissionRate) }); }}
                        className="h-7 text-[11px] gap-1 flex-1 mt-2">
                        <Edit2 className="w-3 h-3" />Edit
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => deleteGroup(g.id)} disabled={deleting === g.id}
                        className="h-7 text-[11px] gap-1 flex-1 mt-2 border-red-500/30 text-red-400 hover:bg-red-500/10">
                        {deleting === g.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}Delete
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════ */
const TABS = [
  { id: "overview",      label: "Overview",      icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: "applications",  label: "Applications",  icon: <FileText className="w-3.5 h-3.5" /> },
  { id: "sales",         label: "Sales",          icon: <BadgeIndianRupee className="w-3.5 h-3.5" /> },
  { id: "payouts",       label: "Payouts",        icon: <CreditCard className="w-3.5 h-3.5" /> },
  { id: "kyc",          label: "KYC",            icon: <Shield className="w-3.5 h-3.5" /> },
  { id: "creatives",     label: "Creatives",      icon: <Image className="w-3.5 h-3.5" /> },
  { id: "groups",        label: "Groups",         icon: <Percent className="w-3.5 h-3.5" /> },
  { id: "settings",      label: "Settings",       icon: <Settings className="w-3.5 h-3.5" /> },
];

export default function AdminAffiliatesPage() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />Affiliate Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your entire affiliate program — approvals, commissions, payouts, KYC, creatives and settings.
        </p>
      </div>

      {/* Tab bar — wraps on all screen sizes */}
      <div className="bg-card border border-border rounded-xl p-1 mb-6">
        <div className="flex items-center gap-1 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                tab === t.id ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-background"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === "overview"     && <OverviewTab />}
      {tab === "applications" && <ApplicationsTab />}
      {tab === "sales"        && <SalesTab />}
      {tab === "payouts"      && <PayoutsTab />}
      {tab === "kyc"          && <KycTab />}
      {tab === "creatives"    && <CreativesTab />}
      {tab === "groups"       && <CommissionGroupsTab />}
      {tab === "settings"     && <SettingsTab />}
    </div>
  );
}
