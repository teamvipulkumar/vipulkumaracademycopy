import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetCourse, getGetCourseQueryKey, useValidateCoupon } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Play, Lock, FileText, HelpCircle, Tag, Check, Clock, BookOpen, Award, Link2 } from "lucide-react";

export default function CourseDetailPage() {
  const [, params] = useRoute("/courses/:id");
  const courseId = parseInt(params?.id ?? "0");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [expandedModules, setExpandedModules] = useState<number[]>([0]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number; type: string } | null>(null);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [courseId]);

  const { data: course, isLoading } = useGetCourse(courseId, {
    query: { queryKey: getGetCourseQueryKey(courseId), enabled: courseId > 0 }
  });

  const validateCoupon = useValidateCoupon();

  const price = parseFloat(String(course?.price ?? 0));
  const compareAtPrice = course?.compareAtPrice ? parseFloat(String(course.compareAtPrice)) : null;
  const discountedPrice = appliedCoupon
    ? appliedCoupon.type === "percentage"
      ? price - (price * appliedCoupon.discount / 100)
      : Math.max(0, price - appliedCoupon.discount)
    : price;

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) return;
    const trimmedCode = couponCode.trim().toUpperCase();
    validateCoupon.mutate({ data: { code: trimmedCode, courseId } }, {
      onSuccess: (data) => {
        if (!data.valid) { toast({ title: "Invalid coupon", description: data.message, variant: "destructive" }); return; }
        setAppliedCoupon({ code: trimmedCode, discount: data.discountValue ?? 0, type: data.discountType ?? "percentage" });
        toast({ title: "Coupon applied!", description: data.message });
      },
      onError: () => toast({ title: "Invalid coupon", description: "This code is invalid or expired.", variant: "destructive" }),
    });
  };

  const handleEnroll = () => {
    const query = new URLSearchParams();
    if (appliedCoupon) query.set("coupon", appliedCoupon.code);
    navigate(`/checkout/${courseId}?${query.toString()}`);
  };


  const toggleModule = (idx: number) =>
    setExpandedModules(p => p.includes(idx) ? p.filter(i => i !== idx) : [...p, idx]);

  const lessonIcon = (type: string) => {
    if (type === "video") return <Play className="w-3.5 h-3.5" />;
    if (type === "embed") return <Play className="w-3.5 h-3.5" />;
    if (type === "pdf") return <FileText className="w-3.5 h-3.5" />;
    if (type === "text") return <FileText className="w-3.5 h-3.5" />;
    if (type === "link") return <Link2 className="w-3.5 h-3.5" />;
    if (type === "quiz") return <HelpCircle className="w-3.5 h-3.5" />;
    return <FileText className="w-3.5 h-3.5" />;
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-primary" />
    </div>
  );
  if (!course) return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">Course not found.</div>
  );

  /* Shared purchase card */
  const PurchaseCard = () => (
    <div className="space-y-3">
      <div className="bg-card border border-white/10 rounded-xl p-5 md:p-6 shadow-lg">
        {appliedCoupon ? (
          <div className="mb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground line-through">₹{price.toFixed(2)}</div>
            <div className="text-3xl font-bold text-green-400">₹{discountedPrice.toFixed(2)}</div>
            <div className="flex items-center gap-1.5 text-xs text-green-400 mt-1">
              <Tag className="w-3 h-3" /><span>{appliedCoupon.code} applied</span>
            </div>
          </div>
        ) : (
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-3xl font-bold">₹{price.toFixed(2)}</span>
            {compareAtPrice && compareAtPrice > price && (
              <span className="text-base text-muted-foreground line-through">₹{compareAtPrice.toFixed(2)}</span>
            )}
          </div>
        )}

        {course.isEnrolled ? (
          <Button className="w-full mb-3" size="lg" onClick={() => navigate(`/learn/${courseId}`)}>
            <Play className="w-4 h-4 mr-2" /> Continue Learning
          </Button>
        ) : (
          <>
            {!appliedCoupon ? (
              <div className="flex gap-2 mb-4">
                <Input placeholder="Coupon code" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && handleApplyCoupon()} className="bg-background text-sm h-9 font-mono min-w-0" />
                <Button variant="outline" size="sm" onClick={handleApplyCoupon} disabled={validateCoupon.isPending} className="h-9 px-3">
                  {validateCoupon.isPending ? "..." : <Tag className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between mb-4 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <Check className="w-3.5 h-3.5" /><span className="font-mono font-bold">{appliedCoupon.code}</span>
                </div>
                <button onClick={() => { setAppliedCoupon(null); setCouponCode(""); }} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">Remove</button>
              </div>
            )}
            <Button className="w-full cursor-pointer" size="lg" onClick={handleEnroll}>
              Enroll Now · ₹{discountedPrice.toFixed(2)}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">30-day money-back guarantee</p>
          </>
        )}

        <div className="mt-4 pt-4 border-t border-border space-y-2">
          {["Full lifetime access", "Access on all devices", "Certificate of completion"].map(t => (
            <div key={t} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /><span>{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* This course includes — sits directly below the pricing card */}
      <div className="bg-card border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold mb-3 text-sm">This course includes</h3>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" /><span>{course.durationMinutes ? `${+(course.durationMinutes / 60).toFixed(1)} hours of content` : "Self-paced content"}</span></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><BookOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" /><span>{course.moduleCount} modules</span></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Award className="w-3.5 h-3.5 text-primary flex-shrink-0" /><span>Certificate of completion</span></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background w-full overflow-x-hidden">
      {/* Hero */}
      <div className="bg-gradient-to-b from-primary/10 via-primary/5 to-background border-b border-border py-8 md:py-12 px-4">
        <div className="w-full max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">
            <span>{course.category}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="capitalize">{course.level}</span>
          </div>

          {/* Mobile: stacked layout */}
          <div className="block md:hidden">
            {course.thumbnailUrl ? (
              <div className="w-full aspect-video mb-5">
                <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover rounded-xl" style={{ transform: "translateZ(0)" }} />
              </div>
            ) : (
              <div className="w-full aspect-video bg-gradient-to-br from-primary/20 to-blue-900/30 rounded-xl mb-5 flex items-center justify-center">
                <span className="text-6xl font-black text-primary/20 select-none">{course.category?.charAt(0)}</span>
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight mb-3">{course.title}</h1>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">{course.description}</p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-6">
              <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-primary" /><span>{Math.round(course.durationMinutes / 60)}h</span></div>
              <div className="flex items-center gap-1"><Award className="w-3.5 h-3.5 text-primary" /><span className="capitalize">{course.level}</span></div>
            </div>
            <PurchaseCard />
          </div>

          {/* Desktop: side-by-side */}
          <div className="hidden md:grid md:grid-cols-3 gap-8 items-start">
            <div className="md:col-span-2">
              {course.thumbnailUrl ? (
                <div className="w-full aspect-video mb-5">
                  <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover rounded-xl" style={{ transform: "translateZ(0)" }} />
                </div>
              ) : (
                <div className="w-full aspect-video bg-gradient-to-br from-primary/20 to-blue-900/30 rounded-xl mb-5 flex items-center justify-center">
                  <span className="text-6xl font-black text-primary/20 select-none">{course.category?.charAt(0)}</span>
                </div>
              )}
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">{course.title}</h1>
              <p className="text-muted-foreground leading-relaxed mb-6">{course.description}</p>
              <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-primary" /><span>{Math.round(course.durationMinutes / 60)} hours</span></div>
                <div className="flex items-center gap-1.5"><Award className="w-4 h-4 text-primary" /><span className="capitalize">{course.level}</span></div>
              </div>
            </div>
            <PurchaseCard />
          </div>
        </div>
      </div>

      {/* Curriculum */}
      <div className="w-full max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div>
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <h2 className="text-xl md:text-2xl font-bold">Course Curriculum</h2>
              {course.isEnrolled && (
                <button
                  onClick={() => navigate(`/learn/${courseId}`)}
                  className="flex-shrink-0 ml-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Continue</span>
                </button>
              )}
            </div>
            <div className="space-y-2 md:space-y-3">
              {(course.modules ?? []).map((mod, idx) => (
                <div key={mod.id} className="border border-white/10 rounded-xl overflow-hidden">
                  {/* Module header */}
                  <button
                    className="w-full flex items-center gap-2.5 p-3.5 md:p-4 bg-card hover:bg-card/80 transition-colors text-left"
                    onClick={() => toggleModule(idx)}
                  >
                    {expandedModules.includes(idx)
                      ? <ChevronDown className="w-4 h-4 text-primary flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate leading-snug">{mod.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{mod.lessons?.length ?? 0} lessons</p>
                    </div>
                  </button>

                  {/* Lessons list */}
                  {expandedModules.includes(idx) && (
                    <div className="divide-y divide-border">
                      {(mod.lessons ?? []).map(lesson => (
                        <div
                          key={lesson.id}
                          onClick={course.isEnrolled ? () => navigate(`/learn/${courseId}`) : undefined}
                          className={`flex items-center gap-3 px-4 py-3.5 md:px-6 md:py-3 bg-background/50${course.isEnrolled ? " hover:bg-primary/5 active:bg-primary/10 cursor-pointer transition-colors" : ""}`}
                        >
                          <span className={`flex-shrink-0 ${course.isEnrolled ? "text-primary" : "text-muted-foreground"}`}>
                            {lessonIcon(lesson.type)}
                          </span>
                          <span className="flex-1 text-xs md:text-sm truncate">{lesson.title}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {lesson.durationMinutes && (
                              <span className="text-xs text-muted-foreground">{lesson.durationMinutes}m</span>
                            )}
                            {lesson.isFree ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-400 border-green-500/30">Free</Badge>
                            ) : !course.isEnrolled ? (
                              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-green-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Mobile: enrolled CTA below curriculum */}
            {course.isEnrolled && (
              <div className="mt-4 md:hidden">
                <Button className="w-full gap-2" size="lg" onClick={() => navigate(`/learn/${courseId}`)}>
                  <Play className="w-4 h-4" /> Continue Learning
                </Button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
