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
import { ArrowLeft } from "lucide-react";
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

  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const c = data.creator;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href={`${base}/creators`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{c.name}</h1>
            <p className="text-xs text-muted-foreground">{c.email} · joined {new Date(c.createdAt).toLocaleDateString("en-IN")}</p>
          </div>
        </div>
        <Badge variant={c.status === "active" ? "default" : "destructive"}>{c.status}</Badge>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="kyc">KYC & Bank</TabsTrigger>
          <TabsTrigger value="courses">Courses ({data.courses.length})</TabsTrigger>
          <TabsTrigger value="commissions">Commissions ({data.commissions.length})</TabsTrigger>
          <TabsTrigger value="payouts">Payouts ({data.payouts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Internal Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
              <Button size="sm" onClick={() => patchMut.mutate({ notes })} disabled={patchMut.isPending}>Save Notes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kyc" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">KYC Review</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><b>Name (as on PAN):</b> {c.kyc.panName || "—"}</div>
                <div><b>PAN Number:</b> {c.kyc.panNumber || "—"}</div>
                <div><b>Reviewed:</b> {c.kyc.reviewedAt ? new Date(c.kyc.reviewedAt).toLocaleString("en-IN") : "Not reviewed"}</div>
                <div><b>Current Status:</b> {c.kyc.status || "—"}</div>
                <div className="md:col-span-2">
                  <b>PAN Card (front):</b>
                  {c.kyc.panFrontUrl ? (
                    <div className="mt-2">
                      <a href={c.kyc.panFrontUrl} target="_blank" rel="noreferrer" className="inline-block border rounded-md overflow-hidden hover:opacity-90">
                        <img src={c.kyc.panFrontUrl} alt="PAN card front" className="max-h-64 max-w-full object-contain bg-muted" />
                      </a>
                      <div className="text-[11px] text-muted-foreground mt-1">Click image to open full size in new tab</div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground"> — not uploaded</span>
                  )}
                </div>
                {(c.kyc.idProofUrl || c.kyc.addressProofUrl) && (
                  <div className="md:col-span-2 text-xs text-muted-foreground border-t pt-2">
                    Legacy: {c.kyc.idProofUrl && <a href={c.kyc.idProofUrl} target="_blank" rel="noreferrer" className="text-primary underline mr-3">ID Proof</a>}
                    {c.kyc.addressProofUrl && <a href={c.kyc.addressProofUrl} target="_blank" rel="noreferrer" className="text-primary underline">Address Proof</a>}
                  </div>
                )}
              </div>
              <div className="border-t pt-3 space-y-3">
                <div>
                  <Label>Set Status</Label>
                  <Select value={kycStatus || "pending"} onValueChange={setKycStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending Review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>
                    Admin Note {kycStatus === "rejected" && <span className="text-destructive">*</span>}
                    <span className="text-xs text-muted-foreground font-normal ml-1">
                      {kycStatus === "rejected"
                        ? "(required — visible to creator so they know what to fix)"
                        : "(optional)"}
                    </span>
                  </Label>
                  <Textarea
                    value={kycNote}
                    onChange={e => setKycNote(e.target.value)}
                    rows={3}
                    placeholder={kycStatus === "rejected" ? "e.g. PAN image is blurry, please re-upload a clearer photo." : ""}
                  />
                  {kycStatus === "rejected" && kycNote.trim().length < 5 && (
                    <p className="text-[11px] text-destructive mt-1">Please write at least 5 characters explaining the rejection reason.</p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    if (kycStatus === "rejected" && kycNote.trim().length < 5) {
                      toast({ title: "Reason required", description: "Add a rejection reason of at least 5 characters.", variant: "destructive" });
                      return;
                    }
                    patchMut.mutate({ kycStatus, kycAdminNote: kycNote });
                  }}
                  disabled={patchMut.isPending || (kycStatus === "rejected" && kycNote.trim().length < 5)}
                  variant={kycStatus === "rejected" ? "destructive" : "default"}
                  data-testid="button-update-kyc"
                >
                  {kycStatus === "approved" ? "Approve KYC" : kycStatus === "rejected" ? "Reject KYC" : "Update KYC"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Bank Details (read-only)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><Label className="text-xs">Holder</Label><Input value={c.bank.accountHolderName ?? "—"} readOnly /></div>
                <div><Label className="text-xs">Account No.</Label><Input value={c.bank.accountNumber ?? "—"} readOnly /></div>
                <div><Label className="text-xs">IFSC</Label><Input value={c.bank.ifscCode ?? "—"} readOnly /></div>
                <div><Label className="text-xs">Bank</Label><Input value={c.bank.bankName ?? "—"} readOnly /></div>
                <div className="md:col-span-2"><Label className="text-xs">UPI</Label><Input value={c.bank.upiId ?? "—"} readOnly /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="courses">
          <Card>
            <CardContent className="pt-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 px-2">Course</th>
                    <th className="py-2 px-2 text-right">Price</th>
                    <th className="py-2 px-2 text-right">Sales</th>
                    <th className="py-2 px-2 text-right">Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {data.courses.length === 0 ? (
                    <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No courses assigned.</td></tr>
                  ) : data.courses.map(co => (
                    <tr key={co.id} className="border-b last:border-0">
                      <td className="py-2 px-2">{co.title}</td>
                      <td className="py-2 px-2 text-right">{fmt(co.price)}</td>
                      <td className="py-2 px-2 text-right">{co.salesCount}</td>
                      <td className="py-2 px-2 text-right font-medium">{fmt(co.totalEarnings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions">
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2">Source</th>
                    <th className="py-2 px-2 text-right">Sale share</th>
                    <th className="py-2 px-2 text-right">Commission</th>
                    <th className="py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.commissions.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No commissions yet.</td></tr>
                  ) : data.commissions.slice(0, 100).map(co => (
                    <tr key={co.id} className="border-b last:border-0">
                      <td className="py-2 px-2 text-xs">{new Date(co.createdAt).toLocaleDateString("en-IN")}</td>
                      <td className="py-2 px-2">{co.courseTitle ?? co.bundleName ?? "—"}</td>
                      <td className="py-2 px-2 text-right">{fmt(co.saleAmount)}</td>
                      <td className="py-2 px-2 text-right font-medium">{fmt(co.commissionAmount)}</td>
                      <td className="py-2 px-2"><Badge variant={co.status === "paid" ? "default" : co.status === "cancelled" ? "destructive" : "secondary"}>{co.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 px-2">Released</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2">Paid At</th>
                    <th className="py-2 px-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payouts.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No payouts yet.</td></tr>
                  ) : data.payouts.map(p => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 px-2 text-xs">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                      <td className="py-2 px-2 text-right font-medium">{fmt(p.amount)}</td>
                      <td className="py-2 px-2"><Badge variant={p.status === "paid" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge></td>
                      <td className="py-2 px-2 text-xs">{p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="py-2 px-2 text-xs font-mono">{p.paymentReference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
