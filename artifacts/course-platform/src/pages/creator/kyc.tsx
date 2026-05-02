import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ImageUploader } from "@/components/image-uploader";
import { useToast } from "@/hooks/use-toast";
import { Lock, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface KycData {
  kyc: {
    panName: string | null;
    panNumber: string | null;
    panFrontUrl: string | null;
    idProofUrl: string | null;
    addressProofUrl: string | null;
    status: "pending" | "approved" | "rejected" | null;
    adminNote: string | null;
    reviewedAt: string | null;
    locked: boolean;
    submitted: boolean;
  };
  bank: {
    accountHolderName: string | null;
    accountNumber: string | null;
    ifscCode: string | null;
    bankName: string | null;
    upiId: string | null;
  };
}

async function fetchKyc(): Promise<KycData> {
  const res = await fetch(`${API_BASE}/api/creator/kyc`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function saveKyc(payload: Partial<KycData>): Promise<void> {
  const res = await fetch(`${API_BASE}/api/creator/kyc`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Save failed");
  }
}

export default function CreatorKycPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["creator-kyc"], queryFn: fetchKyc });
  const [form, setForm] = useState<KycData | null>(null);

  useEffect(() => {
    // Always refresh from server (so lock state updates after admin review).
    if (data) setForm(data);
  }, [data]);

  const kycMut = useMutation({
    mutationFn: (kyc: { panName: string; panNumber: string; panFrontUrl: string }) =>
      saveKyc({ kyc: kyc as any }),
    onSuccess: () => {
      toast({ title: "KYC submitted", description: "Admin will review shortly. Your details are now locked until then." });
      qc.invalidateQueries({ queryKey: ["creator-kyc"] });
    },
    onError: (e: Error) => toast({ title: "Could not submit KYC", description: e.message, variant: "destructive" }),
  });

  const bankMut = useMutation({
    mutationFn: (bank: KycData["bank"]) => saveKyc({ bank: bank as any }),
    onSuccess: () => {
      toast({ title: "Bank details saved" });
      qc.invalidateQueries({ queryKey: ["creator-kyc"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !form) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const locked = form.kyc.locked;
  const status = form.kyc.status;

  function setKyc<K extends keyof KycData["kyc"]>(field: K, value: KycData["kyc"][K]) {
    setForm(prev => prev ? { ...prev, kyc: { ...prev.kyc, [field]: value } } : prev);
  }
  function setBank<K extends keyof KycData["bank"]>(field: K, value: KycData["bank"][K]) {
    setForm(prev => prev ? { ...prev, bank: { ...prev.bank, [field]: value } } : prev);
  }

  function submitKyc() {
    const panName = (form?.kyc.panName ?? "").trim();
    const panNumber = (form?.kyc.panNumber ?? "").trim().toUpperCase();
    const panFrontUrl = (form?.kyc.panFrontUrl ?? "").trim();
    if (!panName) { toast({ title: "Name required", description: "Enter the name exactly as on your PAN card.", variant: "destructive" }); return; }
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) { toast({ title: "Invalid PAN", description: "PAN format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F).", variant: "destructive" }); return; }
    if (!panFrontUrl) { toast({ title: "PAN image required", description: "Upload a clear photo of your PAN card front side.", variant: "destructive" }); return; }
    kycMut.mutate({ panName, panNumber, panFrontUrl });
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">KYC &amp; Bank Details</h1>
        <p className="text-sm text-muted-foreground">
          Submit your PAN details for verification. Once submitted, your KYC fields are locked until admin reviews them.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            KYC Verification
            {locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
          </CardTitle>
          {status === "approved" ? (
            <Badge className="bg-emerald-500 hover:bg-emerald-500"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>
          ) : status === "rejected" ? (
            <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Rejected</Badge>
          ) : form.kyc.submitted ? (
            <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Under Review</Badge>
          ) : (
            <Badge variant="outline">Not Submitted</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "rejected" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <b>Rejected by admin.</b>
                {form.kyc.adminNote && (<> Reason: <i>{form.kyc.adminNote}</i></>)}
                {" "}Please correct the details and re-submit.
              </AlertDescription>
            </Alert>
          )}
          {status === "approved" && (
            <Alert className="border-emerald-500/40 bg-emerald-500/5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <AlertDescription>Your KYC is approved. Contact admin if you need to make changes.</AlertDescription>
            </Alert>
          )}
          {locked && status === "pending" && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>Your KYC is under review. Fields are locked until admin approves or rejects.</AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="panName">Name (as on PAN card)</Label>
            <Input
              id="panName"
              value={form.kyc.panName ?? ""}
              onChange={e => setKyc("panName", e.target.value)}
              placeholder="e.g. RAHUL KUMAR SHARMA"
              disabled={locked}
              data-testid="input-pan-name"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Enter exactly as printed on your PAN card.</p>
          </div>

          <div>
            <Label htmlFor="pan">PAN Number</Label>
            <Input
              id="pan"
              value={form.kyc.panNumber ?? ""}
              onChange={e => setKyc("panNumber", e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
              maxLength={10}
              className="uppercase"
              disabled={locked}
              data-testid="input-pan-number"
            />
          </div>

          <div>
            <ImageUploader
              label="Upload PAN Card (front side)"
              hint="Clear photo or scan · JPG / PNG / WebP · Max 10MB"
              aspectRatio="banner"
              value={form.kyc.panFrontUrl ?? ""}
              onChange={url => !locked && setKyc("panFrontUrl", url)}
            />
            {locked && (
              <p className="text-[11px] text-muted-foreground mt-1">Uploads disabled while KYC is locked.</p>
            )}
          </div>

          {!locked && (
            <div className="flex justify-end pt-2">
              <Button onClick={submitKyc} disabled={kycMut.isPending} data-testid="button-submit-kyc">
                {kycMut.isPending ? "Submitting…" : status === "rejected" ? "Re-submit KYC" : "Submit KYC"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bank Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="holder">Account Holder Name</Label>
            <Input id="holder" value={form.bank.accountHolderName ?? ""} onChange={e => setBank("accountHolderName", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="accno">Account Number</Label>
              <Input id="accno" value={form.bank.accountNumber ?? ""} onChange={e => setBank("accountNumber", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ifsc">IFSC Code</Label>
              <Input id="ifsc" value={form.bank.ifscCode ?? ""} onChange={e => setBank("ifscCode", e.target.value.toUpperCase())} className="uppercase" />
            </div>
          </div>
          <div>
            <Label htmlFor="bank">Bank Name</Label>
            <Input id="bank" value={form.bank.bankName ?? ""} onChange={e => setBank("bankName", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="upi">UPI ID (optional)</Label>
            <Input id="upi" value={form.bank.upiId ?? ""} onChange={e => setBank("upiId", e.target.value)} placeholder="yourname@bankupi" />
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => bankMut.mutate(form!.bank)} disabled={bankMut.isPending} data-testid="button-save-bank">
              {bankMut.isPending ? "Saving…" : "Save Bank Details"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
