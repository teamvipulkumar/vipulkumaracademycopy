import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserPlus, ChevronRight, ShieldOff, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminBase } from "@/lib/auth-context";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

export default function AdminCreatorsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const base = useAdminBase();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ email: "", notes: "" });

  const { data: creators, isLoading } = useQuery<Creator[]>({
    queryKey: ["admin-creators"],
    queryFn: () => apiFetch("/api/admin/creators"),
  });

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
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Creators</h1>
          <p className="text-sm text-muted-foreground">Mark existing users as creators. They earn 25% of each sale of their assigned courses.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Add Creator
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Creators</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !creators || creators.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No creators yet. Click "Add Creator" to mark an existing user.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="py-2 px-2">Name / Email</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2">KYC</th>
                    <th className="py-2 px-2 text-right">Courses</th>
                    <th className="py-2 px-2 text-right">Lifetime</th>
                    <th className="py-2 px-2 text-right">Pending</th>
                    <th className="py-2 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {creators.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.email}</div>
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant={c.status === "active" ? "default" : "destructive"}>{c.status}</Badge>
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant={c.kycStatus === "approved" ? "default" : c.kycStatus === "rejected" ? "destructive" : "secondary"}>
                          {c.kycStatus ?? "not submitted"}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right">{c.courseCount}</td>
                      <td className="py-2 px-2 text-right">{fmt(c.totalEarnings)}</td>
                      <td className="py-2 px-2 text-right">{fmt(c.pendingAmount)}</td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleMut.mutate({ id: c.id, status: c.status === "active" ? "revoked" : "active" })}
                            disabled={toggleMut.isPending}
                          >
                            {c.status === "active" ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          </Button>
                          <Link href={`${base}/creators/${c.id}`}>
                            <Button variant="ghost" size="sm">
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
        </CardContent>
      </Card>

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
