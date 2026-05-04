import { useState, useRef, useEffect } from "react";
import {
  useAdminListUsers, getAdminListUsersQueryKey,
  useAdminGetUser, getAdminGetUserQueryKey,
  useAdminUpdateUser, useBanUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  UserPlus, Search, Eye, Pencil, Trash2, ShieldCheck,
  GraduationCap, Share2, Mail, Calendar, BookOpen, BadgeIndianRupee,
  MoreHorizontal, CheckCircle, XCircle, Lock, Phone,
  Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Loader2,
  Square, CheckSquare, Ban, Package, CreditCard, Sparkles,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type User = {
  id: number; name: string; email: string; role: string;
  roles?: string[];
  isBanned: boolean; createdAt: string; avatarUrl?: string | null; referralCode?: string | null;
  phone?: string | null;
};

const roleColors: Record<string, string> = {
  admin: "text-red-400 border-red-400/30 bg-red-400/10",
  staff: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  creator: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  student: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  affiliate: "text-purple-400 border-purple-400/30 bg-purple-400/10",
};
const roleIcons: Record<string, React.ElementType> = {
  admin: ShieldCheck, staff: ShieldCheck, creator: Sparkles, student: GraduationCap, affiliate: Share2,
};

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : size === "lg" ? "w-14 h-14 text-xl" : "w-9 h-9 text-sm";
  const colors = ["bg-blue-600", "bg-purple-600", "bg-green-600", "bg-orange-600", "bg-pink-600", "bg-teal-600"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
type CsvRow = { name: string; email: string; password: string; role: string; phone: string };

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  if (lines.length < 2) return [];
  const headerRaw = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
  const nameIdx    = headerRaw.findIndex(h => h === "name");
  const emailIdx   = headerRaw.findIndex(h => h === "email");
  const passIdx    = headerRaw.findIndex(h => ["password", "pass"].includes(h));
  const roleIdx    = headerRaw.findIndex(h => h === "role");
  const phoneIdx   = headerRaw.findIndex(h => ["phone", "mobile", "mobile_number", "phone_number"].includes(h));

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    return {
      name:     nameIdx  >= 0 ? cols[nameIdx]  ?? "" : "",
      email:    emailIdx >= 0 ? cols[emailIdx] ?? "" : "",
      password: passIdx  >= 0 ? cols[passIdx]  ?? "" : "",
      role:     roleIdx  >= 0 ? cols[roleIdx]  ?? "student" : "student",
      phone:    phoneIdx >= 0 ? cols[phoneIdx] ?? "" : "",
    };
  });
}

const TEMPLATE_CSV = `name,email,password,role,phone
Jane Doe,jane@example.com,Password@123,student,9876543210
John Smith,john@example.com,Password@123,affiliate,`;

// ── Import Users Dialog ───────────────────────────────────────────────────────
type Course = { id: number; title: string };

function ImportUsersDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; enrolled: number; errors: Array<{ row: number; email: string; error: string }>; total: number } | null>(null);
  const [enrollCourseId, setEnrollCourseId] = useState<string>("none");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/api/admin/courses`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setCourses(d); })
      .catch(() => {});
  }, [open]);

  const handleFile = (file: File) => {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = e => { const text = e.target?.result as string; setRows(parseCsv(text)); };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleFile(file);
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = { users: rows, updateExisting };
      if (enrollCourseId !== "none") body.enrollCourseId = parseInt(enrollCourseId);
      const res = await fetch(`${API_BASE}/api/admin/users/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      if (data.created > 0 || data.updated > 0) onSuccess();
      const parts = [];
      if (data.created > 0) parts.push(`${data.created} created`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.enrolled > 0) parts.push(`${data.enrolled} enrolled`);
      toast({ title: `${parts.join(", ")} of ${data.total} users` });
    } catch (err: unknown) {
      toast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "users-import-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const resetDialog = () => { setRows([]); setFileName(""); setResult(null); setEnrollCourseId("none"); setUpdateExisting(false); };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); resetDialog(); } }}>
      <DialogContent className="sm:max-w-2xl bg-[#0d1424] border-white/10 max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Download className="w-4 h-4 text-primary" />Import Users</DialogTitle>
          <DialogDescription>Upload a CSV file to bulk-create users. No row limit.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {!result ? (
            <>
              {/* Template download */}
              <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-4 h-4 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Required columns: <code className="text-primary font-mono">name, email, password</code></p>
                    <p className="text-[11px] text-muted-foreground">Optional: <code className="font-mono">role</code> (student / affiliate / admin), <code className="font-mono">phone</code> (mobile number)</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10 flex-shrink-0 gap-1.5 cursor-pointer" onClick={handleDownloadTemplate}>
                  <Download className="w-3.5 h-3.5" />Template
                </Button>
              </div>

              {/* Enroll in course */}
              <div className="flex items-center gap-3 p-3 bg-card/50 border border-border rounded-xl">
                <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">Auto-enroll in a course <span className="text-muted-foreground font-normal">(optional)</span></p>
                  <p className="text-[11px] text-muted-foreground">All successfully created users will be enrolled immediately</p>
                </div>
                <Select value={enrollCourseId} onValueChange={setEnrollCourseId}>
                  <SelectTrigger className="bg-card border-border w-48 flex-shrink-0 text-xs h-8">
                    <SelectValue placeholder="No course" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No enrollment</SelectItem>
                    {courses.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Update existing toggle */}
              <div
                className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${updateExisting ? "bg-amber-500/10 border-amber-500/30" : "bg-card/50 border-border"}`}
                onClick={() => setUpdateExisting(v => !v)}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${updateExisting ? "bg-amber-500/20" : "bg-muted/30"}`}>
                  {updateExisting
                    ? <CheckSquare className={`w-4 h-4 text-amber-400`} />
                    : <Square className="w-4 h-4 text-muted-foreground" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${updateExisting ? "text-amber-300" : "text-foreground"}`}>
                    Update existing users
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {updateExisting
                      ? "Existing emails will be updated (name, phone, role, password if provided)"
                      : "By default, rows with existing emails are skipped with an error"}
                  </p>
                </div>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${fileName ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-card/50"}`}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
                {fileName ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium text-foreground">{fileName}</span>
                    <button className="text-muted-foreground hover:text-foreground cursor-pointer" onClick={e => { e.stopPropagation(); resetDialog(); }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Download className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground">Drop your CSV here or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">Supports .csv files of any size</p>
                  </>
                )}
              </div>

              {/* Preview table */}
              {rows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{rows.length} rows detected — preview</p>
                    {rows.some(r => !r.name || !r.email || !r.password) && (
                      <span className="flex items-center gap-1 text-xs text-amber-400"><AlertCircle className="w-3 h-3" />Some rows have missing fields</span>
                    )}
                  </div>
                  <div className="border border-border rounded-xl overflow-hidden overflow-x-auto max-h-52">
                    <table className="w-full text-xs min-w-[480px]">
                      <thead className="bg-card border-b border-border">
                        <tr>
                          {["#", "Name", "Email", "Password", "Phone", "Role", "Valid"].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-muted-foreground font-semibold uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.slice(0, 20).map((r, i) => {
                          const valid = !!r.name && !!r.email && !!r.password;
                          return (
                            <tr key={i} className={valid ? "" : "bg-red-500/5"}>
                              <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                              <td className="px-3 py-2 text-foreground truncate max-w-[100px]">{r.name || <span className="text-red-400">missing</span>}</td>
                              <td className="px-3 py-2 text-foreground truncate max-w-[120px]">{r.email || <span className="text-red-400">missing</span>}</td>
                              <td className="px-3 py-2 text-muted-foreground">{r.password ? "••••••••" : <span className="text-red-400">missing</span>}</td>
                              <td className="px-3 py-2 text-muted-foreground font-mono">{r.phone || <span className="text-muted-foreground/50">—</span>}</td>
                              <td className="px-3 py-2">
                                <Badge className={`text-[10px] ${r.role === "admin" ? "text-red-400 border-red-400/30 bg-red-400/10" : r.role === "creator" ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" : r.role === "affiliate" ? "text-purple-400 border-purple-400/30 bg-purple-400/10" : "text-blue-400 border-blue-400/30 bg-blue-400/10"}`}>
                                  {r.role || "student"}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                {valid ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                              </td>
                            </tr>
                          );
                        })}
                        {rows.length > 20 && (
                          <tr><td colSpan={7} className="px-3 py-2 text-center text-muted-foreground">...and {rows.length - 20} more rows</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Results */
            <div className="space-y-4">
              <div className={`grid gap-3 grid-cols-2 sm:grid-cols-${[result.created > 0, result.updated > 0, result.enrolled > 0, result.errors.length > 0, true].filter(Boolean).length}`}>
                {result.created > 0 && (
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                    <p className="text-2xl font-bold text-green-400">{result.created}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Created</p>
                  </div>
                )}
                {result.updated > 0 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                    <p className="text-2xl font-bold text-amber-400">{result.updated}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Updated</p>
                  </div>
                )}
                {result.enrolled > 0 && (
                  <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-center">
                    <p className="text-2xl font-bold text-primary">{result.enrolled}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Enrolled</p>
                  </div>
                )}
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                  <p className="text-2xl font-bold text-red-400">{result.errors.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Errors</p>
                </div>
                <div className="p-3 bg-card border border-border rounded-xl text-center">
                  <p className="text-2xl font-bold text-foreground">{result.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Errors</p>
                  <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 border-b border-border/50 last:border-0 bg-red-500/5">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">Row {e.row}</span>
                        <span className="text-xs text-foreground truncate flex-1">{e.email}</span>
                        <span className="text-xs text-red-400 flex-shrink-0">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(result.created > 0 || result.updated > 0) && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <p className="text-sm text-green-400">
                    {[
                      result.created > 0 && `${result.created} user${result.created !== 1 ? "s" : ""} created`,
                      result.updated > 0 && `${result.updated} user${result.updated !== 1 ? "s" : ""} updated`,
                    ].filter(Boolean).join(", ")} successfully.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-4 flex-shrink-0">
          <Button variant="outline" onClick={() => { onClose(); resetDialog(); }} className="border-white/10 cursor-pointer">
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={loading || rows.length === 0} className="bg-primary gap-2 cursor-pointer">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Importing...</> : <><Download className="w-4 h-4" />Import {rows.length > 0 ? `${rows.length} Users` : "Users"}</>}
            </Button>
          )}
          {result && (
            <Button onClick={() => { resetDialog(); }} variant="outline" className="border-white/10 gap-2 cursor-pointer">
              <Download className="w-4 h-4" />Import Another File
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add User Dialog ───────────────────────────────────────────────────────────
function AddUserDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student" });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");
      toast({ title: "User created", description: `${form.name} has been added.` });
      onSuccess();
      onClose();
      setForm({ name: "", email: "", password: "", role: "student" });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-[#0d1424] border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" />Add New User</DialogTitle>
          <DialogDescription>Create a new user account manually.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-name">Full Name</Label>
            <Input id="add-name" placeholder="John Doe" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="bg-card border-border" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-email">Email Address</Label>
            <Input id="add-email" type="email" placeholder="john@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required className="bg-card border-border" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-password">Password</Label>
            <Input id="add-password" type="password" placeholder="Minimum 6 characters" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={6} className="bg-card border-border" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-role">Role</Label>
            <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
              <SelectTrigger className="bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="affiliate">Affiliate</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-white/10 cursor-pointer">Cancel</Button>
            <Button type="submit" disabled={loading} className="bg-primary cursor-pointer">
              {loading ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit User Dialog ──────────────────────────────────────────────────────────
function EditUserDialog({ user, onClose, onSuccess }: { user: User; onClose: () => void; onSuccess: () => void }) {
  const baseRole = (() => {
    const r = user.roles ?? [user.role];
    if (r.includes("admin")) return "admin";
    if (r.includes("affiliate")) return "affiliate";
    return "student";
  })();
  const [form, setForm] = useState({
    name: user.name, email: user.email, role: baseRole, password: "", phone: user.phone ?? "",
    isCreator: user.roles?.includes("creator") ?? user.role === "creator",
  });
  const updateUser = useAdminUpdateUser();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const wasCreator = user.roles?.includes("creator") ?? user.role === "creator";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        role: form.role,
        phone: form.phone,
      };
      if (form.password) body.password = form.password;
      if (form.isCreator && !wasCreator) body.grantCreator = true;
      if (!form.isCreator && wasCreator) body.revokeCreator = true;

      const res = await fetch(`${API_BASE}/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update user");
      toast({ title: "User updated", description: `${form.name}'s profile has been saved.` });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-[#0d1424] border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4 text-primary" />Edit User</DialogTitle>
          <DialogDescription>Update {user.name}'s account details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="bg-card border-border" />
          </div>
          <div className="space-y-1.5">
            <Label>Email Address</Label>
            <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required className="bg-card border-border" />
          </div>
          <div className="space-y-1.5">
            <Label>Primary Role</Label>
            <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
              <SelectTrigger className="bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="affiliate">Affiliate</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Base account type. Staff role is managed from the Staff section.</p>
          </div>
          <div className="space-y-2">
            <Label>Additional Roles</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isCreator}
                  onChange={e => setForm(p => ({ ...p, isCreator: e.target.checked }))}
                  className="w-4 h-4 rounded border-border accent-emerald-500"
                />
                <div className="flex items-center gap-2 flex-1">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Creator Access</p>
                    <p className="text-[11px] text-muted-foreground">Can create courses, earn commissions, and access the creator dashboard</p>
                  </div>
                </div>
                {form.isCreator && <Badge className="text-[10px] text-emerald-400 border-emerald-400/30 bg-emerald-400/10">Active</Badge>}
              </label>
              {(user.roles?.includes("staff") ?? user.role === "staff") && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50 opacity-60">
                  <div className="w-4 h-4 rounded border-border bg-amber-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-amber-400" />
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Staff Access</p>
                      <p className="text-[11px] text-muted-foreground">Managed from Admin → Staff section</p>
                    </div>
                  </div>
                  <Badge className="text-[10px] text-amber-400 border-amber-400/30 bg-amber-400/10">Active</Badge>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Mobile Number</Label>
            <Input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile number"
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="bg-card border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Lock className="w-3 h-3" />New Password <span className="text-muted-foreground text-xs">(leave blank to keep current)</span></Label>
            <Input type="password" placeholder="Enter new password to reset..." value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className="bg-card border-border" />
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-white/10 cursor-pointer">Cancel</Button>
            <Button type="submit" disabled={loading} className="bg-primary cursor-pointer">
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── View Profile Dialog ───────────────────────────────────────────────────────
export function ViewProfileDialog({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data: user, isLoading } = useAdminGetUser(userId, {
    query: { queryKey: getAdminGetUserQueryKey(userId) }
  });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg bg-[#0d1424] border-white/10 max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Eye className="w-4 h-4 text-primary" />User Profile</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground text-sm">Loading profile...</div>
        ) : user ? (
          <div className="space-y-5 mt-1 overflow-y-auto flex-1 pr-1">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 bg-card/50 rounded-xl border border-border">
              <Avatar name={user.name} size="lg" />
              <div>
                <p className="font-bold text-lg text-foreground">{user.name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{user.email}</p>
                {(user as { phone?: string | null }).phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{(user as { phone?: string | null }).phone}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {((user as any).roles && (user as any).roles.length > 0 ? (user as any).roles : [user.role]).map((r: string) => (
                    <Badge key={r} className={`text-[10px] ${roleColors[r] ?? ""}`}>{r}</Badge>
                  ))}
                  <Badge className={`text-[10px] ${user.isBanned ? "text-red-400 border-red-400/30 bg-red-400/10" : "text-green-400 border-green-400/30 bg-green-400/10"}`}>
                    {user.isBanned ? "Banned" : "Active"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Courses", value: (user as { enrollmentCount?: number }).enrollmentCount ?? 0, icon: BookOpen, color: "text-blue-400" },
                { label: "Total Spent", value: `₹${((user as { totalSpent?: number }).totalSpent ?? 0).toFixed(0)}`, icon: BadgeIndianRupee, color: "text-green-400" },
                { label: "Affiliate Earnings", value: `₹${((user as { affiliateEarnings?: number }).affiliateEarnings ?? 0).toFixed(0)}`, icon: Share2, color: "text-purple-400" },
              ].map(stat => (
                <div key={stat.label} className="p-3 bg-card/50 rounded-xl border border-border text-center">
                  <stat.icon className={`w-4 h-4 mx-auto mb-1 ${stat.color}`} />
                  <p className="text-base font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Meta */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Joined</span>
                <span className="text-foreground font-medium">{new Date(user.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
              {user.referralCode && (
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5" />Referral Code</span>
                  <code className="bg-card px-2 py-0.5 rounded text-xs font-mono text-primary">{user.referralCode}</code>
                </div>
              )}
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">User ID</span>
                <span className="text-muted-foreground font-mono text-xs">#{user.id}</span>
              </div>
            </div>

            {/* Purchased Packages */}
            {(() => {
              type PurchasedBundle = { bundleId: number; bundleName: string; amount: string | number; purchasedAt: string; courses: { id: number; title: string }[] };
              const bundles = (user as { purchasedBundles?: PurchasedBundle[] }).purchasedBundles ?? [];
              if (bundles.length === 0) return null;
              return (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />Purchased Packages
                    <span className="ml-auto text-xs font-normal normal-case">{bundles.length} package{bundles.length !== 1 ? "s" : ""}</span>
                  </p>
                  <div className="space-y-2">
                    {bundles.map(b => (
                      <div key={b.bundleId} className="border border-amber-500/20 bg-amber-500/5 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2.5 px-3 py-2.5">
                          <Package className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <span className="text-xs font-semibold text-foreground flex-1 truncate">{b.bundleName}</span>
                          <span className="text-xs text-green-400 font-medium flex-shrink-0">₹{Number(b.amount).toLocaleString("en-IN")}</span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap ml-1">
                            {new Date(b.purchasedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Enrolled Courses */}
            {(() => {
              const enrolled = (user as { enrolledCourses?: Array<{ id: number; title: string; enrolledAt: string }> }).enrolledCourses ?? [];
              return (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />Enrolled Courses
                    <span className="ml-auto text-xs font-normal normal-case">{enrolled.length} course{enrolled.length !== 1 ? "s" : ""}</span>
                  </p>
                  {enrolled.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-3 text-center bg-card/30 rounded-xl border border-border/50">
                      Not enrolled in any course yet
                    </div>
                  ) : (
                    <div className="border border-border rounded-xl overflow-hidden divide-y divide-border max-h-44 overflow-y-auto">
                      {enrolled.map(c => (
                        <div key={c.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-card/20 hover:bg-card/40 transition-colors">
                          <GraduationCap className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          <span className="text-xs text-foreground flex-1 truncate">{c.title}</span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
                            {new Date(c.enrolledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">User not found.</div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 cursor-pointer">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirmation ───────────────────────────────────────────────────────
function DeleteDialog({ user, onClose, onSuccess }: { user: User; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${user.id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Delete failed"); }
      toast({ title: "User deleted", description: `${user.name} has been removed.` });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm bg-[#0d1424] border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400"><Trash2 className="w-4 h-4" />Delete User</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete <strong className="text-foreground">{user.name}</strong>? This action cannot be undone and will remove all their data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={onClose} className="border-white/10 cursor-pointer">Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading} className="cursor-pointer">
            {loading ? "Deleting..." : "Delete User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Confirm Dialog ───────────────────────────────────────────────────────
function BulkConfirmDialog({
  count, action, onConfirm, onClose, loading,
}: { count: number; action: "delete" | "ban" | "unban"; onConfirm: () => void; onClose: () => void; loading: boolean }) {
  const isDelete = action === "delete";
  const isBan = action === "ban";
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm bg-[#0d1424] border-white/10">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isDelete ? "text-red-400" : isBan ? "text-orange-400" : "text-green-400"}`}>
            {isDelete ? <Trash2 className="w-4 h-4" /> : isBan ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {isDelete ? "Delete" : isBan ? "Trash / Ban" : "Unban"} {count} User{count !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            {isDelete
              ? `Permanently delete ${count} user${count !== 1 ? "s" : ""}? This cannot be undone and removes all their data.`
              : isBan
              ? `Move ${count} user${count !== 1 ? "s" : ""} to trash (ban them)? They won't be able to log in.`
              : `Restore ${count} user${count !== 1 ? "s" : ""}? They will be able to log in again.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={onClose} className="border-white/10 cursor-pointer" disabled={loading}>Cancel</Button>
          <Button
            variant={isDelete ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
            className={`cursor-pointer ${!isDelete ? (isBan ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700") : ""}`}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {isDelete ? "Delete" : isBan ? "Trash (Ban)" : "Restore"} {count} User{count !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PAGE_SIZE = 50;

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between mt-4 px-1">
      <p className="text-xs text-muted-foreground">
        Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total} users
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors border border-border"
        >
          ← Prev
        </button>
        {getPages().map((p, i) =>
          p === "..." ? (
            <span key={`dot-${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={`h-8 w-8 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                p === page
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-card border border-border"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors border border-border"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<"delete" | "ban" | "unban" | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [globalCounts, setGlobalCounts] = useState({ total: 0, admin: 0, staff: 0, creator: 0, student: 0, affiliate: 0 });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const offset = (page - 1) * PAGE_SIZE;
  const { data, isLoading } = useAdminListUsers(
    {
      search: debouncedSearch || undefined,
      role: role === "all" ? undefined : role,
      status: status === "all" ? undefined : status,
      limit: PAGE_SIZE,
      offset,
    } as Parameters<typeof useAdminListUsers>[0],
    { query: { queryKey: getAdminListUsersQueryKey({ search: debouncedSearch, role, status, limit: PAGE_SIZE, offset }) } }
  );

  const banUser = useBanUser();

  // Fetch global role counts (unfiltered) once and on refresh
  const fetchGlobalCounts = () => {
    Promise.all(
      ["", "admin", "staff", "creator", "student", "affiliate"].map(r =>
        fetch(`${API_BASE}/api/admin/users?limit=1&offset=0${r ? `&role=${r}` : ""}`, { credentials: "include" })
          .then(res => res.json()).then(d => d.total ?? 0).catch(() => 0)
      )
    ).then(([total, admin, staff, creator, student, affiliate]) => {
      setGlobalCounts({ total, admin, staff, creator, student, affiliate });
    });
  };

  useEffect(() => { fetchGlobalCounts(); }, []);

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    setTimeout(() => setDebouncedSearch(v), 400);
  };

  const handleRoleChange = (v: string) => { setRole(v); setPage(1); setSelectedIds(new Set()); };
  const handleStatusChange = (v: string) => { setStatus(v); setPage(1); setSelectedIds(new Set()); };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey({}) });
    fetchGlobalCounts();
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/export`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Users exported", description: "CSV file downloaded." });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const handleBan = (userId: number, banned: boolean, name: string) => {
    banUser.mutate({ userId, data: { banned } }, {
      onSuccess: () => { toast({ title: banned ? `${name} banned` : `${name} unbanned` }); refresh(); },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = (visibleUsers: User[]) => {
    const visibleIds = visibleUsers.map(u => u.id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds));
  };

  const handleBulkAction = async () => {
    if (!bulkDialog || selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    try {
      let res: Response;
      if (bulkDialog === "delete") {
        res = await fetch(`${API_BASE}/api/admin/users/bulk`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids }),
        });
      } else {
        res = await fetch(`${API_BASE}/api/admin/users/bulk-ban`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids, banned: bulkDialog === "ban" }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      const count = data.deleted ?? data.updated ?? ids.length;
      toast({ title: bulkDialog === "delete" ? `${count} user${count !== 1 ? "s" : ""} deleted` : bulkDialog === "ban" ? `${count} user${count !== 1 ? "s" : ""} moved to trash` : `${count} user${count !== 1 ? "s" : ""} restored` });
      setSelectedIds(new Set());
      setBulkDialog(null);
      refresh();
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
  };

  const users = data?.users ?? [];
  const filteredTotal = data?.total ?? 0;

  const roleCounts = globalCounts;

  return (
    <div className="p-4 md:p-6 max-w-full">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{roleCounts.total} total users</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <Button variant="outline" onClick={handleExport} className="border-border gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />Export CSV
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} className="border-border gap-2 cursor-pointer">
            <Download className="w-4 h-4" />Import CSV
          </Button>
          <Button onClick={() => setAddOpen(true)} className="bg-primary hover:bg-primary/90 gap-2 cursor-pointer">
            <UserPlus className="w-4 h-4" />Add User
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total Users", value: roleCounts.total, color: "text-foreground" },
          { label: "Admins", value: roleCounts.admin, color: "text-red-400" },
          { label: "Staff", value: roleCounts.staff, color: "text-amber-400" },
          { label: "Creators", value: roleCounts.creator, color: "text-emerald-400" },
          { label: "Students", value: roleCounts.student, color: "text-blue-400" },
          { label: "Affiliates", value: roleCounts.affiliate, color: "text-purple-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select value={role} onValueChange={handleRoleChange}>
          <SelectTrigger className="w-full sm:w-36 bg-card border-border"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="creator">Creator</SelectItem>
            <SelectItem value="student">Student</SelectItem>
            <SelectItem value="affiliate">Affiliate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-36 bg-card border-border"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="banned">Banned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border border-white/10 backdrop-blur-md" style={{ background: "rgba(13,20,36,0.95)" }}>
          <span className="text-sm font-semibold text-foreground">{selectedIds.size} selected</span>
          <div className="w-px h-5 bg-border" />
          <Button size="sm" variant="ghost" className="gap-1.5 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 h-8 cursor-pointer" onClick={() => setBulkDialog("ban")}>
            <Ban className="w-3.5 h-3.5" />Trash
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-green-400 hover:bg-green-500/10 hover:text-green-300 h-8 cursor-pointer" onClick={() => setBulkDialog("unban")}>
            <CheckCircle className="w-3.5 h-3.5" />Restore
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-300 h-8 cursor-pointer" onClick={() => setBulkDialog("delete")}>
            <Trash2 className="w-3.5 h-3.5" />Delete
          </Button>
          <div className="w-px h-5 bg-border" />
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => setSelectedIds(new Set())}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-card rounded-xl animate-pulse" />)}</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No users found</p>
          <p className="text-sm mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead className="bg-card border-b border-border">
              <tr>
                <th className="px-4 py-3 w-10">
                  <button
                    onClick={() => toggleAll(users)}
                    className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    {users.length > 0 && users.every(u => selectedIds.has(u.id))
                      ? <CheckSquare className="w-4 h-4 text-primary" />
                      : users.some(u => selectedIds.has(u.id))
                      ? <CheckSquare className="w-4 h-4 text-primary/50" />
                      : <Square className="w-4 h-4" />}
                  </button>
                </th>
                {["User", "Role", "Status", "Joined", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => {
                const RoleIcon = roleIcons[u.role] ?? GraduationCap;
                const isSelected = selectedIds.has(u.id);
                return (
                  <tr key={u.id} className={`hover:bg-card/40 transition-colors group ${isSelected ? "bg-primary/5" : ""}`}>
                    {/* Checkbox */}
                    <td className="px-4 py-3 w-10">
                      <button onClick={() => toggleSelect(u.id)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                        {isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <Mail className="w-3 h-3 flex-shrink-0" />{u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Role */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(u.roles && u.roles.length > 0 ? u.roles : [u.role]).map(r => {
                          const RI = roleIcons[r] ?? GraduationCap;
                          return (
                            <Badge key={r} className={`text-[10px] gap-1 ${roleColors[r] ?? ""}`}>
                              <RI className="w-3 h-3" />{r}
                            </Badge>
                          );
                        })}
                      </div>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      {u.isBanned ? (
                        <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-3.5 h-3.5" />Banned</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" />Active</span>
                      )}
                    </td>
                    {/* Joined */}
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 cursor-pointer"
                          onClick={() => setViewingUser(u)}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />View
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer"
                          onClick={() => setEditingUser(u)}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:bg-white/5 cursor-pointer">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 bg-[#0d1424] border-white/10">
                            <DropdownMenuItem
                              onClick={() => handleBan(u.id, !u.isBanned, u.name)}
                              className={`cursor-pointer ${u.isBanned ? "text-green-400 focus:text-green-400 focus:bg-green-500/10" : "text-orange-400 focus:text-orange-400 focus:bg-orange-500/10"}`}
                            >
                              {u.isBanned ? <CheckCircle className="w-3.5 h-3.5 mr-2" /> : <XCircle className="w-3.5 h-3.5 mr-2" />}
                              {u.isBanned ? "Unban User" : "Ban User"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeletingUser(u)}
                              className="cursor-pointer text-red-400 focus:text-red-400 focus:bg-red-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} total={filteredTotal} pageSize={PAGE_SIZE} onChange={p => { setPage(p); setSelectedIds(new Set()); }} />

      {/* Dialogs */}
      <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} onSuccess={refresh} />
      <ImportUsersDialog open={importOpen} onClose={() => setImportOpen(false)} onSuccess={refresh} />
      {viewingUser && <ViewProfileDialog userId={viewingUser.id} onClose={() => setViewingUser(null)} />}
      {editingUser && <EditUserDialog user={editingUser} onClose={() => setEditingUser(null)} onSuccess={refresh} />}
      {deletingUser && <DeleteDialog user={deletingUser} onClose={() => setDeletingUser(null)} onSuccess={refresh} />}
      {bulkDialog && (
        <BulkConfirmDialog
          count={selectedIds.size}
          action={bulkDialog}
          onConfirm={handleBulkAction}
          onClose={() => setBulkDialog(null)}
          loading={bulkLoading}
        />
      )}
    </div>
  );
}
