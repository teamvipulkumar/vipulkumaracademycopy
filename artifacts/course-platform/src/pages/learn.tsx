import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import {
  useGetCourse, getGetCourseQueryKey,
  useGetCourseProgress, getGetCourseProgressQueryKey,
  useCompleteLesson,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle, Play, FileText, HelpCircle, ChevronRight, ChevronDown,
  Check, Clock, Link2, FileArchive, Lock, BookOpen,
  ExternalLink, ChevronLeft, Menu, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LessonEntry = {
  id: number;
  title: string;
  type: string;
  content?: string | null;
  videoUrl?: string | null;
  resourceUrl?: string | null;
  description?: string | null;
  durationMinutes?: number | null;
  isCompleted: boolean;
  isFree: boolean;
};

// ─── External-link parser ────────────────────────────────────────────────────
// Link-type lessons store multiple {title,url} entries as a JSON array in the
// existing `resource_url` text column (no schema change needed). Old lessons
// have a plain URL string — surface those as a single untitled entry.
type LinkEntry = { title: string; url: string };
// SECURITY: only allow safe URL schemes in href attributes. Without this an
// admin (or anyone with write access to lessons) could persist a
// `javascript:` / `data:` / `vbscript:` URL that executes in students'
// browsers when they click "Open Link" — classic stored XSS.
function isSafeUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  // Allow only absolute http(s), mailto: and tel:. Relative URLs (no scheme)
  // are also safe — the browser resolves them against the current origin.
  if (u.startsWith("http://") || u.startsWith("https://")) return true;
  if (u.startsWith("mailto:") || u.startsWith("tel:")) return true;
  // Reject anything with a scheme we don't explicitly allow.
  return !/^[a-z][a-z0-9+.-]*:/.test(u);
}
function parseLessonLinks(raw: string | null | undefined): LinkEntry[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  let entries: LinkEntry[];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        entries = parsed
          .filter((x): x is LinkEntry => x && typeof x === "object" && typeof x.url === "string" && x.url.trim().length > 0)
          .map(x => ({ title: typeof x.title === "string" ? x.title : "", url: x.url }));
      } else {
        entries = [{ title: "", url: trimmed }];
      }
    } catch {
      entries = [{ title: "", url: trimmed }];
    }
  } else {
    entries = [{ title: "", url: trimmed }];
  }
  return entries.filter(e => isSafeUrl(e.url));
}

// ─── Smart embed URL resolver ─────────────────────────────────────────────────
function resolveEmbedUrl(url: string): { type: "iframe" | "video"; url: string; platform: string } {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return { type: "iframe", url: `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1&autoplay=0`, platform: "YouTube" };

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return { type: "iframe", url: `https://player.vimeo.com/video/${vimeoMatch[1]}?title=0&byline=0&portrait=0`, platform: "Vimeo" };

  // Loom
  const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (loomMatch) return { type: "iframe", url: `https://www.loom.com/embed/${loomMatch[1]}`, platform: "Loom" };

  // Wistia
  const wistiaMatch = url.match(/wistia\.com\/medias\/([a-zA-Z0-9]+)/);
  if (wistiaMatch) return { type: "iframe", url: `https://fast.wistia.com/medias/${wistiaMatch[1]}/iframe`, platform: "Wistia" };

  // Direct video file
  if (url.match(/\.(mp4|webm|ogg)(\?|$)/i)) return { type: "video", url, platform: "Video" };

  // Default embed
  return { type: "iframe", url, platform: "Embed" };
}

// ─── Lesson type icons ────────────────────────────────────────────────────────
function LessonIcon({ type }: { type: string }) {
  if (type === "video") return <Play className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
  if (type === "pdf") return <FileArchive className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />;
  if (type === "link") return <Link2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />;
  if (type === "quiz") return <HelpCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
  if (type === "embed") return <Play className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />;
  return <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />;
}

// ─── Video player ─────────────────────────────────────────────────────────────
function VideoPlayer({ url, title }: { url: string; title: string }) {
  const embed = resolveEmbedUrl(url);

  if (embed.type === "video") {
    return (
      <video
        key={url}
        controls
        className="w-full h-full"
        style={{ background: "#000" }}
        title={title}
      >
        <source src={url} />
        Your browser does not support video playback.
      </video>
    );
  }

  return (
    <iframe
      key={url}
      src={embed.url}
      className="w-full h-full"
      allowFullScreen
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      title={title}
      style={{ border: 0 }}
    />
  );
}

// ─── Markdown-like text renderer (simple) ─────────────────────────────────────
function TextContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-2 text-foreground leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold mt-4 mb-2">{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-semibold mt-4 mb-2">{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold mt-3 mb-1">{line.slice(4)}</h3>;
        if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
        if (line.startsWith("```")) return null;
        if (line.trim() === "") return <div key={i} className="h-2" />;
        // Bold
        const boldProcessed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        return <p key={i} dangerouslySetInnerHTML={{ __html: boldProcessed }} />;
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LearnPage() {
  const [, params] = useRoute("/learn/:courseId");
  const courseId = parseInt(params?.courseId ?? "0");
  const [selectedLesson, setSelectedLesson] = useState<LessonEntry | null>(null);
  const [expandedModules, setExpandedModules] = useState<number[]>([0]);
  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: course } = useGetCourse(courseId, {
    query: { queryKey: getGetCourseQueryKey(courseId), enabled: courseId > 0 }
  });
  const { data: progress } = useGetCourseProgress(courseId, {
    query: { queryKey: getGetCourseProgressQueryKey(courseId), enabled: courseId > 0 }
  });
  const completeLesson = useCompleteLesson();

  const allLessons = (course?.modules ?? []).flatMap(m => m.lessons ?? []);
  const currentIndex = selectedLesson ? allLessons.findIndex(l => l.id === selectedLesson.id) : -1;
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 && currentIndex >= 0 ? allLessons[currentIndex + 1] : null;

  const selectLesson = (lesson: LessonEntry) => {
    setSelectedLesson(lesson);
    const modIdx = course?.modules?.findIndex(m => m.lessons?.some(l => l.id === lesson.id)) ?? -1;
    if (modIdx >= 0) setExpandedModules(p => p.includes(modIdx) ? p : [...p, modIdx]);
  };

  // Auto-select first unfinished lesson
  useEffect(() => {
    if (allLessons.length > 0 && !selectedLesson) {
      const first = allLessons.find(l => !l.isCompleted) ?? allLessons[0];
      selectLesson(first as LessonEntry);
    }
  }, [course]);

  const handleCompleteLesson = (lessonId: number) => {
    completeLesson.mutate({ lessonId }, {
      onSuccess: () => {
        toast({ title: "Lesson completed!", description: "Keep up the great work!" });
        // Update selected lesson state immediately so the UI reflects completion instantly
        setSelectedLesson(prev => prev && prev.id === lessonId ? { ...prev, isCompleted: true } : prev);
        queryClient.invalidateQueries({ queryKey: getGetCourseProgressQueryKey(courseId) });
        queryClient.invalidateQueries({ queryKey: getGetCourseQueryKey(courseId) });
        // Auto-advance to next
        if (nextLesson) {
          setTimeout(() => selectLesson(nextLesson as LessonEntry), 600);
        }
      },
      onError: () => toast({ title: "Error", description: "Could not save progress.", variant: "destructive" }),
    });
  };

  const progressPct = progress?.progressPercent ?? 0;

  return (
    <div className="h-screen bg-background flex flex-col" style={{ fontFamily: "var(--font-sans)" }}>
      {/* ── Top navigation bar ── */}
      <header className="h-13 border-b border-border bg-card/95 backdrop-blur-sm flex items-center px-4 gap-3 flex-shrink-0 z-10 sticky top-0">
        <button
          className="flex-shrink-0 h-8 w-8 rounded-lg hover:bg-background flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setSidebarOpen(o => !o)}
          title="Toggle sidebar"
        >
          {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        <div className="h-4 w-px bg-border flex-shrink-0" />

        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-sm font-medium truncate text-foreground">{course?.title}</span>
          {selectedLesson && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground truncate hidden sm:block">{selectedLesson.title}</span>
            </>
          )}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <Progress value={progressPct} className="w-28 h-1.5" />
            <span className="text-xs text-muted-foreground w-8">{progressPct}%</span>
          </div>
          <Badge variant="outline" className="text-xs hidden sm:flex">
            {progress?.completedLessons ?? 0}/{progress?.totalLessons ?? 0} done
          </Badge>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Mobile sidebar backdrop ── */}
        {sidebarOpen && (
          <div className="md:hidden fixed top-13 left-0 right-0 bottom-0 z-20 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Sidebar — overlay on mobile, push on desktop ── */}
        {sidebarOpen && (
          <aside className="fixed md:relative top-13 bottom-0 left-0 md:inset-auto z-30 md:z-auto w-80 md:w-72 border-r border-border bg-card flex-shrink-0 flex flex-col overflow-hidden shadow-2xl md:shadow-none">
            {/* Sidebar header */}
            <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-xs font-semibold text-foreground">Course Content</span>
              <span className="text-xs text-muted-foreground ml-auto">{allLessons.length} lessons</span>
            </div>

            {/* Progress bar in sidebar */}
            <div className="px-4 py-2.5 border-b border-border/50 bg-background/30">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Your progress</span>
                <span className="text-xs font-semibold text-primary">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-1.5" />
            </div>

            {/* Module tree */}
            <div className="flex-1 overflow-y-auto py-2">
              {(course?.modules ?? []).map((mod, idx) => {
                const modLessons = mod.lessons ?? [];
                const completedInMod = modLessons.filter(l => l.isCompleted).length;
                const isExpanded = expandedModules.includes(idx);

                const allDone = modLessons.length > 0 && completedInMod === modLessons.length;

                return (
                  <div key={mod.id} className="border-b border-border/30">
                    {/* Module button */}
                    <button
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-background/60 text-left group transition-colors cursor-pointer pt-[16px] pb-[16px] text-[16px]"
                      onClick={() => setExpandedModules(p => p.includes(idx) ? p.filter(i => i !== idx) : [...p, idx])}
                    >
                      {/* Circular progress ring */}
                      {(() => {
                        const size = 22;
                        const radius = 9;
                        const circumference = 2 * Math.PI * radius;
                        const pct = modLessons.length > 0 ? completedInMod / modLessons.length : 0;
                        const offset = circumference * (1 - pct);
                        return (
                          <svg width={size} height={size} className="flex-shrink-0 -rotate-90" viewBox={`0 0 ${size} ${size}`}>
                            {/* Track */}
                            <circle cx={size/2} cy={size/2} r={radius}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-muted-foreground/25"
                            />
                            {/* Progress arc */}
                            {pct > 0 && (
                              <circle cx={size/2} cy={size/2} r={radius}
                                fill={allDone ? "hsl(var(--primary))" : "none"}
                                stroke="hsl(var(--primary))"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={allDone ? 0 : offset}
                                style={{ transition: "stroke-dashoffset 0.4s ease" }}
                              />
                            )}
                            {/* Check icon when all done — rendered upright */}
                            {allDone && (
                              <g transform={`rotate(90, ${size/2}, ${size/2})`}>
                                <polyline
                                  points={`${size/2 - 3.5},${size/2} ${size/2 - 1},${size/2 + 2.5} ${size/2 + 3.5},${size/2 - 2.5}`}
                                  fill="none"
                                  stroke="hsl(var(--primary-foreground))"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </g>
                            )}
                          </svg>
                        );
                      })()}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">{mod.title}</p>
                      </div>
                      <div className="flex-shrink-0 ml-1">
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                    </button>
                    {/* Lessons */}
                    {isExpanded && (
                      <div className="pb-1">
                        {modLessons.map((lesson, lessonIdx) => {
                          const isSelected = selectedLesson?.id === lesson.id;
                          const isLast = lessonIdx === modLessons.length - 1;
                          return (
                            <button
                              key={lesson.id}
                              className={`w-full flex items-start gap-0 pl-4 pr-4 py-0 text-left transition-all duration-150 cursor-pointer ${
                                isSelected ? "bg-primary/10" : "hover:bg-background/60"
                              }`}
                              onClick={() => selectLesson(lesson as LessonEntry)}
                            >
                              {/* Circle + vertical line column */}
                              <div className="flex flex-col items-center flex-shrink-0 w-9 pt-2.5">
                                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                  lesson.isCompleted
                                    ? "border-primary bg-primary"
                                    : isSelected
                                    ? "border-primary bg-transparent"
                                    : "border-muted-foreground/35 bg-transparent"
                                }`}>
                                  {lesson.isCompleted && <Check className="w-2 h-2 text-primary-foreground" />}
                                </div>
                                {!isLast && (
                                  <div className="w-px flex-1 min-h-[18px] mt-1 bg-border/60" />
                                )}
                              </div>

                              {/* Existing content */}
                              <div className="flex items-start gap-2 flex-1 min-w-0 py-2 pl-1">
                                <div className="flex-shrink-0 mt-0.5">
                                  <LessonIcon type={lesson.type} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs line-clamp-2 leading-snug ${
                                    isSelected ? "text-primary font-medium" : "text-muted-foreground"
                                  }`}>{lesson.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {lesson.durationMinutes && (
                                      <span className="text-xs text-muted-foreground/70 flex items-center gap-0.5">
                                        <Clock className="w-2.5 h-2.5" />{lesson.durationMinutes}m
                                      </span>
                                    )}
                                    {lesson.isFree && !lesson.isCompleted && (
                                      <span className="text-xs text-green-500/80">Preview</span>
                                    )}
                                  </div>
                                </div>
                                {!lesson.isFree && !lesson.isCompleted && (
                                  <Lock className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* ── Main content ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!selectedLesson ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-5 text-center p-8">
              <div className="w-24 h-24 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Play className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">Ready to learn?</h2>
                <p className="text-muted-foreground max-w-sm">Select a lesson from the sidebar to begin your learning journey.</p>
              </div>
              {allLessons.length > 0 && (
                <Button size="lg" onClick={() => {
                  const first = allLessons.find(l => !l.isCompleted) ?? allLessons[0];
                  selectLesson(first as LessonEntry);
                }}>
                  <Play className="w-4 h-4 mr-2" />
                  {allLessons.some(l => l.isCompleted) ? "Continue Learning" : "Start First Lesson"}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* ── Lesson content area ── */}
              <div className="flex-1 overflow-y-auto">
                {/* Video player - full width, no padding */}
                {selectedLesson.type === "video" && selectedLesson.videoUrl && (
                  <div className="w-full bg-black" style={{ aspectRatio: "16/9" }}>
                    <VideoPlayer url={selectedLesson.videoUrl} title={selectedLesson.title} />
                  </div>
                )}

                {/* No video URL placeholder */}
                {selectedLesson.type === "video" && !selectedLesson.videoUrl && (
                  <div className="w-full bg-[#0a0a0f] flex items-center justify-center flex-col gap-3" style={{ aspectRatio: "16/9" }}>
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <Play className="w-8 h-8 text-blue-400" />
                    </div>
                    <p className="text-muted-foreground text-sm">No video URL set for this lesson.</p>
                    <p className="text-xs text-muted-foreground/60">Add a video URL in the admin course editor.</p>
                  </div>
                )}

                {/* Lesson info & body */}
                <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6">
                  {/* Lesson header */}
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {selectedLesson.durationMinutes && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />{selectedLesson.durationMinutes} min
                          </span>
                        )}
                        {selectedLesson.isCompleted && (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle className="w-3 h-3" />Completed
                          </span>
                        )}
                      </div>
                      <h1 className="text-xl font-bold text-foreground leading-tight">{selectedLesson.title}</h1>
                    </div>
                  </div>

                  {/* ── Type-specific content ── */}

                  {/* PDF viewer */}
                  {selectedLesson.type === "pdf" && selectedLesson.resourceUrl && (
                    <div className="mb-6">
                      <div className="rounded-xl overflow-hidden border border-border bg-background" style={{ height: "70vh" }}>
                        <iframe
                          src={selectedLesson.resourceUrl}
                          className="w-full h-full"
                          title={selectedLesson.title}
                          style={{ border: 0 }}
                        />
                      </div>
                      <a
                        href={selectedLesson.resourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />Open PDF in new tab
                      </a>
                    </div>
                  )}

                  {selectedLesson.type === "pdf" && !selectedLesson.resourceUrl && (
                    <div className="p-8 bg-card rounded-xl border border-border text-center mb-6">
                      <FileArchive className="w-12 h-12 text-orange-400/50 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">No PDF URL configured for this lesson.</p>
                    </div>
                  )}

                  {/* Link lesson — supports multiple links stored as a JSON
                      array in resourceUrl. Falls back to a single legacy URL
                      string for older lessons. */}
                  {selectedLesson.type === "link" && (() => {
                    const links = parseLessonLinks(selectedLesson.resourceUrl);
                    if (links.length === 0) {
                      return (
                        <div className="mb-6">
                          <div className="p-8 bg-card rounded-xl border border-border text-center">
                            <Link2 className="w-12 h-12 text-purple-400/50 mx-auto mb-3" />
                            <p className="text-muted-foreground text-sm">No resource URL configured for this lesson.</p>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="mb-6 space-y-3">
                        {selectedLesson.description && (
                          <p className="text-sm text-muted-foreground mb-2">{selectedLesson.description}</p>
                        )}
                        {links.map((link, idx) => (
                          <div
                            key={idx}
                            className="p-5 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-2xl"
                          >
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                                <Link2 className="w-6 h-6 text-purple-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-foreground mb-1">
                                  {link.title || "External Resource"}
                                </h3>
                                <p className="text-xs text-muted-foreground/70 font-mono truncate mb-4">{link.url}</p>
                                <a href={link.url} target="_blank" rel="noopener noreferrer">
                                  <Button className="gap-2 bg-purple-600 hover:bg-purple-500">
                                    <ExternalLink className="w-4 h-4" />Open Link
                                  </Button>
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Embed lesson — rendered inside a sandboxed srcdoc iframe so scripts and
                      platform-specific players (Bunny Stream, Vidalytics, etc.) run correctly */}
                  {selectedLesson.type === "embed" && (
                    <div className="mb-6">
                      {selectedLesson.content ? (
                        <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
                          <iframe
                            key={selectedLesson.id}
                            className="absolute inset-0 w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                            allowFullScreen
                            referrerPolicy="no-referrer"
                            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}body>*:first-child{position:absolute!important;top:0!important;left:0!important;width:100%!important;height:100%!important;padding-top:0!important}</style></head><body>${selectedLesson.content}</body></html>`}
                          />
                        </div>
                      ) : (
                        <div className="p-8 bg-card rounded-xl border border-border text-center">
                          <Play className="w-12 h-12 text-cyan-400/50 mx-auto mb-3" />
                          <p className="text-muted-foreground text-sm">No embed code configured for this lesson.</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">Add your HTML embed code in the admin editor.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quiz placeholder */}
                  {selectedLesson.type === "quiz" && (
                    <div className="p-8 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-2xl text-center mb-6">
                      <div className="w-16 h-16 rounded-2xl bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center mx-auto mb-4">
                        <HelpCircle className="w-8 h-8 text-yellow-400" />
                      </div>
                      <h3 className="font-semibold text-foreground mb-2">Quiz</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto">Quiz questions for this lesson are configured in the admin panel. Please check back soon!</p>
                    </div>
                  )}

                  {/* Text content / notes — skip for embed since content holds raw HTML */}
                  {selectedLesson.content && selectedLesson.type !== "embed" && (
                    <div className={`${selectedLesson.type !== "text" ? "mt-6 pt-6 border-t border-border" : ""}`}>
                      {selectedLesson.type !== "text" && (
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Lesson Notes</h3>
                      )}
                      <div className="prose prose-invert max-w-none">
                        <TextContent content={selectedLesson.content} />
                      </div>
                    </div>
                  )}

                  {/* Empty text lesson */}
                  {selectedLesson.type === "text" && !selectedLesson.content && (
                    <div className="p-8 bg-card rounded-xl border border-border text-center mb-6">
                      <FileText className="w-12 h-12 text-green-400/50 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">No content written for this lesson yet.</p>
                    </div>
                  )}

                  {/* Previous & Mark Complete buttons */}
                  <div className="flex items-center gap-3 mt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!prevLesson}
                      onClick={() => prevLesson && selectLesson(prevLesson as LessonEntry)}
                      className="gap-1.5 hover:bg-primary/10 hover:text-primary hover:border-primary transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <div className="flex-1" />
                    {!selectedLesson.isCompleted ? (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-green-600 hover:bg-green-500 text-white"
                        onClick={() => handleCompleteLesson(selectedLesson.id)}
                        disabled={completeLesson.isPending}
                      >
                        <Check className="w-3.5 h-3.5" />
                        {completeLesson.isPending ? "Saving..." : nextLesson ? "Complete & Next" : "Mark Complete"}
                      </Button>
                    ) : nextLesson ? (
                      <Button
                        size="sm"
                        className="gap-1.5 hover:bg-primary/10 hover:text-primary hover:border-primary transition-colors"
                        onClick={() => selectLesson(nextLesson as LessonEntry)}
                      >
                        Next Lesson
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}
