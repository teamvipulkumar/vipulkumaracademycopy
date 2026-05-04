import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, User, Mail, Calendar, IndianRupee, BookOpen,
  TrendingUp, Wallet, CreditCard, FileCheck, Building2,
  ShieldCheck, ShieldX, Clock, StickyNote, ExternalLink,
  CheckCircle2, XCircle, AlertCircle, Banknote
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminBase } from "@/lib/auth-context";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  courses: Array<{ id: number; title: string; price: number; salesCount: number; totalEarnings: number }>;
  commissions: Array<{ id: number; courseTitle: string | null; bundleName: string | null; saleAmount: number; commissionAmount: number; status: string; createdAt: string }>;
  payouts: Array<{ id: number; amount: number; status: string; paidAt: string | null; paymentReference: string | null; createdAt: string }>;
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  active: { color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", icon: CheckCircle2, label: "Active" },
  revoked: { color: "text-red-400 bg-red-400/10 border-red-400/30", icon: XCircle, label: "Revoked" },
  suspended: { color: "text-amber-400 bg-amber-400/10 border-amber-400/30", icon: AlertCircle, label: "Suspended" },
};

const kycStatusConfig: Record<string, { color: string; label: string }> = {
  pending: { color: "text-amber-400 bg-amber-400/10 border-amber-400/30", label: "Pending Review" },
  approved: { color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", label: "Approved" },
  rejected: { color: "text-red-400 bg-red-400/10 border-red-400/30", label: "Rejected" },
};

export default function AdminCreatorDetailPage() {
  const [, params] = useRoute("/admin/creators/:id");
  const [, paramsStaff] = useRoute("/staff/creators/:id");
  const id = parseInt((params?.id ?? paramsStaff?.id ?? "0"), 10);
  const qc = useQueryClient();
  const { toast } = useToast();
  const base = useAdminBase();
  const [notes, setNotes] = useState("");
  const [kycStatus, setKycStatus] = useState<string>("");
  const [kycNote, setKycNote] = useState("");

  const { data, isLoading } = useQuery<CreatorDetail>({
    queryKey: ["admin-creator-detail", id],
    queryFn: () => apiFetch(`/api/admin/creators/${id}`),
    enabled: !isNaN(id) && id > 0,
  });

  useEffect(() => {
    if (data) {
      setNotes(data.creator.notes ?? "");
      setKycStatus(data.creator.kyc.status ?? "");
      setKycNote(data.creator.kyc.adminNote ?? "");
    }
  }, [data]);

  const patchMut = useMutation({
    mutationFn: (payload: any) =>
      apiFetch(`/api/admin/creators/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({ title: "Updated" });
      qc.invalidateQueries({ queryKey: ["admin-creator-detail", id] });
      qc.invalidateQueries({ queryKey: ["admin-creators"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading creator profile…</p>
        </div>
      </div>
    );
  }

  const c = data.creator;
  const sc = statusConfig[c.status] || statusConfig.active;
  const StatusIcon = sc.icon;

  const totalEarnings = data.commissions.reduce((s, co) => s + (co.status !== "cancelled" ? co.commissionAmount : 0), 0);
  const pendingEarnings = data.commissions.reduce((s, co) => s + (co.status === "pending" ? co.commissionAmount : 0), 0);
  const paidEarnings = data.payouts.reduce((s, p) => s + (p.status === "paid" ? p.amount : 0), 0);
  const totalSales = data.courses.reduce((s, co) => s + co.salesCount, 0);

  const hasBankDetails = !!(c.bank.accountNumber || c.bank.upiId);
  const kycDone = c.kyc.status === "approved";

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Back Button */}
      <Link href={`${base}/creators`}>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Back to Creators
        </Button>
      </Link>

      {/* Profile Header Card */}
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500" />
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col md:flex-row gap-5">
            {/* Avatar + Info */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-white text-lg font-bold shrink-0 shadow-lg">
                {getInitials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl font-bold truncate">{c.name}</h1>
                  <Badge className={`text-[11px] gap-1 border ${sc.color}`}>
                    <StatusIcon className="w-3 h-3" />{sc.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{c.email}</span>
                  <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Joined {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />ID #{c.id}</span>
                </div>
                {/* Quick status pills */}
                <div className="flex items-center gap-2 mt-3">
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${kycDone ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" : "text-amber-400 bg-amber-400/10 border-amber-400/30"}`}>
                    <FileCheck className="w-3 h-3" />KYC {kycDone ? "Verified" : c.kyc.status || "Not Started"}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${hasBankDetails ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" : "text-zinc-400 bg-zinc-400/10 border-zinc-400/30"}`}>
                    <Building2 className="w-3 h-3" />Bank {hasBankDetails ? "Added" : "Missing"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Earnings", value: fmt(totalEarnings), icon: IndianRupee, color: "text-emerald-400" },
          { label: "Pending", value: fmt(pendingEarnings), icon: Clock, color: "text-amber-400" },
          { label: "Paid Out", value: fmt(paidEarnings), icon: Wallet, color: "text-blue-400" },
          { label: "Total Sales", value: totalSales.toString(), icon: TrendingUp, color: "text-purple-400" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
                  <p className="text-lg font-bold mt-1">{s.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center ${s.color}`}>
                  <s.icon className="w-4.5 h-4.5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="kyc" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="kyc" className="gap-1.5 cursor-pointer"><FileCheck className="w-3.5 h-3.5" />KYC & Bank</TabsTrigger>
          <TabsTrigger value="courses" className="gap-1.5 cursor-pointer"><BookOpen className="w-3.5 h-3.5" />Courses <span className="text-[10px] ml-0.5 opacity-60">({data.courses.length})</span></TabsTrigger>
          <TabsTrigger value="commissions" className="gap-1.5 cursor-pointer"><IndianRupee className="w-3.5 h-3.5" />Commissions <span className="text-[10px] ml-0.5 opacity-60">({data.commissions.length})</span></TabsTrigger>
          <TabsTrigger value="payouts" className="gap-1.5 cursor-pointer"><Banknote className="w-3.5 h-3.5" />Payouts <span className="text-[10px] ml-0.5 opacity-60">({data.payouts.length})</span></TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5 cursor-pointer"><StickyNote className="w-3.5 h-3.5" />Notes</TabsTrigger>
        </TabsList>

        {/* KYC & Bank Tab */}
        <TabsContent value="kyc" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* KYC Review */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />KYC Verification</CardTitle>
                  {c.kyc.status && (() => {
                    const ks = kycStatusConfig[c.kyc.status] || kycStatusConfig.pending;
                    return <Badge className={`text-[10px] border ${ks.color}`}>{ks.label}</Badge>;
                  })()}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Name (PAN)</p>
                    <p className="text-sm font-medium">{c.kyc.panName || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">PAN Number</p>
                    <p className="text-sm font-mono font-medium">{c.kyc.panNumber || "—"}</p>
                  </div>
                </div>

                {c.kyc.panFrontUrl && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">PAN Card Image</p>
                    <a href={c.kyc.panFrontUrl} target="_blank" rel="noreferrer" className="group relative inline-block rounded-lg overflow-hidden border hover:border-primary/50 transition-colors cursor-pointer">
                      <img src={c.kyc.panFrontUrl} alt="PAN card front" className="max-h-48 max-w-full object-contain bg-muted" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <ExternalLink className="w-5 h-5 text-white drop-shadow-lg" />
                      </div>
                    </a>
                  </div>
                )}

                {!c.kyc.panFrontUrl && !c.kyc.panName && !c.kyc.panNumber && (
                  <div className="py-6 flex flex-col items-center text-muted-foreground">
                    <FileCheck className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">KYC not submitted yet</p>
                  </div>
                )}

                {(c.kyc.idProofUrl || c.kyc.addressProofUrl) && (
                  <div className="text-xs text-muted-foreground border-t pt-3 flex items-center gap-3">
                    <span className="font-medium">Legacy docs:</span>
                    {c.kyc.idProofUrl && <a href={c.kyc.idProofUrl} target="_blank" rel="noreferrer" className="text-primary underline hover:no-underline cursor-pointer">ID Proof</a>}
                    {c.kyc.addressProofUrl && <a href={c.kyc.addressProofUrl} target="_blank" rel="noreferrer" className="text-primary underline hover:no-underline cursor-pointer">Address Proof</a>}
                  </div>
                )}

                {c.kyc.reviewedAt && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />Last reviewed: {new Date(c.kyc.reviewedAt).toLocaleString("en-IN")}
                  </p>
                )}

                {/* Admin action */}
                <div className="border-t pt-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label className="text-xs">Update Status</Label>
                      <Select value={kycStatus || "pending"} onValueChange={setKycStatus}>
                        <SelectTrigger className="mt-1 cursor-pointer"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending Review</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">
                        Admin Note {kycStatus === "rejected" && <span className="text-destructive">*</span>}
                        <span className="text-muted-foreground font-normal ml-1">
                          {kycStatus === "rejected" ? "(required — visible to creator)" : "(optional)"}
                        </span>
                      </Label>
                      <Textarea
                        value={kycNote}
                        onChange={e => setKycNote(e.target.value)}
                        rows={2}
                        className="mt-1"
                        placeholder={kycStatus === "rejected" ? "e.g. PAN image is blurry, please re-upload." : ""}
                      />
                      {kycStatus === "rejected" && kycNote.trim().length < 5 && (
                        <p className="text-[11px] text-destructive mt-1">Min. 5 characters required for rejection reason.</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full cursor-pointer"
                    onClick={() => {
                      if (kycStatus === "rejected" && kycNote.trim().length < 5) {
                        toast({ title: "Reason required", description: "Add a rejection reason of at least 5 characters.", variant: "destructive" });
                        return;
                      }
                      patchMut.mutate({ kycStatus, kycAdminNote: kycNote });
                    }}
                    disabled={patchMut.isPending || (kycStatus === "rejected" && kycNote.trim().length < 5)}
                    variant={kycStatus === "rejected" ? "destructive" : kycStatus === "approved" ? "default" : "secondary"}
                    data-testid="button-update-kyc"
                  >
                    {kycStatus === "approved" ? (
                      <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" />Approve KYC</>
                    ) : kycStatus === "rejected" ? (
                      <><ShieldX className="w-3.5 h-3.5 mr-1.5" />Reject KYC</>
                    ) : "Update KYC"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Bank Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />Bank Details</CardTitle>
              </CardHeader>
              <CardContent>
                {hasBankDetails ? (
                  <div className="space-y-4">
                    {[
                      { label: "Account Holder", value: c.bank.accountHolderName },
                      { label: "Account Number", value: c.bank.accountNumber, mono: true },
                      { label: "IFSC Code", value: c.bank.ifscCode, mono: true },
                      { label: "Bank Name", value: c.bank.bankName },
                      { label: "UPI ID", value: c.bank.upiId, mono: true },
                    ].filter(f => f.value).map(f => (
                      <div key={f.label} className="flex items-center justify-between py-2 border-b last:border-0">
                        <span className="text-xs text-muted-foreground">{f.label}</span>
                        <span className={`text-sm font-medium ${f.mono ? "font-mono" : ""}`}>{f.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 flex flex-col items-center text-muted-foreground">
                    <Building2 className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">No bank details added yet</p>
                    <p className="text-[11px] mt-1">Creator needs to add bank info from their dashboard</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Courses Tab */}
        <TabsContent value="courses">
          <Card>
            <CardContent className="p-0">
              {data.courses.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-muted-foreground">
                  <BookOpen className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No courses assigned</p>
                  <p className="text-[11px] mt-1">Assign courses to this creator from the Courses page</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="py-3 px-4 text-left text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Course</th>
                        <th className="py-3 px-4 text-right text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Price</th>
                        <th className="py-3 px-4 text-right text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Sales</th>
                        <th className="py-3 px-4 text-right text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Earnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.courses.map(co => (
                        <tr key={co.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer">
                          <td className="py-3 px-4 font-medium">{co.title}</td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{fmt(co.price)}</td>
                          <td className="py-3 px-4 text-right">
                            <span className="inline-flex items-center gap-1">{co.salesCount}<TrendingUp className="w-3 h-3 text-muted-foreground" /></span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-400">{fmt(co.totalEarnings)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {data.courses.length > 1 && (
                      <tfoot>
                        <tr className="bg-muted/30 font-medium">
                          <td className="py-3 px-4">Total</td>
                          <td className="py-3 px-4 text-right" />
                          <td className="py-3 px-4 text-right">{totalSales}</td>
                          <td className="py-3 px-4 text-right text-emerald-400">{fmt(totalEarnings)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commissions Tab */}
        <TabsContent value="commissions">
          <Card>
            <CardContent className="p-0">
              {data.commissions.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-muted-foreground">
                  <IndianRupee className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No commissions recorded yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="py-3 px-4 text-left text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Date</th>
                        <th className="py-3 px-4 text-left text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Source</th>
                        <th className="py-3 px-4 text-right text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Sale Amount</th>
                        <th className="py-3 px-4 text-right text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Commission</th>
                        <th className="py-3 px-4 text-center text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.commissions.slice(0, 100).map(co => (
                        <tr key={co.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer">
                          <td className="py-3 px-4 text-xs text-muted-foreground">{new Date(co.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                          <td className="py-3 px-4 font-medium">{co.courseTitle ?? co.bundleName ?? "—"}</td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{fmt(co.saleAmount)}</td>
                          <td className="py-3 px-4 text-right font-semibold">{fmt(co.commissionAmount)}</td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className={`text-[10px] ${co.status === "paid" ? "text-emerald-400 border-emerald-400/30" : co.status === "cancelled" ? "text-red-400 border-red-400/30" : "text-amber-400 border-amber-400/30"}`}>
                              {co.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payouts Tab */}
        <TabsContent value="payouts">
          <Card>
            <CardContent className="p-0">
              {data.payouts.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-muted-foreground">
                  <CreditCard className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No payouts processed yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="py-3 px-4 text-left text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Released</th>
                        <th className="py-3 px-4 text-right text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Amount</th>
                        <th className="py-3 px-4 text-center text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Status</th>
                        <th className="py-3 px-4 text-left text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Paid At</th>
                        <th className="py-3 px-4 text-left text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payouts.map(p => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer">
                          <td className="py-3 px-4 text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                          <td className="py-3 px-4 text-right font-semibold">{fmt(p.amount)}</td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className={`text-[10px] ${p.status === "paid" ? "text-emerald-400 border-emerald-400/30" : p.status === "failed" ? "text-red-400 border-red-400/30" : "text-amber-400 border-amber-400/30"}`}>
                              {p.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">{p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                          <td className="py-3 px-4 text-xs font-mono text-muted-foreground">{p.paymentReference ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><StickyNote className="w-4 h-4 text-primary" />Internal Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={5}
                placeholder="Add private notes about this creator (not visible to them)…"
                className="resize-y"
              />
              <Button
                size="sm"
                className="cursor-pointer"
                onClick={() => patchMut.mutate({ notes })}
                disabled={patchMut.isPending}
              >
                Save Notes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
