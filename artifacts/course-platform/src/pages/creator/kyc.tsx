import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface KycData {
  kyc: {
    panNumber: string | null;
    idProofUrl: string | null;
    addressProofUrl: string | null;
    status: "pending" | "approved" | "rejected" | null;
    adminNote: string | null;
    reviewedAt: string | null;
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

async function saveKyc(payload: KycData): Promise<void> {
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

function statusVariant(s: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (s === "approved") return "default";
  if (s === "rejected") return "destructive";
  return "secondary";
}

export default function CreatorKycPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["creator-kyc"], queryFn: fetchKyc });
  const [form, setForm] = useState<KycData | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const mut = useMutation({
    mutationFn: saveKyc,
    onSuccess: () => {
      toast({ title: "Saved", description: "Your KYC and bank details are updated." });
      qc.invalidateQueries({ queryKey: ["creator-kyc"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !form) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  function update<K extends keyof KycData>(section: K, field: keyof KycData[K], value: string) {
    setForm(prev => prev ? { ...prev, [section]: { ...prev[section], [field]: value } } as KycData : prev);
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">KYC & Bank Details</h1>
        <p className="text-sm text-muted-foreground">These are the only fields you can edit. All other data is read-only.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">KYC Verification</CardTitle>
          <Badge variant={statusVariant(form.kyc.status)}>
            {form.kyc.status ?? "not submitted"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.kyc.status === "rejected" && form.kyc.adminNote && (
            <Alert variant="destructive">
              <AlertDescription><b>Admin note:</b> {form.kyc.adminNote}</AlertDescription>
            </Alert>
          )}
          <div>
            <Label htmlFor="pan">PAN Number</Label>
            <Input
              id="pan"
              value={form.kyc.panNumber ?? ""}
              onChange={e => update("kyc", "panNumber", e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
              maxLength={10}
              className="uppercase"
            />
          </div>
          <div>
            <Label htmlFor="idproof">ID Proof URL (Aadhaar / Passport)</Label>
            <Input
              id="idproof"
              value={form.kyc.idProofUrl ?? ""}
              onChange={e => update("kyc", "idProofUrl", e.target.value)}
              placeholder="https://..."
            />
            <p className="text-[11px] text-muted-foreground mt-1">Upload your document to a hosted URL (Drive, S3, etc.) and paste the link.</p>
          </div>
          <div>
            <Label htmlFor="addrproof">Address Proof URL</Label>
            <Input
              id="addrproof"
              value={form.kyc.addressProofUrl ?? ""}
              onChange={e => update("kyc", "addressProofUrl", e.target.value)}
              placeholder="https://..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bank Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="holder">Account Holder Name</Label>
            <Input id="holder" value={form.bank.accountHolderName ?? ""} onChange={e => update("bank", "accountHolderName", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="accno">Account Number</Label>
              <Input id="accno" value={form.bank.accountNumber ?? ""} onChange={e => update("bank", "accountNumber", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ifsc">IFSC Code</Label>
              <Input id="ifsc" value={form.bank.ifscCode ?? ""} onChange={e => update("bank", "ifscCode", e.target.value.toUpperCase())} className="uppercase" />
            </div>
          </div>
          <div>
            <Label htmlFor="bank">Bank Name</Label>
            <Input id="bank" value={form.bank.bankName ?? ""} onChange={e => update("bank", "bankName", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="upi">UPI ID (optional)</Label>
            <Input id="upi" value={form.bank.upiId ?? ""} onChange={e => update("bank", "upiId", e.target.value)} placeholder="yourname@bankupi" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate(form)} disabled={mut.isPending}>
          {mut.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
