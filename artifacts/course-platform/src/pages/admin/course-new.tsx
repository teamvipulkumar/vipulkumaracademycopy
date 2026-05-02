import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAdminBase } from "@/lib/auth-context";
import { useCreateCourse, getAdminListCoursesQueryKey, CreateCourseBody } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, BookOpen } from "lucide-react";
import { ImageUploader } from "@/components/image-uploader";

const INITIAL_FORM = {
  title: "",
  description: "",
  thumbnailUrl: "",
  price: "",
  compareAtPrice: "",
  durationHours: "",
  category: "Affiliate Marketing",
  level: "beginner" as const,
  status: "draft" as const,
  tag: "none" as "none" | "coming_soon",
  creatorId: "none",
};

export default function AdminCourseNewPage() {
  const adminBase = useAdminBase();
  const [form, setForm] = useState(INITIAL_FORM);
  const createCourse = useCreateCourse();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: creatorsList } = useQuery<Array<{ id: number; name: string; email: string; status: string }>>({
    queryKey: ["admin-creators-picker"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/creators`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const handleCreate = () => {
    if (!form.title.trim()) {
      toast({ title: "Course title is required", variant: "destructive" });
      return;
    }
    const body: CreateCourseBody & { creatorId?: number | null } = {
      title: form.title,
      description: form.description,
      thumbnailUrl: form.thumbnailUrl || null,
      price: parseFloat(form.price) || 0,
      category: form.category,
      level: form.level,
      status: form.status,
      tag: form.tag === "coming_soon" ? "coming_soon" : null,
      ...(form.compareAtPrice ? { compareAtPrice: parseFloat(form.compareAtPrice) } : {}),
      ...(form.durationHours ? { durationMinutes: Math.round(parseFloat(form.durationHours) * 60) } : {}),
      creatorId: form.creatorId === "none" ? null : parseInt(form.creatorId, 10),
    };
    createCourse.mutate({ data: body }, {
      onSuccess: (data) => {
        toast({ title: "Course created! You can now add modules and lessons." });
        queryClient.invalidateQueries({ queryKey: getAdminListCoursesQueryKey() });
        navigate(`${adminBase}/courses/${(data as unknown as { id: number }).id}/edit`);
      },
      onError: () => toast({ title: "Failed to create course", variant: "destructive" }),
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`${adminBase}/courses`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to Courses
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Create New Course</h1>
          <p className="text-sm text-muted-foreground">Fill in the details below to publish a new course.</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Thumbnail */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Media</h2>
          <ImageUploader
            label="Thumbnail / Banner"
            value={form.thumbnailUrl}
            onChange={url => setForm(f => ({ ...f, thumbnailUrl: url }))}
            aspectRatio="video"
            hint="Optional · JPG, PNG, WebP · Max 10 MB"
          />
        </div>

        {/* Basic Info */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Basic Info</h2>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Title *</label>
            <Input
              placeholder="Course title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="bg-background"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Description</label>
            <textarea
              placeholder="What will students learn? Give a clear overview of the course content."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full p-3 rounded-md bg-background border border-border text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Category</label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Affiliate Marketing">Affiliate Marketing</SelectItem>
                  <SelectItem value="E-commerce">E-commerce</SelectItem>
                  <SelectItem value="Dropshipping">Dropshipping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Level</label>
              <Select value={form.level} onValueChange={v => setForm(f => ({ ...f, level: v as typeof form.level }))}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Pricing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Price (INR ₹)</label>
              <Input
                placeholder="0.00"
                type="number"
                min="0"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Compare At Price (₹)</label>
              <Input
                placeholder="Original price (crossed out)"
                type="number"
                min="0"
                value={form.compareAtPrice}
                onChange={e => setForm(f => ({ ...f, compareAtPrice: e.target.value }))}
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground mt-1">Shown as a strikethrough to highlight savings</p>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Duration (hours)</label>
              <Input
                placeholder="e.g. 10"
                type="number"
                min="0"
                step="0.5"
                value={form.durationHours}
                onChange={e => setForm(f => ({ ...f, durationHours: e.target.value }))}
                className="bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Status</label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as typeof form.status }))}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Creator (revenue-share)</label>
            <Select value={form.creatorId} onValueChange={v => setForm(f => ({ ...f, creatorId: v }))}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="No creator" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No Creator —</SelectItem>
                {(creatorsList ?? []).filter(c => c.status === "active").map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">If set, creator earns 25% of each sale of this course.</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Tag</label>
            <Select value={form.tag} onValueChange={v => setForm(f => ({ ...f, tag: v as typeof form.tag }))}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="coming_soon">Coming Soon</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Shows a "Coming Soon" badge on the course banner.</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pb-8">
          <Button className="flex-1" onClick={handleCreate} disabled={createCourse.isPending}>
            {createCourse.isPending ? "Creating..." : "Create Course & Add Content"}
          </Button>
          <Link href={`${adminBase}/courses`}>
            <Button variant="outline">Cancel</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
