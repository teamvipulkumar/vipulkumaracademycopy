import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Search, GraduationCap, BookOpen, Calendar, Trash2,
  UserPlus, CheckCircle2, Clock, Users, AlertTriangle, Mail,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Enrollment = {
  id: number;
  userId: number;
  courseId: number;
  enrolledAt: string;
  completedAt: string | null;
  userName: string;
  userEmail: string;
  courseTitle: string;
  courseThumbnail: string | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
};

type Stats = { total: number; active: number; completed: number };
type UserOption = { id: number; name: string; email: string; role: string };
type CourseOption = { id: number; title: string };

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function AvatarInitial({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const colors = ["bg-blue-600", "bg-purple-600", "bg-green-600", "bg-orange-600", "bg-pink-600", "bg-teal-600"];
  const color = colors[name.charCodeAt(0) % colors.length];
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Enroll User Dialog ────────────────────────────────────────────────────────
function EnrollDialog({
  onClose, onSuccess,
}: { onClose: () => void; onSuccess: () => void }) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [userId, setUserId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/admin/users?limit=500`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API_BASE}/api/admin/courses`, { credentials: "include" }).then(r => r.json()),
    ]).then(([uData, cData]) => {
      setUsers(uData.users ?? []);
      setCourses(Array.isArray(cData) ? cData : []);
    }).catch(() => toast({ title: "Failed to load options", variant: "destructive" }));
  }, []);

  const filteredUsers = users.filter(u =>
    `${u.name} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())
  ).slice(0, 50);

  const filteredCourses = courses.filter(c =>
    c.title.toLowerCase().includes(courseSearch.toLowerCase())
  ).slice(0, 50);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !courseId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/enrollments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: parseInt(userId), courseId: parseInt(courseId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Enrollment failed");
      toast({ title: "Enrollment added", description: `${data.userName} enrolled in "${data.courseTitle}"` });
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
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />Enroll User in Course
          </DialogTitle>
          <DialogDescription>Manually enroll any user into any published course.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* User picker */}
          <div className="space-y-1.5">
            <Label>Select User</Label>
            <Input
              placeholder="Search users..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="bg-card border-border mb-1.5"
            />
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">No users found</p>
              ) : filteredUsers.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setUserId(String(u.id)); setUserSearch(`${u.name} (${u.email})`); }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-white/5 transition-colors cursor-pointer ${userId === String(u.id) ? "bg-primary/10" : ""}`}
                >
                  <AvatarInitial name={u.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  {userId === String(u.id) && <CheckCircle2 className="w-4 h-4 text-primary ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Course picker */}
          <div className="space-y-1.5">
            <Label>Select Course</Label>
            <Input
              placeholder="Search courses..."
              value={courseSearch}
              onChange={e => setCourseSearch(e.target.value)}
              className="bg-card border-border mb-1.5"
            />
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
              {filteredCourses.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">No courses found</p>
              ) : filteredCourses.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCourseId(String(c.id)); setCourseSearch(c.title); }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 transition-colors cursor-pointer ${courseId === String(c.id) ? "bg-primary/10" : ""}`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm text-foreground truncate flex-1">{c.title}</p>
                  {courseId === String(c.id) && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-white/10">Cancel</Button>
            <Button type="submit" disabled={loading || !userId || !courseId} className="bg-primary gap-2">
              <GraduationCap className="w-4 h-4" />
              {loading ? "Enrolling..." : "Enroll User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Remove Enrollment Confirm ─────────────────────────────────────────────────
function RemoveDialog({
  enrollment, onClose, onSuccess,
}: { enrollment: Enrollment; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleRemove = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/enrollments/${enrollment.id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Remove failed"); }
      toast({ title: "Enrollment removed", description: `${enrollment.userName} has been unenrolled from "${enrollment.courseTitle}".` });
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
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-4 h-4" />Remove Enrollment
          </DialogTitle>
          <DialogDescription>
            This will remove <strong className="text-foreground">{enrollment.userName}</strong> from{" "}
            <strong className="text-foreground">"{enrollment.courseTitle}"</strong> and delete all their lesson progress.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-white/10">Cancel</Button>
          <Button variant="destructive" onClick={handleRemove} disabled={loading} className="gap-2">
            <Trash2 className="w-3.5 h-3.5" />
            {loading ? "Removing..." : "Remove"}
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
  const getPages = (): (number | "...")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  };
  return (
    <div className="flex items-center justify-between mt-4 px-1">
      <p className="text-xs text-muted-foreground">
        Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total} enrollments
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1} className="h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors border border-border">← Prev</button>
        {getPages().map((p, i) => p === "..." ? (
          <span key={`d${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground">…</span>
        ) : (
          <button key={p} onClick={() => onChange(p as number)} className={`h-8 w-8 rounded-lg text-xs font-medium transition-colors cursor-pointer ${p === page ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-card border border-border"}`}>{p}</button>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page === totalPages} className="h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors border border-border">Next →</button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminEnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, completed: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [page, setPage] = useState(1);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [removing, setRemoving] = useState<Enrollment | null>(null);
  const { toast } = useToast();

  const fetchEnrollments = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (courseFilter !== "all") params.set("courseId", courseFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String((p - 1) * PAGE_SIZE));
      const res = await fetch(`${API_BASE}/api/admin/enrollments?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setEnrollments(data.enrollments ?? []);
      setTotal(data.total ?? 0);
      setStats(data.stats ?? { total: 0, active: 0, completed: 0 });
    } catch {
      toast({ title: "Error loading enrollments", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/courses`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setCourses(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchEnrollments(page); }, [debouncedSearch, courseFilter, page]);

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    setTimeout(() => setDebouncedSearch(v), 400);
  };

  const handleCourseFilter = (v: string) => { setCourseFilter(v); setPage(1); };

  const statCards = [
    { label: "Total Enrollments", value: stats.total, icon: GraduationCap, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Active Students", value: stats.active, icon: Users, color: "text-green-400", bg: "bg-green-400/10" },
    { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-purple-400", bg: "bg-purple-400/10" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-full">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Enrollments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} total enrollments</p>
        </div>
        <Button onClick={() => setEnrollOpen(true)} className="bg-primary hover:bg-primary/90 gap-2 self-start sm:self-auto">
          <UserPlus className="w-4 h-4" />Enroll User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {statCards.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by student or course..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select value={courseFilter} onValueChange={handleCourseFilter}>
          <SelectTrigger className="w-full sm:w-52 bg-card border-border">
            <SelectValue placeholder="All Courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {courses.map(c => (
              <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5,6].map(i => <div key={i} className="h-16 bg-card rounded-xl animate-pulse" />)}</div>
      ) : enrollments.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No enrollments found</p>
          <p className="text-sm mt-1">Try adjusting filters or enroll a user above</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-card border-b border-border">
              <tr>
                {["Student", "Course", "Enrolled On", "Progress", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enrollments.map(e => (
                <tr key={e.id} className="hover:bg-card/40 transition-colors">
                  {/* Student */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <AvatarInitial name={e.userName} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{e.userName}</p>
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <Mail className="w-2.5 h-2.5" />{e.userEmail}
                        </p>
                      </div>
                    </div>
                  </td>
                  {/* Course */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {e.courseThumbnail ? (
                        <img src={e.courseThumbnail} alt="" className="w-9 h-7 rounded object-cover flex-shrink-0 bg-card" />
                      ) : (
                        <div className="w-9 h-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-3.5 h-3.5 text-primary" />
                        </div>
                      )}
                      <p className="text-sm text-foreground max-w-[200px] truncate" title={e.courseTitle}>{e.courseTitle}</p>
                    </div>
                  </td>
                  {/* Enrolled Date */}
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />{formatDate(e.enrolledAt)}
                    </div>
                  </td>
                  {/* Progress */}
                  <td className="px-4 py-3 whitespace-nowrap min-w-[140px]">
                    {e.totalLessons === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-card rounded-full overflow-hidden border border-border">
                          <div
                            className={`h-full rounded-full transition-all ${
                              e.progressPercent >= 100
                                ? "bg-purple-400"
                                : e.progressPercent >= 50
                                ? "bg-green-400"
                                : e.progressPercent > 0
                                ? "bg-blue-400"
                                : "bg-muted-foreground/30"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, e.progressPercent))}%` }}
                          />
                        </div>
                        <div className="text-xs whitespace-nowrap">
                          <span className="font-semibold text-foreground">{e.progressPercent}%</span>
                          <span className="text-muted-foreground ml-1">({e.completedLessons}/{e.totalLessons})</span>
                        </div>
                      </div>
                    )}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    {e.completedAt ? (
                      <Badge className="text-xs text-purple-400 border-purple-400/30 bg-purple-400/10 gap-1">
                        <CheckCircle2 className="w-3 h-3" />Completed
                      </Badge>
                    ) : (
                      <Badge className="text-xs text-green-400 border-green-400/30 bg-green-400/10 gap-1">
                        <Clock className="w-3 h-3" />Active
                      </Badge>
                    )}
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 gap-1"
                      onClick={() => setRemoving(e)}
                    >
                      <Trash2 className="w-3 h-3" />Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {enrollments.length > 0 && (
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={p => setPage(p)} />
      )}

      {enrollOpen && (
        <EnrollDialog
          onClose={() => setEnrollOpen(false)}
          onSuccess={() => { setPage(1); fetchEnrollments(1); }}
        />
      )}
      {removing && (
        <RemoveDialog
          enrollment={removing}
          onClose={() => setRemoving(null)}
          onSuccess={() => { setPage(1); fetchEnrollments(1); }}
        />
      )}
    </div>
  );
}
