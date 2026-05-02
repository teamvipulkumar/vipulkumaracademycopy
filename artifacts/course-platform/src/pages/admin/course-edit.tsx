import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useAdminBase } from "@/lib/auth-context";
import {
  useGetCourse, getGetCourseQueryKey,
  useCreateModule, useDeleteModule, useUpdateModule,
  useCreateLesson, useDeleteLesson, useUpdateLesson, useUpdateCourse,
  type UpdateLessonBody, type UpdateCourseBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Save, ArrowLeft,
  Play, FileText, Link2, FileArchive, HelpCircle, Pencil,
  ImageIcon, Clock, Eye, EyeOff, GripVertical, AlertCircle,
} from "lucide-react";
import { ImageUploader } from "@/components/image-uploader";

type LessonType = "video" | "text" | "pdf" | "link" | "quiz" | "embed";

const LESSON_ICONS: Record<LessonType, React.ReactNode> = {
  video: <Play className="w-3.5 h-3.5 text-blue-400" />,
  text: <FileText className="w-3.5 h-3.5 text-green-400" />,
  pdf: <FileArchive className="w-3.5 h-3.5 text-orange-400" />,
  link: <Link2 className="w-3.5 h-3.5 text-purple-400" />,
  quiz: <HelpCircle className="w-3.5 h-3.5 text-yellow-400" />,
  embed: <Play className="w-3.5 h-3.5 text-cyan-400" />,
};

const LESSON_TYPE_LABELS: Record<LessonType, string> = {
  video: "Video URL",
  text: "Text / Article",
  pdf: "PDF Document",
  link: "External Link",
  quiz: "Quiz",
  embed: "Embed Code",
};

function getVideoPlatform(url: string): string {
  if (!url) return "unknown";
  if (url.match(/youtube\.com|youtu\.be/)) return "YouTube";
  if (url.match(/vimeo\.com/)) return "Vimeo";
  if (url.match(/loom\.com/)) return "Loom";
  if (url.match(/wistia\.com/)) return "Wistia";
  if (url.match(/\.(mp4|webm|ogg)(\?|$)/i)) return "Direct MP4";
  return "Embed";
}

export default function AdminCourseEditPage() {
  const adminBase = useAdminBase();
  // Mounted under both `/admin/courses/:id/edit` and
  // `/staff/courses/:id/edit`; match either to extract the course id.
  const [, paramsAdmin] = useRoute("/admin/courses/:id/edit");
  const [, paramsStaff] = useRoute("/staff/courses/:id/edit");
  const params = paramsAdmin ?? paramsStaff;
  const courseId = parseInt(params?.id ?? "0");
  const { data: course, isLoading } = useGetCourse(courseId, { query: { queryKey: getGetCourseQueryKey(courseId), enabled: courseId > 0 } });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateCourse = useUpdateCourse();
  const createModule = useCreateModule();
  const deleteModule = useDeleteModule();
  const updateModule = useUpdateModule();
  const createLesson = useCreateLesson();
  const deleteLesson = useDeleteLesson();
  const updateLesson = useUpdateLesson();

  // Course settings state
  const [courseForm, setCourseForm] = useState({ title: "", description: "", thumbnailUrl: "", price: "", compareAtPrice: "", durationHours: "", category: "", level: "beginner", status: "draft", tag: "none" });
  const [courseSaving, setCourseSaving] = useState(false);

  // Curriculum state
  const [expandedModules, setExpandedModules] = useState<number[]>([0]);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [editingModuleTitle, setEditingModuleTitle] = useState("");

  // Lesson editor
  const [lessonEditorOpen, setLessonEditorOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<{ id: number; moduleId: number; data: UpdateLessonBody & { title: string; type: LessonType } } | null>(null);
  const [addLessonModuleId, setAddLessonModuleId] = useState<number | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonType, setNewLessonType] = useState<LessonType>("video");

  useEffect(() => {
    if (course) {
      const c = course as any;
      setCourseForm({
        title: course.title ?? "",
        description: course.description ?? "",
        thumbnailUrl: c.thumbnailUrl ?? "",
        price: String(course.price ?? ""),
        compareAtPrice: c.compareAtPrice ? String(c.compareAtPrice) : "",
        durationHours: c.durationMinutes ? String((c.durationMinutes / 60).toFixed(1)).replace(/\.0$/, "") : "",
        category: course.category ?? "",
        level: course.level ?? "beginner",
        status: course.status ?? "draft",
        tag: (course as { tag?: string | null }).tag ?? "none",
      });
    }
  }, [course]);

  const invalidateCourse = () => queryClient.invalidateQueries({ queryKey: getGetCourseQueryKey(courseId) });

  const handleSaveCourse = () => {
    setCourseSaving(true);
    const body: UpdateCourseBody & { compareAtPrice?: number | null; durationMinutes?: number } = {
      title: courseForm.title,
      description: courseForm.description,
      thumbnailUrl: courseForm.thumbnailUrl || null,
      price: parseFloat(courseForm.price) || 0,
      category: courseForm.category,
      level: courseForm.level as any,
      status: courseForm.status as any,
      tag: (courseForm.tag === "coming_soon" ? "coming_soon" : null) as any,
      compareAtPrice: courseForm.compareAtPrice ? parseFloat(courseForm.compareAtPrice) : null,
      durationMinutes: courseForm.durationHours ? Math.round(parseFloat(courseForm.durationHours) * 60) : 0,
    };
    updateCourse.mutate({ courseId, data: body as UpdateCourseBody }, {
      onSuccess: () => { toast({ title: "Course saved!" }); setCourseSaving(false); invalidateCourse(); },
      onError: () => { toast({ title: "Failed to save course", variant: "destructive" }); setCourseSaving(false); },
    });
  };

  const handleAddModule = () => {
    if (!newModuleTitle.trim()) return;
    createModule.mutate({ courseId, data: { title: newModuleTitle, order: (course?.modules?.length ?? 0) + 1 } }, {
      onSuccess: () => { toast({ title: "Module added" }); setNewModuleTitle(""); invalidateCourse(); },
    });
  };

  const handleRenameModule = (moduleId: number) => {
    if (!editingModuleTitle.trim()) return;
    updateModule.mutate({ courseId, moduleId, data: { title: editingModuleTitle } }, {
      onSuccess: () => { setEditingModuleId(null); setEditingModuleTitle(""); invalidateCourse(); },
    });
  };

  const handleDeleteModule = (moduleId: number) => {
    if (!confirm("Delete this module and all its lessons?")) return;
    deleteModule.mutate({ courseId, moduleId }, {
      onSuccess: () => { toast({ title: "Module deleted" }); invalidateCourse(); },
    });
  };

  const openLessonEditor = (lesson: any, moduleId: number) => {
    setEditingLesson({
      id: lesson.id,
      moduleId,
      data: {
        title: lesson.title,
        type: lesson.type as LessonType,
        videoUrl: lesson.videoUrl ?? "",
        content: lesson.content ?? "",
        resourceUrl: lesson.resourceUrl ?? "",
        durationMinutes: lesson.durationMinutes ?? null,
        isFree: lesson.isFree ?? false,
        description: lesson.description ?? "",
      },
    });
    setLessonEditorOpen(true);
  };

  const handleSaveLesson = () => {
    if (!editingLesson) return;
    const { id, moduleId, data } = editingLesson;
    const body: UpdateLessonBody = {
      title: data.title,
      type: data.type as any,
      videoUrl: data.videoUrl || null,
      content: data.content || null,
      resourceUrl: data.resourceUrl || null,
      durationMinutes: data.durationMinutes || null,
      isFree: data.isFree,
      description: data.description || null,
    };
    updateLesson.mutate({ courseId, moduleId, lessonId: id, data: body }, {
      onSuccess: () => {
        toast({ title: "Lesson saved!" });
        setLessonEditorOpen(false);
        invalidateCourse();
      },
      onError: () => toast({ title: "Failed to save lesson", variant: "destructive" }),
    });
  };

  const handleAddLesson = (moduleId: number) => {
    if (!newLessonTitle.trim()) return;
    const mod = course?.modules?.find(m => m.id === moduleId);
    createLesson.mutate({
      courseId,
      moduleId,
      data: { title: newLessonTitle, type: newLessonType as any, order: (mod?.lessons?.length ?? 0) + 1, isFree: false },
    }, {
      onSuccess: () => {
        toast({ title: "Lesson added" });
        setNewLessonTitle("");
        setAddLessonModuleId(null);
        invalidateCourse();
      },
    });
  };

  const handleDeleteLesson = (moduleId: number, lessonId: number) => {
    if (!confirm("Delete this lesson?")) return;
    deleteLesson.mutate({ courseId, moduleId, lessonId }, {
      onSuccess: () => { toast({ title: "Lesson deleted" }); invalidateCourse(); },
    });
  };

  if (isLoading) return (
    <div className="p-6 space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-12 bg-card rounded-xl animate-pulse" />)}
    </div>
  );
  if (!course) return <div className="p-6 text-muted-foreground">Course not found.</div>;



  return (
    <div className="p-6 max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`${adminBase}/courses`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Courses
          </Button>
        </Link>
        <div className="h-4 w-px bg-border" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">{course.title}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-xs capitalize">{course.status}</Badge>
            <span className="text-xs text-muted-foreground">{course.lessonCount} lessons · {course.moduleCount} modules</span>
          </div>
        </div>
      </div>

      {/* Course Settings */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4 text-primary" />Course Settings</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Edit course details, thumbnail, pricing, and status.</p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Thumbnail */}
          <div className="md:col-span-2">
            <ImageUploader
              label="Course Thumbnail / Banner"
              value={courseForm.thumbnailUrl}
              onChange={url => setCourseForm(f => ({ ...f, thumbnailUrl: url }))}
              aspectRatio="video"
              hint="Recommended: 1280×720px · JPG, PNG, WebP · Max 10 MB · Click or drag & drop"
            />
          </div>

          {/* Title */}
          <div className="md:col-span-2">
            <label className="text-sm font-medium mb-1.5 block">Title *</label>
            <Input value={courseForm.title} onChange={e => setCourseForm(f => ({ ...f, title: e.target.value }))} className="bg-background" placeholder="Course title" />
          </div>

          {/* Description */}
          <div className="md:col-span-2">
            <label className="text-sm font-medium mb-1.5 block">Description</label>
            <Textarea value={courseForm.description} onChange={e => setCourseForm(f => ({ ...f, description: e.target.value }))} className="bg-background min-h-[90px] resize-y" placeholder="Describe what students will learn..." />
          </div>

          {/* Price */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Price (₹ INR)</label>
            <Input type="number" min="0" step="0.01" value={courseForm.price} onChange={e => setCourseForm(f => ({ ...f, price: e.target.value }))} className="bg-background" placeholder="0.00" />
          </div>

          {/* Compare At Price */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Compare At Price (₹)</label>
            <Input type="number" min="0" step="0.01" value={courseForm.compareAtPrice} onChange={e => setCourseForm(f => ({ ...f, compareAtPrice: e.target.value }))} className="bg-background" placeholder="Original price (crossed out)" />
            <p className="text-xs text-muted-foreground mt-1">Shown as a strikethrough to highlight savings</p>
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Category</label>
            <Input value={courseForm.category} onChange={e => setCourseForm(f => ({ ...f, category: e.target.value }))} className="bg-background" placeholder="e.g. Affiliate Marketing" />
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Course Duration (hours)</label>
            <Input type="number" min="0" step="0.5" value={courseForm.durationHours} onChange={e => setCourseForm(f => ({ ...f, durationHours: e.target.value }))} className="bg-background" placeholder="e.g. 2.5" />
            <p className="text-xs text-muted-foreground mt-1">Total video/content hours (e.g. 10 for 10 hours)</p>
          </div>

          {/* Level */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Level</label>
            <Select value={courseForm.level} onValueChange={v => setCourseForm(f => ({ ...f, level: v }))}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Status</label>
            <Select value={courseForm.status} onValueChange={v => setCourseForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tag */}
          <div className="md:col-span-2">
            <label className="text-sm font-medium mb-1.5 block">Tag</label>
            <Select value={courseForm.tag} onValueChange={v => setCourseForm(f => ({ ...f, tag: v }))}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="coming_soon">Coming Soon</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Shows a "Coming Soon" badge on the top-left corner of the course banner.</p>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end">
          <Button onClick={handleSaveCourse} disabled={courseSaving}>
            <Save className="w-4 h-4 mr-2" />{courseSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Curriculum */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />Curriculum</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Organize your course into modules and lessons.</p>
        </div>

        <div className="p-5 space-y-3">
          {(course.modules ?? []).length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No modules yet. Add your first module below.
            </div>
          )}

          {(course.modules ?? []).map((mod, idx) => (
            <div key={mod.id} className="border border-border rounded-xl overflow-hidden">
              {/* Module header */}
              <div className="flex items-center gap-2 p-3 bg-background/60">
                <GripVertical className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                <button
                  className="flex-shrink-0 cursor-pointer"
                  onClick={() => setExpandedModules(p => p.includes(idx) ? p.filter(i => i !== idx) : [...p, idx])}
                >
                  {expandedModules.includes(idx)
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>

                {editingModuleId === mod.id ? (
                  <div className="flex-1 flex gap-2">
                    <Input
                      value={editingModuleTitle}
                      onChange={e => setEditingModuleTitle(e.target.value)}
                      className="h-7 text-sm bg-card"
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") handleRenameModule(mod.id); if (e.key === "Escape") setEditingModuleId(null); }}
                    />
                    <Button size="sm" className="h-7 px-2" onClick={() => handleRenameModule(mod.id)}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingModuleId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-sm flex-1 line-clamp-1">{mod.title}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{mod.lessons?.length ?? 0} lessons</span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setEditingModuleId(mod.id); setEditingModuleTitle(mod.title); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={() => handleDeleteModule(mod.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>

              {/* Lessons */}
              {expandedModules.includes(idx) && (
                <div className="bg-background/30 border-t border-border">
                  {(mod.lessons ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground px-4 py-3">No lessons. Add one below.</p>
                  )}
                  {(mod.lessons ?? []).map(lesson => (
                    <div
                      key={lesson.id}
                      className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border/50 hover:bg-card/50 group cursor-pointer"
                      onClick={() => openLessonEditor(lesson, mod.id)}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 flex-shrink-0" />
                      {LESSON_ICONS[lesson.type as LessonType] ?? <FileText className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span className="text-sm flex-1 line-clamp-1">{lesson.title}</span>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {lesson.durationMinutes && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />{lesson.durationMinutes}m
                          </span>
                        )}
                        <Badge variant="outline" className="text-xs capitalize px-1.5 py-0">{lesson.type}</Badge>
                        {lesson.isFree && <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30 px-1.5 py-0">Free</Badge>}
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); openLessonEditor(lesson, mod.id); }}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-300" onClick={e => { e.stopPropagation(); handleDeleteLesson(mod.id, lesson.id); }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Add lesson */}
                  {addLessonModuleId === mod.id ? (
                    <div className="flex gap-2 p-3 border-t border-border/50">
                      <Input
                        autoFocus
                        placeholder="Lesson title..."
                        value={newLessonTitle}
                        onChange={e => setNewLessonTitle(e.target.value)}
                        className="h-8 text-sm bg-card border-border flex-1"
                        onKeyDown={e => { if (e.key === "Enter") handleAddLesson(mod.id); if (e.key === "Escape") setAddLessonModuleId(null); }}
                      />
                      <Select value={newLessonType} onValueChange={v => setNewLessonType(v as LessonType)}>
                        <SelectTrigger className="w-32 h-8 text-xs bg-card border-border"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="video">Video</SelectItem>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="pdf">PDF</SelectItem>
                          <SelectItem value="link">Link</SelectItem>
                          <SelectItem value="embed">Embed</SelectItem>
                          <SelectItem value="quiz">Quiz</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 px-3" onClick={() => handleAddLesson(mod.id)} disabled={createLesson.isPending}>Add</Button>
                      <Button size="sm" variant="ghost" className="h-8 px-3" onClick={() => setAddLessonModuleId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <button
                      className="w-full flex items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                      onClick={() => { setAddLessonModuleId(mod.id); setNewLessonTitle(""); setNewLessonType("video"); }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add lesson
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add Module */}
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="New module title (e.g. Getting Started)"
              value={newModuleTitle}
              onChange={e => setNewModuleTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddModule()}
              className="bg-background"
            />
            <Button onClick={handleAddModule} disabled={createModule.isPending}>
              <Plus className="w-4 h-4 mr-2" />Add Module
            </Button>
          </div>
        </div>
      </div>

      {/* Lesson Editor Dialog */}
      <Dialog open={lessonEditorOpen} onOpenChange={setLessonEditorOpen}>
        <DialogContent className="bg-card border-border max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lesson</DialogTitle>
            <DialogDescription>Update the content, type, and settings for this lesson.</DialogDescription>
          </DialogHeader>

          {editingLesson && (
            <div className="space-y-4 py-1">
              {/* Title */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Lesson Title *</label>
                <Input
                  value={editingLesson.data.title}
                  onChange={e => setEditingLesson(l => l ? { ...l, data: { ...l.data, title: e.target.value } } : l)}
                  className="bg-background"
                  placeholder="Lesson title..."
                />
              </div>

              {/* Type */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Lesson Type</label>
                <Select value={editingLesson.data.type} onValueChange={v => setEditingLesson(l => l ? { ...l, data: { ...l.data, type: v as LessonType } } : l)}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LESSON_TYPE_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        <div className="flex items-center gap-2">
                          {LESSON_ICONS[val as LessonType]}
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Type-specific fields */}
              {editingLesson.data.type === "video" && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Video URL</label>
                  <Input
                    value={editingLesson.data.videoUrl ?? ""}
                    onChange={e => setEditingLesson(l => l ? { ...l, data: { ...l.data, videoUrl: e.target.value } } : l)}
                    className="bg-background font-mono text-sm"
                    placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."
                  />
                  {editingLesson.data.videoUrl && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Play className="w-3 h-3 text-blue-400" />
                      Detected: <span className="text-blue-400 font-medium">{getVideoPlatform(editingLesson.data.videoUrl)}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Supports YouTube, Vimeo, Loom, Wistia, or direct MP4/WebM URLs.</p>
                </div>
              )}

              {editingLesson.data.type === "text" && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Lesson Content</label>
                  <Textarea
                    value={editingLesson.data.content ?? ""}
                    onChange={e => setEditingLesson(l => l ? { ...l, data: { ...l.data, content: e.target.value } } : l)}
                    className="bg-background min-h-[200px] resize-y font-mono text-sm"
                    placeholder="Write your lesson content here... (Markdown supported)"
                  />
                  <p className="text-xs text-muted-foreground mt-1">You can use Markdown for formatting (headers, bold, lists, code blocks).</p>
                </div>
              )}

              {editingLesson.data.type === "pdf" && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">PDF URL</label>
                  <Input
                    value={editingLesson.data.resourceUrl ?? ""}
                    onChange={e => setEditingLesson(l => l ? { ...l, data: { ...l.data, resourceUrl: e.target.value } } : l)}
                    className="bg-background font-mono text-sm"
                    placeholder="https://example.com/document.pdf"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Direct link to a publicly accessible PDF file. Students will view it embedded in the player.</p>
                </div>
              )}

              {editingLesson.data.type === "link" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Resource URL</label>
                    <Input
                      value={editingLesson.data.resourceUrl ?? ""}
                      onChange={e => setEditingLesson(l => l ? { ...l, data: { ...l.data, resourceUrl: e.target.value } } : l)}
                      className="bg-background font-mono text-sm"
                      placeholder="https://example.com/resource"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Description</label>
                    <Textarea
                      value={editingLesson.data.description ?? ""}
                      onChange={e => setEditingLesson(l => l ? { ...l, data: { ...l.data, description: e.target.value } } : l)}
                      className="bg-background min-h-[80px] resize-none text-sm"
                      placeholder="Describe what this link contains..."
                    />
                  </div>
                </div>
              )}

              {editingLesson.data.type === "embed" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5 block">
                      <Play className="w-3.5 h-3.5 text-cyan-400" />
                      Embed Code
                    </label>
                    <Textarea
                      value={editingLesson.data.content ?? ""}
                      onChange={e => setEditingLesson(l => l ? { ...l, data: { ...l.data, content: e.target.value } } : l)}
                      className="bg-background min-h-[160px] resize-y font-mono text-xs leading-relaxed"
                      placeholder={`Paste your full embed code here, for example:\n<div style="position:relative;padding-top:56.25%">\n  <iframe src="https://player.mediadelivery.net/embed/..." style="border:0;position:absolute;top:0;height:100%;width:100%" allowfullscreen="true"></iframe>\n</div>`}
                      spellCheck={false}
                    />
                    <div className="mt-2 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-start gap-2.5">
                      <Play className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-cyan-400">Supports any embed code</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Paste the full HTML embed code from any platform — Bunny Stream, Vimeo, YouTube, Wistia, Vidyard, Loom, Teachable, or any custom iframe. The code will render exactly as-is in the player.
                        </p>
                      </div>
                    </div>
                  </div>
                  {editingLesson.data.content && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
                      <div className="relative w-full rounded-xl overflow-hidden border border-border bg-black" style={{ aspectRatio: "16/9" }}>
                        <iframe
                          key={editingLesson.data.content.slice(0, 60)}
                          className="absolute inset-0 w-full h-full border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                          allowFullScreen
                          referrerPolicy="no-referrer"
                          srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}body>*:first-child{position:absolute!important;top:0!important;left:0!important;width:100%!important;height:100%!important;padding-top:0!important}</style></head><body>${editingLesson.data.content}</body></html>`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editingLesson.data.type === "quiz" && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-400">Quiz Lesson</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Quiz builder is available in the full quiz editor. Students will see a placeholder until quiz questions are configured.</p>
                  </div>
                </div>
              )}

              {/* Optional text content for video/pdf/link */}
              {(editingLesson.data.type === "video" || editingLesson.data.type === "pdf" || editingLesson.data.type === "link") && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Notes / Supplementary Content <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <Textarea
                    value={editingLesson.data.content ?? ""}
                    onChange={e => setEditingLesson(l => l ? { ...l, data: { ...l.data, content: e.target.value } } : l)}
                    className="bg-background min-h-[80px] resize-y text-sm"
                    placeholder="Additional notes, timestamps, links, or instructions shown below the main content..."
                  />
                </div>
              )}

              {/* Duration & isFree */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Duration (minutes)</label>
                  <Input
                    type="number"
                    min="1"
                    value={editingLesson.data.durationMinutes ?? ""}
                    onChange={e => setEditingLesson(l => l ? { ...l, data: { ...l.data, durationMinutes: parseInt(e.target.value) || null } } : l)}
                    className="bg-background"
                    placeholder="e.g. 15"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">Preview Access</label>
                  <button
                    className={`w-full h-10 rounded-lg border text-sm font-medium flex items-center gap-2 px-3 transition-colors ${
                      editingLesson.data.isFree
                        ? "bg-green-500/15 border-green-500/40 text-green-400"
                        : "bg-background border-border text-muted-foreground"
                    }`}
                    onClick={() => setEditingLesson(l => l ? { ...l, data: { ...l.data, isFree: !l.data.isFree } } : l)}
                  >
                    {editingLesson.data.isFree
                      ? <><Eye className="w-4 h-4" />Free preview (public)</>
                      : <><EyeOff className="w-4 h-4" />Enrolled only</>}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setLessonEditorOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveLesson} disabled={updateLesson.isPending}>
                  <Save className="w-4 h-4 mr-2" />{updateLesson.isPending ? "Saving..." : "Save Lesson"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
