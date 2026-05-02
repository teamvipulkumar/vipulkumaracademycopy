import { useListCourses, getListCoursesQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  TrendingUp, Users, BookOpen, CheckCircle, ArrowRight, Star,
  Zap, Shield, Award, Package, Play, Trophy, Quote,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATS = [
  { label: "Active Students", value: "2,400+", icon: Users },
  { label: "Average Rating",  value: "4.9 / 5", icon: Star },
  { label: "Courses Available", value: "15+",  icon: BookOpen },
  { label: "Hours of Content", value: "200+",  icon: BookOpen },
];

const FEATURES = [
  { icon: Zap,      title: "Action-First Curriculum", desc: "Every module is built around one practical action you can apply to your own work." },
  { icon: Shield,   title: "Taught by Practitioners", desc: "All content is created and reviewed by experienced industry practitioners." },
  { icon: Award,    title: "Lifetime Access",         desc: "Buy once, access forever. Includes all future course updates at no additional cost." },
  { icon: TrendingUp, title: "Affiliate Program",     desc: "Share courses you genuinely love and receive referral rewards on successful referrals." },
];

const TESTIMONIALS = [
  { name: "Arjun M.", role: "Affiliate Marketer",  initials: "AM", text: "I finally understood how to build a proper funnel, craft compelling offers, and drive targeted traffic. The step-by-step structure made every concept click.", stars: 5 },
  { name: "Priya S.", role: "E-commerce Founder",  initials: "PS", text: "The course taught me product research, supplier negotiation, and how to set up a store that converts. Skills I could immediately put into practice.", stars: 5 },
  { name: "Rohan K.", role: "Dropshipper",          initials: "RK", text: "Learned how to analyse winning products, manage ad creatives, and build reliable supplier relationships. It changed how I think about the whole business.", stars: 5 },
];

const STEPS = [
  { num: "01", Icon: BookOpen, title: "Browse & Choose", desc: "Explore our curated collection of premium courses and find the perfect fit for your goals." },
  { num: "02", Icon: Play,     title: "Enroll & Learn",  desc: "Get instant access to video lectures and hands-on projects. Learn at your own pace." },
  { num: "03", Icon: Trophy,   title: "Apply & Grow",    desc: "Complete courses, earn certificates, and build in-demand digital skills you can apply in your career." },
] as const;

const levelColors: Record<string, string> = {
  beginner:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  intermediate: "bg-amber-500/10  text-amber-400  border-amber-500/20",
  advanced:     "bg-rose-500/10   text-rose-400   border-rose-500/20",
};

type BundleCourse = { id: number; title: string };
type Bundle = {
  id: number; name: string; slug: string; description: string | null;
  thumbnailUrl: string | null; price: number; compareAtPrice: number | null;
  isActive: boolean; courses: BundleCourse[];
};
type HomepageVisibility = { showFeaturedCourses: boolean; showFeaturedPackages: boolean };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary mb-3">{children}</p>
  );
}

export default function Home() {
  const { data: coursesData, isLoading } = useListCourses({ limit: 3 }, {
    query: { queryKey: getListCoursesQueryKey({ limit: 3 }) },
  });

  const { data: bundles, isLoading: bundlesLoading } = useQuery<Bundle[]>({
    queryKey: ["public-bundles"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/bundles`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: visibility } = useQuery<HomepageVisibility>({
    queryKey: ["homepage-visibility"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/public/homepage-visibility`);
      if (!res.ok) return { showFeaturedCourses: true, showFeaturedPackages: true };
      return res.json();
    },
    staleTime: 30_000,
  });

  const showCourses  = visibility?.showFeaturedCourses  ?? true;
  const showPackages = visibility?.showFeaturedPackages ?? true;

  return (
    <div className="flex flex-col">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate py-12 md:py-32 px-4 sm:px-6 flex flex-col items-center text-center overflow-hidden">
        {/* layered background glows */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--primary)/0.18),transparent)]" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 -z-10 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* eyebrow badge */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-3 py-1 text-[10px] sm:text-xs font-semibold tracking-widest text-primary uppercase mb-5 sm:mb-8 shadow-sm">
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-primary flex-shrink-0" />
          Premium Business Education
        </div>

        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] mb-5 md:mb-6">
          Master the Skills That
          <span className="block text-primary">Build Online Businesses</span>
        </h1>

        <p className="text-sm sm:text-base md:text-xl text-muted-foreground mb-7 md:mb-10 max-w-xs sm:max-w-xl leading-relaxed">
          Practical, skill-based courses in Affiliate Marketing, E-commerce, and Dropshipping —
          taught by experienced industry practitioners.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto">
          <Button size="lg" className="h-11 sm:h-12 px-7 sm:px-9 text-sm font-semibold shadow-lg shadow-primary/20 w-full sm:w-auto" asChild>
            <Link href="/courses">Explore the Catalog <ArrowRight className="w-4 h-4 ml-2" /></Link>
          </Button>
          <Button size="lg" variant="outline" className="h-11 sm:h-12 px-7 sm:px-9 text-sm border-border/60 hover:border-border w-full sm:w-auto" asChild>
            <Link href="/affiliate">Join the Affiliate Program</Link>
          </Button>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row sm:flex-wrap justify-center gap-y-2 sm:gap-y-3 gap-x-8 text-xs sm:text-sm text-muted-foreground">
          {["Practical, action-oriented lessons", "30-day money-back guarantee", "Lifetime access & free updates"].map(t => (
            <div key={t} className="flex items-center justify-center gap-1.5 sm:gap-2">
              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
              <span>{t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────────── */}
      <section className="bg-card/40 border-y border-border/60 py-10 px-6">
        <div className="container mx-auto max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <div key={s.label} className={`text-center ${i < 3 ? "md:border-r md:border-border/50" : ""}`}>
              <div className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1.5 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURED COURSES ─────────────────────────────────────────────── */}
      {showCourses && (
        <section className="py-20 px-6 bg-background">
          <div className="container mx-auto max-w-5xl">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <SectionLabel>Our Courses</SectionLabel>
                <h2 className="text-3xl font-extrabold tracking-tight mb-1">Featured Courses</h2>
                <p className="text-muted-foreground text-sm">The exact playbooks to start scaling today.</p>
              </div>
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary self-start sm:self-auto shrink-0" asChild>
                <Link href="/courses">View all courses <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => <div key={i} className="h-80 bg-card rounded-xl animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(coursesData?.courses ?? []).map(course => (
                  <Link href={`/courses/${course.id}`} key={course.id}>
                    <div className="group h-full flex flex-col bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-primary/5">
                      <div className="relative w-full aspect-video overflow-hidden flex-shrink-0">
                        {course.thumbnailUrl ? (
                          <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                            <span className="text-6xl font-black text-primary/15 select-none">{course.category.charAt(0)}</span>
                          </div>
                        )}
                        {(course as { tag?: string | null }).tag === "coming_soon" && (
                          <div className="absolute top-2 left-2 z-10 bg-[#1d4fd7] backdrop-blur-md border border-primary/60 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                            Coming Soon
                          </div>
                        )}
                      </div>
                      <div className="p-5 flex flex-col flex-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold capitalize self-start mb-2 ${levelColors[course.level] ?? ""}`}>{course.level}</span>
                        <div className="mb-2">
                          <span className="text-[10px] font-semibold tracking-widest uppercase text-primary truncate">{course.category}</span>
                        </div>
                        <h3 className="font-bold text-base leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-2">{course.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 flex-1 leading-relaxed">{course.description}</p>
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/60">
                          <span className="text-lg font-extrabold">₹{course.price}</span>
                          <Button size="sm" className="h-8 px-4 text-xs font-semibold">Enroll Now</Button>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── FEATURED PACKAGES ────────────────────────────────────────────── */}
      {showPackages && (bundlesLoading || (bundles && bundles.length > 0)) && (
        <section className="py-20 px-6 bg-card/25 border-y border-border/60">
          <div className="container mx-auto max-w-5xl">
            <div className="mb-10">
              <SectionLabel>Value Bundles</SectionLabel>
              <h2 className="text-3xl font-extrabold tracking-tight mb-1">Featured Packages</h2>
              <p className="text-muted-foreground text-sm">Maximum value. Bundled for serious learners.</p>
            </div>

            {bundlesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => <div key={i} className="h-80 bg-card rounded-xl animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(bundles ?? []).map(bundle => (
                  <Link href={`/bundles/${bundle.id}`} key={bundle.id}>
                    <div className="group h-full flex flex-col bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-primary/5">
                      {bundle.thumbnailUrl ? (
                        <div className="w-full aspect-video overflow-hidden flex-shrink-0">
                          <img src={bundle.thumbnailUrl} alt={bundle.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-full aspect-video bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center flex-shrink-0">
                          <Package className="w-10 h-10 text-primary/25" />
                        </div>
                      )}
                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-semibold tracking-widest uppercase text-primary">Package</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-primary/10 text-primary border-primary/20 flex-shrink-0">
                            {bundle.courses.length} {bundle.courses.length === 1 ? "course" : "courses"}
                          </span>
                        </div>
                        <h3 className="font-bold text-base leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-2">{bundle.name}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{bundle.description}</p>
                        {bundle.courses.length > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {bundle.courses.slice(0, 3).map(c => (
                              <li key={c.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                <span className="truncate">{c.title}</span>
                              </li>
                            ))}
                            {bundle.courses.length > 3 && (
                              <li className="text-xs text-muted-foreground/70 pl-4">+{bundle.courses.length - 3} more included</li>
                            )}
                          </ul>
                        )}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/60 mt-auto">
                          <div>
                            <span className="text-lg font-extrabold">₹{bundle.price}</span>
                            {bundle.compareAtPrice && (
                              <span className="text-xs text-muted-foreground line-through ml-2">₹{bundle.compareAtPrice}</span>
                            )}
                          </div>
                          <Button size="sm" className="h-8 px-4 text-xs font-semibold">Get Package</Button>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 3 SIMPLE STEPS ───────────────────────────────────────────────── */}
      <section className="relative py-20 px-6 overflow-hidden bg-background border-b border-border/60">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,hsl(var(--primary)/0.07),transparent)]" />
        <div className="relative container mx-auto max-w-4xl text-center">
          <SectionLabel>How It Works</SectionLabel>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">
            Start Learning in <span className="text-primary">3 Simple Steps</span>
          </h2>
          <p className="text-muted-foreground text-sm mb-14 max-w-sm mx-auto leading-relaxed">
            Getting started is easy. Begin your learning journey in minutes.
          </p>

          <div className="relative">
            <div className="hidden md:block absolute top-10 left-[calc(100%/6)] right-[calc(100%/6)] h-px bg-border/70" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
              {STEPS.map(({ num, Icon, title, desc }) => (
                <div key={num} className="flex flex-col items-center text-center">
                  <div className="relative mb-5 z-10">
                    <div className="w-20 h-20 rounded-2xl bg-card border border-border flex items-center justify-center shadow-md">
                      <Icon className="w-8 h-8 text-primary" strokeWidth={1.5} />
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                      <span className="text-[10px] font-bold text-primary-foreground leading-none">{num}</span>
                    </div>
                  </div>
                  <h3 className="font-bold text-sm mb-1.5 text-foreground">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY VKA ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-card/25 border-b border-border/60">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <SectionLabel>Why Choose Us</SectionLabel>
            <h2 className="text-3xl font-extrabold tracking-tight mb-2">Built Different. On Purpose.</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              We built the platform we wished existed when we were starting out.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="flex gap-4 p-5 rounded-xl bg-card border border-border/70 hover:border-primary/30 transition-colors duration-200">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-background border-b border-border/60">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <SectionLabel>Student Results</SectionLabel>
            <h2 className="text-3xl font-extrabold tracking-tight mb-2">Real People. Real Revenue.</h2>
            <p className="text-muted-foreground text-sm">Hear directly from operators who've taken the courses.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="relative p-6 rounded-xl bg-card border border-border/70 flex flex-col">
                <Quote className="w-6 h-6 text-primary/20 mb-3 flex-shrink-0" />
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">"{t.text}"</p>
                <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border/50">
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-primary">{t.initials}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <section className="relative py-14 md:py-24 px-4 sm:px-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,hsl(var(--primary)/0.12),transparent)]" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_40%_40%_at_50%_50%,hsl(var(--primary)/0.06),transparent)]" />
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-3 py-1 text-[10px] sm:text-xs font-semibold tracking-widest text-primary uppercase mb-5 sm:mb-6">
            <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" /> Limited Seats — Enroll Today
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
            Stop Consuming.<br />Start Executing.
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base mb-7 md:mb-10 max-w-xs sm:max-w-lg mx-auto leading-relaxed">
            The difference between reading about a skill and truly mastering it is practice.
            Get the practical playbooks used by experienced practitioners — starting today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center w-full max-w-xs sm:max-w-none mx-auto">
            <Button size="lg" className="h-11 sm:h-12 px-8 sm:px-10 text-sm font-semibold shadow-lg shadow-primary/25 w-full sm:w-auto" asChild>
              <Link href="/register">Create Free Account <ArrowRight className="w-4 h-4 ml-2" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="h-11 sm:h-12 px-8 sm:px-10 text-sm border-border/60 hover:border-border w-full sm:w-auto" asChild>
              <Link href="/courses">Browse Courses</Link>
            </Button>
          </div>
          <p className="mt-5 text-xs text-muted-foreground/60">
            No credit card required · 30-day money-back guarantee
          </p>
        </div>
      </section>

    </div>
  );
}
