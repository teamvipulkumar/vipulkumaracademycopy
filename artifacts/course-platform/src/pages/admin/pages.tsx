import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAdminBase } from "@/lib/auth-context";
import {
  Plus, ExternalLink, Trash2, Copy, Layers,
  MousePointerClick, Video, ShoppingCart, Megaphone,
  CheckCircle, Users, Globe, Eye, EyeOff, Search,
  FileText, MoreHorizontal, PencilLine,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const PAGE_TYPES = [
  { value: "optin",    label: "Optin Page",       icon: MousePointerClick, color: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  { value: "vsl",      label: "VSL Page",          icon: Video,             color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "order",    label: "Order Page",        icon: ShoppingCart,      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { value: "sales",    label: "Sales Page",        icon: Megaphone,         color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { value: "thankyou", label: "Thank You Page",    icon: CheckCircle,       color: "bg-green-500/10 text-green-400 border-green-500/20" },
  { value: "webinar",  label: "Webinar Page",      icon: Users,             color: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  { value: "squeeze",  label: "Squeeze Page",      icon: FileText,          color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  { value: "custom",   label: "Custom Page",       icon: Globe,             color: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
] as const;

type PageType = typeof PAGE_TYPES[number]["value"];
type PageStatus = "published" | "draft";

interface Page {
  id: string;
  title: string;
  slug: string;
  type: PageType;
  status: PageStatus;
  createdAt: string;
  views: number;
}

const STORAGE_KEY = "vka_admin_pages";

const SEED_PAGES: Page[] = [
  {
    id: "builtin-optin",
    title: "Affiliate Marketing Optin",
    slug: "optin",
    type: "optin",
    status: "published",
    createdAt: "2026-04-18T00:00:00.000Z",
    views: 0,
  },
  {
    id: "builtin-vsl",
    title: "Affiliate Marketing VSL",
    slug: "vsl",
    type: "vsl",
    status: "published",
    createdAt: "2026-04-20T00:00:00.000Z",
    views: 0,
  },
  {
    id: "builtin-order",
    title: "Ultimate Affiliate 2.0 — Order Page",
    slug: "order",
    type: "order",
    status: "published",
    createdAt: "2026-04-20T00:00:00.000Z",
    views: 0,
  },
];

function loadPages(): Page[] {
  try {
    const stored: Page[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const storedIds = new Set(stored.map(p => p.id));
    const missing = SEED_PAGES.filter(s => !storedIds.has(s.id));
    if (missing.length === 0) return stored;
    const merged = [...missing, ...stored];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return SEED_PAGES;
  }
}

function savePages(pages: Page[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getTypeInfo(type: PageType) {
  return PAGE_TYPES.find(t => t.value === type) ?? PAGE_TYPES[PAGE_TYPES.length - 1];
}

export default function AdminPagesPage() {
  const adminBase = useAdminBase();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [pages, setPages] = useState<Page[]>(loadPages);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<PageType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<PageStatus | "all">("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", slug: "", type: "optin" as PageType, status: "draft" as PageStatus });
  const [slugManual, setSlugManual] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { savePages(pages); }, [pages]);

  const filtered = pages.filter(p => {
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase());
    const matchType = filterType === "all" || p.type === filterType;
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  function handleTitleChange(title: string) {
    setForm(f => ({ ...f, title, slug: slugManual ? f.slug : slugify(title) }));
  }

  function handleCreate() {
    if (!form.title.trim()) { toast({ variant: "destructive", title: "Title is required" }); return; }
    if (!form.slug.trim()) { toast({ variant: "destructive", title: "Slug is required" }); return; }
    if (pages.some(p => p.slug === form.slug)) { toast({ variant: "destructive", title: "Slug already exists" }); return; }

    const newPage: Page = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      slug: form.slug.trim(),
      type: form.type,
      status: form.status,
      createdAt: new Date().toISOString(),
      views: 0,
    };
    setPages(prev => [newPage, ...prev]);
    toast({ title: "Page created!", description: `"${newPage.title}" has been added.` });
    setCreateOpen(false);
    setForm({ title: "", slug: "", type: "optin", status: "draft" });
    setSlugManual(false);
  }

  function handleDelete(id: string) {
    setPages(prev => prev.filter(p => p.id !== id));
    setDeleteId(null);
    toast({ title: "Page deleted" });
  }

  function toggleStatus(id: string) {
    setPages(prev => prev.map(p => p.id === id
      ? { ...p, status: p.status === "published" ? "draft" : "published" }
      : p
    ));
  }

  function duplicatePage(page: Page) {
    const newSlug = `${page.slug}-copy`;
    if (pages.some(p => p.slug === newSlug)) {
      toast({ variant: "destructive", title: "Duplicate slug conflict", description: "Rename the slug first." });
      return;
    }
    setPages(prev => [{
      ...page,
      id: crypto.randomUUID(),
      title: `${page.title} (Copy)`,
      slug: newSlug,
      status: "draft",
      createdAt: new Date().toISOString(),
      views: 0,
    }, ...prev]);
    toast({ title: "Page duplicated" });
  }

  const stats = {
    total: pages.length,
    published: pages.filter(p => p.status === "published").length,
    draft: pages.filter(p => p.status === "draft").length,
    totalViews: pages.reduce((s, p) => s + p.views, 0),
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            Pages
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create and manage your website pages — optin, VSL, order pages and more.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" />New Page
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Pages", value: stats.total, color: "text-foreground" },
          { label: "Published", value: stats.published, color: "text-green-400" },
          { label: "Draft", value: stats.draft, color: "text-yellow-400" },
          { label: "Total Views", value: stats.totalViews.toLocaleString(), color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search pages…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={v => setFilterType(v as any)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {PAGE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v as any)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pages List */}
      {filtered.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-border rounded-xl">
          <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {pages.length === 0 ? "No pages yet" : "No pages match your filters"}
          </h3>
          <p className="text-sm text-muted-foreground mb-5">
            {pages.length === 0
              ? "Create your first page — optin, VSL, order page and more."
              : "Try adjusting your search or filters."}
          </p>
          {pages.length === 0 && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />Create First Page
            </Button>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Page</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Slug</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Views</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(page => {
                const typeInfo = getTypeInfo(page.type);
                const TypeIcon = typeInfo.icon;
                return (
                  <tr key={page.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${typeInfo.color}`}>
                          <TypeIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground leading-tight">{page.title}</p>
                          <p className="text-xs text-muted-foreground sm:hidden">/{page.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <Badge variant="outline" className={`text-xs border ${typeInfo.color}`}>
                        {typeInfo.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <code className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">/{page.slug}</code>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-muted-foreground">{page.views.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => toggleStatus(page.id)}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                          page.status === "published"
                            ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
                            : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20"
                        }`}
                      >
                        {page.status === "published"
                          ? <><Eye className="w-3 h-3" />Published</>
                          : <><EyeOff className="w-3 h-3" />Draft</>
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell text-xs text-muted-foreground">
                      {new Date(page.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setLocation(`${adminBase}/pages/${page.id}/builder`)}>
                            <PencilLine className="w-3.5 h-3.5" />Edit Page
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2 cursor-pointer"
                            onClick={() => window.open(`${BASE}/${page.slug}`, "_blank")}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => duplicatePage(page)}>
                            <Copy className="w-3.5 h-3.5" />Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeleteId(page.id)}>
                            <Trash2 className="w-3.5 h-3.5" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Page type showcase (only when empty) */}
      {pages.length === 0 && (
        <div className="mt-8">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-4">Available Page Types</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PAGE_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <div
                  key={t.value}
                  className={`border rounded-xl p-4 flex flex-col items-center gap-2 text-center cursor-pointer hover:scale-[1.02] transition-transform ${t.color}`}
                  onClick={() => { setForm(f => ({ ...f, type: t.value })); setCreateOpen(true); }}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${t.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold">{t.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />Create New Page
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Page Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Free Webinar Registration"
                value={form.title}
                onChange={e => handleTitleChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Page Type <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {PAGE_TYPES.map(t => {
                  const Icon = t.icon;
                  const selected = form.type === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                        selected
                          ? `${t.color} border-current`
                          : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Slug <span className="text-destructive">*</span></Label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground shrink-0">/</span>
                <Input
                  placeholder="page-url-slug"
                  value={form.slug}
                  onChange={e => { setSlugManual(true); setForm(f => ({ ...f, slug: slugify(e.target.value) })); }}
                />
              </div>
              <p className="text-xs text-muted-foreground">URL-friendly identifier (auto-generated from title)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Initial Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as PageStatus }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft (hidden from public)</SelectItem>
                  <SelectItem value="published">Published (live)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Page</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" />Delete Page
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete the page. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
