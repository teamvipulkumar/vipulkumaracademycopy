import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package, ChevronRight, Check, BookOpen, Clock, Award, Lock,
  Zap, Shield, Users, Star,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BundleCourse = {
  id: number; title: string; price: number; thumbnailUrl: string | null;
  category: string; level: string; description: string | null; durationMinutes: number; tag?: string | null;
};
type Bundle = {
  id: number; name: string; slug: string; description: string | null;
  thumbnailUrl: string | null; price: number; compareAtPrice: number | null;
  isActive: boolean; courses: BundleCourse[];
};

const levelColors: Record<string, string> = {
  beginner: "bg-green-500/10 text-green-400 border-green-500/20",
  intermediate: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  advanced: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function BundleDetailPage() {
  const [, params] = useRoute("/bundles/:id");
  const bundleId = parseInt(params?.id ?? "0");
  const [, navigate] = useLocation();

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [bundleId]);

  const { data: bundle, isLoading } = useQuery<Bundle>({
    queryKey: ["bundle", bundleId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/bundles/${bundleId}`);
      if (!res.ok) throw new Error("Bundle not found");
      return res.json();
    },
    enabled: bundleId > 0,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Package not found.
      </div>
    );
  }

  const savings = bundle.compareAtPrice
    ? bundle.compareAtPrice - bundle.price
    : bundle.courses.reduce((s, c) => s + c.price, 0) - bundle.price;

  const compareAt = bundle.compareAtPrice ?? bundle.courses.reduce((s, c) => s + c.price, 0);
  const savingsPct = compareAt > 0 ? Math.round((savings / compareAt) * 100) : 0;
  const totalMinutes = bundle.courses.reduce((s, c) => s + (c.durationMinutes ?? 0), 0);
  const totalHours = Math.round(totalMinutes / 60);

  const PurchaseCard = () => (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-5 shadow-xl shadow-primary/5 sticky top-24">
        {/* Price */}
        <div className="mb-4">
          {savingsPct > 0 && (
            <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full mb-2">
              <Zap className="w-3 h-3" />{savingsPct}% OFF — Save ₹{savings.toFixed(0)}
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">₹{bundle.price}</span>
            {compareAt > bundle.price && (
              <span className="text-base text-muted-foreground line-through">₹{compareAt.toFixed(0)}</span>
            )}
          </div>
        </div>

        <Button
          size="lg"
          className="w-full gap-2 text-base font-semibold mb-3"
          onClick={() => navigate(`/bundles/${bundleId}/checkout`)}
        >
          <Package className="w-4 h-4" />Get Package Now
        </Button>
        <p className="text-xs text-muted-foreground text-center mb-4">
          30-day money-back guarantee · Instant access
        </p>

        {/* What's included */}
        <div className="border-t border-border pt-4 space-y-2.5">
          <p className="text-xs font-semibold text-foreground mb-2">This package includes:</p>
          {[
            { icon: <BookOpen className="w-3.5 h-3.5 text-primary" />, label: `${bundle.courses.length} complete courses` },
            { icon: <Clock className="w-3.5 h-3.5 text-primary" />, label: `${totalHours}+ hours of content` },
            { icon: <Check className="w-3.5 h-3.5 text-green-400" />, label: "Full lifetime access" },
            { icon: <Check className="w-3.5 h-3.5 text-green-400" />, label: "Access on all devices" },
            { icon: <Award className="w-3.5 h-3.5 text-green-400" />, label: "Certificates of completion" },
            { icon: <Shield className="w-3.5 h-3.5 text-green-400" />, label: "30-day money-back guarantee" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex-shrink-0">{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Social proof */}
      <div className="bg-card border border-border rounded-xl p-4 text-center">
        <div className="flex items-center justify-center gap-1 mb-1">
          {[1,2,3,4,5].map(i => <Star key={i} className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />)}
        </div>
        <p className="text-xs text-muted-foreground">Trusted by thousands of learners</p>
        <div className="flex items-center justify-center gap-1 mt-2 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span>Join our growing community</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background w-full overflow-x-hidden">
      {/* ── Hero ── */}
      <div className="bg-gradient-to-b from-primary/10 via-primary/5 to-background border-b border-border py-8 md:py-12 px-4">
        <div className="w-full max-w-5xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
            <button onClick={() => navigate("/courses")} className="hover:text-foreground transition-colors">Courses</button>
            <ChevronRight className="w-3 h-3" />
            <span className="flex items-center gap-1"><Package className="w-3 h-3 text-primary" />Packages</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground truncate max-w-[180px]">{bundle.name}</span>
          </div>

          {/* Mobile layout */}
          <div className="block md:hidden">
            {bundle.thumbnailUrl ? (
              <div className="w-full aspect-video overflow-hidden rounded-2xl mb-5">
                <img src={bundle.thumbnailUrl} alt={bundle.name} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-full aspect-video bg-gradient-to-br from-primary/20 to-blue-900/40 rounded-2xl mb-5 flex items-center justify-center">
                <Package className="w-16 h-16 text-primary/30" />
              </div>
            )}
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center gap-1 text-xs font-semibold text-primary uppercase tracking-wider">
                <Star className="w-3.5 h-3.5 fill-primary" />Package
              </span>
              <span className="text-xs text-muted-foreground">· {bundle.courses.length} courses</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-3">{bundle.name}</h1>
            {bundle.description && <p className="text-muted-foreground text-sm leading-relaxed mb-4">{bundle.description}</p>}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-6">
              <div className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5 text-primary" /><span>{bundle.courses.length} courses</span></div>
              <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-primary" /><span>{totalHours}+ hours</span></div>
              <div className="flex items-center gap-1"><Award className="w-3.5 h-3.5 text-primary" /><span>Certificates included</span></div>
            </div>
            <PurchaseCard />
          </div>

          {/* Desktop layout */}
          <div className="hidden md:grid md:grid-cols-3 gap-8 items-start">
            <div className="md:col-span-2">
              {bundle.thumbnailUrl ? (
                <div className="w-full aspect-video overflow-hidden rounded-2xl mb-5">
                  <img src={bundle.thumbnailUrl} alt={bundle.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-full aspect-video bg-gradient-to-br from-primary/20 to-blue-900/40 rounded-2xl mb-5 flex items-center justify-center">
                  <Package className="w-24 h-24 text-primary/20" />
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center gap-1 text-sm font-semibold text-primary uppercase tracking-wider">
                  <Star className="w-4 h-4 fill-primary" />Course Package
                </span>
                <span className="text-sm text-muted-foreground">· {bundle.courses.length} courses included</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">{bundle.name}</h1>
              {bundle.description && <p className="text-muted-foreground leading-relaxed mb-6 text-base">{bundle.description}</p>}
              <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-primary" /><span>{bundle.courses.length} complete courses</span></div>
                <div className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-primary" /><span>{totalHours}+ hours of content</span></div>
                <div className="flex items-center gap-1.5"><Award className="w-4 h-4 text-primary" /><span>Certificates included</span></div>
              </div>
            </div>
            <PurchaseCard />
          </div>
        </div>
      </div>

      {/* ── Courses Included ── */}
      <div className="w-full max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div className="md:grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <h2 className="text-xl md:text-2xl font-bold mb-6">Courses Included in This Package</h2>

            <div className="space-y-4">
              {bundle.courses.map((course, idx) => (
                <div key={course.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-colors">
                  <div className="flex gap-4 p-4">
                    {/* Thumbnail */}
                    <div className="relative flex-shrink-0 w-28 md:w-36 aspect-video rounded-xl overflow-hidden">
                      {course.thumbnailUrl ? (
                        <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-blue-900/40 flex items-center justify-center">
                          <span className="text-2xl font-black text-primary/30">{course.category?.charAt(0)}</span>
                        </div>
                      )}
                      {course.tag === "coming_soon" && (
                        <div className="absolute top-1 left-1 z-10 bg-[#1d4fd7] backdrop-blur-md border border-primary/60 text-white text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
                          Soon
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${levelColors[course.level] ?? ""}`}>
                          {course.level}
                        </Badge>
                        <span className="text-xs text-muted-foreground truncate">{course.category}</span>
                        <span className="text-xs text-muted-foreground hidden sm:block">·</span>
                        <span className="text-xs text-muted-foreground hidden sm:block">{Math.round((course.durationMinutes ?? 0) / 60)}h</span>
                      </div>
                      <h3 className="font-bold text-foreground text-sm md:text-base leading-snug mb-1.5">
                        <span className="text-primary/50 font-normal mr-1.5 text-xs">#{idx + 1}</span>
                        {course.title}
                      </h3>
                      {course.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{course.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-primary" />{Math.round((course.durationMinutes ?? 0) / 60)}h content</span>
                        <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-green-400" />Included in package</span>
                      </div>
                    </div>

                    {/* Price crossed out */}
                    <div className="flex-shrink-0 flex flex-col items-end justify-between">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground line-through">₹{course.price}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-xs text-green-400 font-medium">Included</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Value breakdown */}
            {savings > 0 && (
              <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                <h3 className="font-semibold text-sm text-foreground mb-3">Value Breakdown</h3>
                <div className="space-y-2 text-sm">
                  {bundle.courses.map(c => (
                    <div key={c.id} className="flex justify-between text-muted-foreground">
                      <span className="truncate mr-4">{c.title}</span>
                      <span className="flex-shrink-0 line-through">₹{c.price}</span>
                    </div>
                  ))}
                  <div className="border-t border-primary/20 pt-2 flex justify-between text-muted-foreground">
                    <span>Individual total</span>
                    <span className="line-through">₹{compareAt.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between text-green-400 font-semibold">
                    <span>Package savings ({savingsPct}% off)</span>
                    <span>-₹{savings.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-foreground text-base pt-1 border-t border-primary/20">
                    <span>Package price</span>
                    <span>₹{bundle.price}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Why buy bundle */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: <Zap className="w-5 h-5 text-primary" />, title: "Best Value", desc: `Save ₹${savings.toFixed(0)} vs buying individually` },
                { icon: <BookOpen className="w-5 h-5 text-primary" />, title: "All Courses", desc: "Instant access to every course in the package" },
                { icon: <Award className="w-5 h-5 text-primary" />, title: "Certificates", desc: "Earn a certificate for each completed course" },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="bg-card border border-border rounded-xl p-4 text-center">
                  <div className="flex justify-center mb-2">{icon}</div>
                  <p className="font-semibold text-sm text-foreground mb-1">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>

            {/* Mobile CTA */}
            <div className="mt-6 md:hidden">
              <Button
                size="lg"
                className="w-full gap-2 text-base font-semibold"
                onClick={() => navigate(`/bundles/${bundleId}/checkout`)}
              >
                <Package className="w-4 h-4" />Get Package · ₹{bundle.price}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">30-day money-back guarantee</p>
            </div>
          </div>

          {/* Desktop sidebar hidden — already shown above in sticky card */}
          <div className="hidden md:block" />
        </div>
      </div>
    </div>
  );
}
