import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Wallet, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "paid") return "default";
  if (s === "failed" || s === "cancelled") return "destructive";
  return "secondary";
}

export default function AdminCreatorPayoutsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("pending");
  const [markDialog, setMarkDialog] = useState<Payout | null>(null);
  const [markForm, setMarkForm] = useState({ status: "paid", paymentMethod: "bank", paymentReference: "", notes: "" });

  const { data: payouts, isLoading } = useQuery<Payout[]>({
    queryKey: ["admin-creator-payouts", tab],
    queryFn: () => apiFetch(`/api/admin/creator-payouts${tab === "all" ? "" : `?status=${tab}`}`),
  });

  const releaseMut = useMutation({
    mutationFn: () => apiFetch("/api/admin/creator-payouts/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }),
    onSuccess: (data: { payoutCount: number; totalAmount: number }) => {
      toast({ title: "Payouts released", description: `${data.payoutCount} payout(s) totalling ${fmt(data.totalAmount)}` });
      qc.invalidateQueries({ queryKey: ["admin-creator-payouts"] });
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
      setMarkDialog(null);
      setMarkForm({ status: "paid", paymentMethod: "bank", paymentReference: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Creator Payouts</h1>
          <p className="text-sm text-muted-foreground">Saturday auto-release runs hourly. You can also release manually below.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runCycleMut.mutate()} disabled={runCycleMut.isPending}>
            <PlayCircle className="w-4 h-4 mr-2" />
            Run Saturday Cycle Now
          </Button>
          <Button onClick={() => releaseMut.mutate()} disabled={releaseMut.isPending}>
            <Wallet className="w-4 h-4 mr-2" />
            Release All Pending
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base capitalize">{tab} Payouts</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : !payouts || payouts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No payouts in this tab.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="py-2 px-2">Creator</th>
                        <th className="py-2 px-2">Released</th>
                        <th className="py-2 px-2 text-right">Amount</th>
                        <th className="py-2 px-2">Status</th>
                        <th className="py-2 px-2">By</th>
                        <th className="py-2 px-2">Reference</th>
                        <th className="py-2 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map(p => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-2">
                            <div className="font-medium">{p.creatorName}</div>
                            <div className="text-xs text-muted-foreground">{p.creatorEmail}</div>
                          </td>
                          <td className="py-2 px-2 text-xs">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                          <td className="py-2 px-2 text-right font-semibold">{fmt(p.amount)}</td>
                          <td className="py-2 px-2"><Badge variant={statusVariant(p.status)}>{p.status}</Badge></td>
                          <td className="py-2 px-2 text-xs">{p.releasedBy ?? "—"}</td>
                          <td className="py-2 px-2 text-xs font-mono">{p.paymentReference ?? "—"}</td>
                          <td className="py-2 px-2 text-right">
                            {p.status === "pending" && (
                              <Button size="sm" variant="outline" onClick={() => setMarkDialog(p)}>Mark…</Button>
                            )}
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
      </Tabs>

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
