import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { UserPlus, Shield, ShieldOff, Trash2, Pencil, ShieldCheck, KeyRound, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface StaffPermissions {
  dashboard: boolean; orders: boolean; enrollments: boolean; coupons: boolean;
  affiliates: boolean; payouts: boolean; courses: boolean; pages: boolean;
  files: boolean; users: boolean; crm: boolean; paymentGateways: boolean;
  gstInvoicing: boolean; settings: boolean;
}

interface StaffMember {
  id: number; userId: number; name: string; email: string; roleName: string;
  permissions: StaffPermissions; previousRole: string; status: "active" | "revoked";
  invitedBy: number | null; notes: string | null; createdAt: string;
}

const DEFAULT_PERMISSIONS: StaffPermissions = {
  dashboard: true, orders: false, enrollments: false, coupons: false, affiliates: false,
  payouts: false, courses: false, pages: false, files: false, users: false,
  crm: false, paymentGateways: false, gstInvoicing: false, settings: false,
};

const PRESETS: Record<string, { label: string; permissions: StaffPermissions }> = {
  content_manager: { label: "Content Manager", permissions: { ...DEFAULT_PERMISSIONS, courses: true, pages: true, files: true } },
  sales_manager: { label: "Sales Manager", permissions: { ...DEFAULT_PERMISSIONS, orders: true, enrollments: true, coupons: true, affiliates: true } },
  support_agent: { label: "Support Agent", permissions: { ...DEFAULT_PERMISSIONS, users: true, orders: true, enrollments: true } },
  affiliate_manager: { label: "Affiliate Manager", permissions: { ...DEFAULT_PERMISSIONS, affiliates: true, payouts: true } },
  finance_manager: { label: "Finance Manager", permissions: { ...DEFAULT_PERMISSIONS, orders: true, paymentGateways: true, gstInvoicing: true } },
  full_access: {
    label: "Full Access",
    permissions: {
      dashboard: true, orders: true, enrollments: true, coupons: true, affiliates: true,
      payouts: true, courses: true, pages: true, files: true, users: true,
      crm: true, paymentGateways: true, gstInvoicing: true, settings: true,
    },
  },
};

const PERMISSION_GROUPS = [
  { label: "Overview", items: [{ key: "dashboard", label: "Dashboard" }] },
  { label: "Sales", items: [{ key: "orders", label: "Orders" }, { key: "enrollments", label: "Enrollments" }, { key: "coupons", label: "Coupons" }, { key: "affiliates", label: "Affiliates" }, { key: "payouts", label: "Payouts" }] },
  { label: "Content", items: [{ key: "courses", label: "Courses" }, { key: "pages", label: "Pages" }, { key: "files", label: "Files" }] },
  { label: "Users & CRM", items: [{ key: "users", label: "Users" }, { key: "crm", label: "CRM & Email" }] },
  { label: "Finance", items: [{ key: "paymentGateways", label: "Payment Gateways" }, { key: "gstInvoicing", label: "GST Invoicing" }] },
  { label: "Configuration", items: [{ key: "settings", label: "Settings" }] },
];

const emptyForm = { email: "", name: "", roleName: "", permissions: { ...DEFAULT_PERMISSIONS }, notes: "" };

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export default function AdminStaffPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, isStaff } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAdmin && isStaff) setLocation("/admin");
  }, [isAdmin, isStaff, setLocation]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [form, setForm] = useState(emptyForm);
  // After creating a brand-new staff user, show the auto-generated temp
  // password ONCE so the admin can share it. We never persist this in state
  // beyond dismissal — closing the dialog clears it permanently.
  const [credentialsToReveal, setCredentialsToReveal] = useState<{ email: string; password: string; name: string } | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | "both" | null>(null);

  function copyToClipboard(text: string, field: "email" | "password" | "both") {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  }

  const { data: staff = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ["admin-staff"],
    queryFn: () => apiFetch("/api/admin/staff"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => apiFetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: (created: StaffMember & { generatedPassword: string | null }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      setModalOpen(false);
      // If the API generated a temp password (i.e. a brand-new account was
      // created), show it once to the admin so they can pass it on. For
      // existing users we just confirm the addition silently.
      if (created.generatedPassword) {
        setCredentialsToReveal({ email: created.email, password: created.generatedPassword, name: created.name });
      } else {
        toast({ title: "Staff member added", description: "Existing user — they can keep using their current password." });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof emptyForm> }) => apiFetch(`/api/admin/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-staff"] }); toast({ title: "Staff member updated" }); setModalOpen(false); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/staff/${id}/revoke`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-staff"] }); toast({ title: "Access revoked" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/staff/${id}/restore`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-staff"] }); toast({ title: "Access restored" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/staff/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-staff"] }); toast({ title: "Staff member removed" }); setDeleteTarget(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(member: StaffMember) {
    setEditTarget(member);
    setForm({ email: member.email, name: member.name, roleName: member.roleName, permissions: { ...member.permissions }, notes: member.notes ?? "" });
    setModalOpen(true);
  }

  function applyPreset(key: string) {
    const preset = PRESETS[key];
    if (!preset) return;
    setForm(f => ({ ...f, roleName: preset.label, permissions: { ...preset.permissions } }));
  }

  function togglePerm(key: string) {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key as keyof StaffPermissions] } }));
  }

  function handleSubmit() {
    if (!form.email || !form.name || !form.roleName) {
      toast({ title: "Fill in all required fields", variant: "destructive" }); return;
    }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: { roleName: form.roleName, permissions: form.permissions, notes: form.notes } });
    } else {
      createMutation.mutate(form);
    }
  }

  const activeCount = staff.filter(s => s.status === "active").length;
  const revokedCount = staff.filter(s => s.status === "revoked").length;
  const isPending = createMutation.isPending || updateMutation.isPending;

  function permCount(s: StaffMember) {
    return Object.values(s.permissions).filter(Boolean).length;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-primary" /> Staff & Access</h1>
          <p className="text-muted-foreground mt-1">Add team members, assign roles and permissions, revoke access anytime.</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><UserPlus className="w-4 h-4" /> Add Staff Member</Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total Staff", value: staff.length, sub: "registered members" },
          { label: "Active", value: activeCount, sub: "with admin access" },
          { label: "Revoked", value: revokedCount, sub: "access removed" },
        ].map(s => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground mb-1">{s.label}</div>
              <div className="text-2xl font-bold mb-0.5">{s.value}</div>
              <div className="text-xs text-primary">{s.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Team Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : staff.length === 0 ? (
            <div className="p-12 text-center">
              <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No staff members yet.</p>
              <p className="text-muted-foreground/60 text-xs mt-1">Click "Add Staff Member" to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {staff.map(member => (
                <div key={member.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">{member.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{member.name}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-medium border-primary/30 text-primary">{member.roleName}</Badge>
                      <Badge variant="outline" className={`text-[10px] h-4 px-1.5 border ${member.status === "active" ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                        {member.status === "active" ? "Active" : "Revoked"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{member.email}</p>
                    <p className="text-xs text-muted-foreground/50 mt-0.5">
                      {permCount(member)} permission{permCount(member) !== 1 ? "s" : ""} granted · Added {new Date(member.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(member)} title="Edit permissions">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {member.status === "active" ? (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10" onClick={() => revokeMutation.mutate(member.id)} title="Revoke access">
                        <ShieldOff className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-500 hover:text-green-400 hover:bg-green-500/10" onClick={() => restoreMutation.mutate(member.id)} title="Restore access">
                        <Shield className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(member)} title="Remove">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {!editTarget && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Email <span className="text-destructive">*</span></Label>
                  <Input placeholder="staff@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  <p className="text-[11px] text-muted-foreground">Existing user or a new account will be created.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Full Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="Jane Doe" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
              </div>
            )}

            {editTarget && (
              <div className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">{editTarget.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{editTarget.name}</p>
                  <p className="text-xs text-muted-foreground">{editTarget.email}</p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Role Label <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Content Manager" value={form.roleName} onChange={e => setForm(f => ({ ...f, roleName: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground mb-1">Quick presets — click to auto-fill role and permissions:</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(PRESETS).map(([key, p]) => (
                  <button key={key} type="button"
                    onClick={() => applyPreset(key)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${form.roleName === p.label ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Access Permissions</Label>
              <div className="border border-border rounded-lg divide-y divide-border">
                {PERMISSION_GROUPS.map(group => (
                  <div key={group.label} className="px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2.5">{group.label}</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {group.items.map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer group">
                          <Checkbox
                            checked={form.permissions[item.key as keyof StaffPermissions]}
                            onCheckedChange={() => togglePerm(item.key)}
                          />
                          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Textarea placeholder="Internal notes about this team member…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none" />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving…" : editTarget ? "Save Changes" : "Add Staff Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time reveal of the auto-generated temp password for a new staff account */}
      <Dialog open={!!credentialsToReveal} onOpenChange={(o) => { if (!o) setCredentialsToReveal(null); }}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" /> Share these credentials with {credentialsToReveal?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300/90">
              <strong className="text-amber-300">This password is shown only once.</strong> Copy it now and send it to the new staff member through a secure channel (e.g. password manager, encrypted chat). They can change it after first sign-in.
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm font-mono break-all">{credentialsToReveal?.email}</code>
                <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0 flex-shrink-0" onClick={() => credentialsToReveal && copyToClipboard(credentialsToReveal.email, "email")} title="Copy email">
                  {copiedField === "email" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Temporary password</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm font-mono break-all">{credentialsToReveal?.password}</code>
                <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0 flex-shrink-0" onClick={() => credentialsToReveal && copyToClipboard(credentialsToReveal.password, "password")} title="Copy password">
                  {copiedField === "password" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => credentialsToReveal && copyToClipboard(`Email: ${credentialsToReveal.email}\nPassword: ${credentialsToReveal.password}`, "both")}
            >
              {copiedField === "both" ? <><Check className="w-4 h-4 text-green-500" /> Copied both</> : <><Copy className="w-4 h-4" /> Copy email and password</>}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCredentialsToReveal(null)}>I've saved them</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deleteTarget?.name}</strong> from the team and revoke all admin access. Their user account remains but their role will be reset. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
