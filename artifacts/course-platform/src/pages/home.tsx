import { useListCourses, getListCoursesQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import {
  TrendingUp, Users, BookOpen, CheckCircle, ArrowRight, Star,
  Zap, Shield, Award, Package, Play, Trophy, Quote,
  Target, Rocket, BadgeCheck, Sparkles, Heart, Globe,
  Megaphone, ShoppingCart, LineChart, Lightbulb, Infinity as InfinityIcon,
  X, HelpCircle, ChevronDown, Layers, Clock,
} from "lucide-react";
import { useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import movementImage from "@/assets/movement-workspace.png";

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

const TOPICS = [
  "Affiliate Marketing", "Dropshipping", "Funnel Building", "Product Research",
  "Paid Ads", "Email Marketing", "Copywriting", "Conversion Optimization",
  "Supplier Sourcing", "Brand Building", "Sales Automation", "E-commerce",
  "Lead Generation", "SEO Basics", "Customer Acquisition", "Offer Crafting",
];

const OUTCOMES = [
  { icon: Megaphone,    title: "Build High-Converting Funnels",    desc: "Design landing pages, email sequences, and offers that turn cold traffic into paying customers." },
  { icon: ShoppingCart, title: "Launch Real E-commerce Stores",    desc: "Source winning products, set up automated fulfillment, and run a store that scales." },
  { icon: LineChart,    title: "Run Profitable Ad Campaigns",      desc: "Master Meta and Google ad creatives, targeting, and budget management to drive consistent ROI." },
  { icon: Target,       title: "Find & Validate Winning Offers",   desc: "Use proven research frameworks to spot products and angles before the market gets saturated." },
  { icon: Lightbulb,    title: "Write Copy That Sells",            desc: "Craft headlines, hooks, and calls-to-action that grab attention and move people to buy." },
  { icon: Rocket,       title: "Automate Customer Acquisition",    desc: "Set up systems that bring in qualified leads on autopilot — even while you sleep." },
];

const COMPARISON = [
  { feature: "Action-first lessons you can apply same day",        vka: true,  others: false },
  { feature: "Taught by practitioners actively running businesses",vka: true,  others: false },
  { feature: "Hindi + English — easy for Indian learners",         vka: true,  others: false },
  { feature: "Lifetime access with all future updates",            vka: true,  others: false },
  { feature: "Real templates, scripts, and frameworks included",   vka: true,  others: false },
  { feature: "30-day money-back guarantee, no questions asked",    vka: true,  others: false },
  { feature: "Outdated theory recycled from old YouTube videos",   vka: false, others: true },
  { feature: "Locked behind monthly subscriptions",                vka: false, others: true },
];

const PILLARS = [
  { icon: Layers,     title: "Curated Curriculum",  desc: "Only the lessons that actually move the needle — no fluff, no filler." },
  { icon: BadgeCheck, title: "Practitioner-Vetted", desc: "Every framework is tested in real businesses before it reaches a lesson." },
  { icon: InfinityIcon, title: "Lifetime Updates",  desc: "Markets change. Your access — and the content — stays current forever." },
  { icon: Heart,      title: "Community Support",   desc: "Join a focused community of operators, founders, and serious learners." },
  { icon: Sparkles,   title: "Premium Production",  desc: "High-quality video, clear audio, and structured chapters in every course." },
  { icon: Globe,      title: "Learn From Anywhere", desc: "Mobile, tablet, or desktop — pick up exactly where you left off." },
];

const FAQS = [
  { q: "Are these courses suitable for complete beginners?",
    a: "Yes. Every course starts from the fundamentals and builds up step-by-step. You don't need any prior experience — just the willingness to take action and apply what you learn." },
  { q: "How long do I have access to a course after I buy it?",
    a: "Forever. All purchases include lifetime access to the course plus every future update we release — no recurring fees, no subscription traps." },
  { q: "What if I don't like the course after enrolling?",
    a: "We offer a no-questions-asked 30-day money-back guarantee. If you genuinely tried the course and it didn't deliver, just email us and we'll refund you in full." },
  { q: "Do I get a certificate after completing a course?",
    a: "Yes. Once you finish all lessons in a course, you'll receive a digital certificate of completion that you can share on LinkedIn or with potential clients." },
  { q: "Can I watch the lessons on my phone?",
    a: "Absolutely. The platform is fully optimized for mobile, tablet, and desktop. Your progress syncs across all devices automatically." },
  { q: "Is there any support if I get stuck?",
    a: "Yes. You can reach our team through the help center inside your dashboard, and you'll also have access to a community of fellow learners." },
];

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

/* Reusable scroll-in motion primitives */
function FadeUp({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function StaggerGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: reduce ? 0 : 0.08, delayChildren: reduce ? 0 : 0.05 } },
      }}
    >
      {children}
    </motion.div>
  );
}

function StaggerItem({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}

function FaqItem({ q, a, value }: { q: string; a: string; value: string }) {
  return (
    <Accordion.Item value={value} className="group bg-card/60 border border-border/70 rounded-xl overflow-hidden hover:border-primary/30 transition-colors data-[state=open]:border-primary/40 data-[state=open]:bg-card">
      <Accordion.Header>
        <Accordion.Trigger className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer">
          <span>{q}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-300 group-data-[state=open]:rotate-180 group-data-[state=open]:text-primary" />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
        <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{a}</p>
      </Accordion.Content>
    </Accordion.Item>
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
        <StaggerGrid className="container mx-auto max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <StaggerItem key={s.label} className={`text-center ${i < 3 ? "md:border-r md:border-border/50" : ""}`}>
              <div className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1.5 font-medium">{s.label}</div>
            </StaggerItem>
          ))}
        </StaggerGrid>
      </section>
      {/* ── TOPICS MARQUEE ─────────────────────────────────────────────── */}
      <section className="relative py-8 md:py-10 bg-background border-b border-border/60 overflow-hidden">
        <div className="text-center mb-6 px-4">
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground/80">
            Skills · Topics · Frameworks Inside
          </p>
        </div>
        {/* Edge fade masks */}
        <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-16 md:w-32 z-10 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute top-0 bottom-0 right-0 w-16 md:w-32 z-10 bg-gradient-to-l from-background to-transparent" />
        <div className="flex overflow-x-hidden py-1.5">
          <div className="marquee-track flex gap-3 pr-3 flex-shrink-0">
            {[...TOPICS, ...TOPICS].map((topic, i) => (
              <span
                key={`${topic}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-4 py-2 text-xs font-medium text-foreground/85 whitespace-nowrap shadow-sm"
              >
                <Sparkles className="w-3 h-3 text-primary flex-shrink-0" />
                {topic}
              </span>
            ))}
          </div>
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
                          <div>
                            <span className="text-lg font-extrabold">₹{course.price}</span>
                            {course.compareAtPrice && (
                              <span className="text-xs text-muted-foreground line-through ml-2">₹{course.compareAtPrice}</span>
                            )}
                          </div>
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
          <FadeUp className="text-center mb-12">
            <SectionLabel>Why Choose Us</SectionLabel>
            <h2 className="text-3xl font-extrabold tracking-tight mb-2">Built Different. On Purpose.</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              We built the platform we wished existed when we were starting out.
            </p>
          </FadeUp>
          <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES.map(f => (
              <StaggerItem key={f.title} className="flex gap-4 p-5 rounded-xl bg-card border border-border/70 hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>
      {/* ── ABOUT / MOVEMENT ─────────────────────────────────────────────── */}
      <section className="relative py-20 md:py-24 px-6 bg-background border-b border-border/60 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_80%_50%,hsl(var(--primary)/0.08),transparent)]" />
        <div className="relative container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            {/* Left — Text */}
            <FadeUp className="order-2 lg:order-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/70 bg-card/60 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-5">
                <Heart className="w-3 h-3 text-primary" />
                About VKA
              </span>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5">
                More Than a Course Library —{" "}
                <span className="text-primary">A Builder's Community.</span>
              </h2>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-5">
                Vipul Kumar Academy started with one belief: serious learners deserve more than
                recycled tutorials and theory-heavy slides. Every course we publish is shaped by
                operators actively running businesses — not retired marketers reading from old
                playbooks.
              </p>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-7">
                Inside, you get hands-on toolkits, live breakdowns, a network of fellow learners,
                and a structured learning path that meets you where you are — whether you're
                exploring a new digital skill or sharpening your existing toolkit.
              </p>

              {/* Mini stat row */}
              <div className="grid grid-cols-3 gap-4 sm:gap-6 mb-7 pb-7 border-b border-border/60">
                <div>
                  <div className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">2.4k+</div>
                  <div className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">Builders</div>
                </div>
                <div>
                  <div className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">15+</div>
                  <div className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">Programs</div>
                </div>
                <div>
                  <div className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">4.9★</div>
                  <div className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">Rating</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" className="h-12 px-6 text-sm font-semibold" asChild>
                  <Link href="/courses">
                    Join the Movement
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="h-12 px-6 text-sm font-semibold border-border/60 hover:border-primary/40" asChild>
                  <Link href="/about-us">Our Story</Link>
                </Button>
              </div>
            </FadeUp>

            {/* Right — Image */}
            <FadeUp delay={0.15} className="order-1 lg:order-2 relative">
              {/* Glow behind image */}
              <div className="pointer-events-none absolute -inset-4 md:-inset-8 bg-gradient-to-br from-primary/20 via-blue-500/10 to-transparent rounded-[2rem] blur-2xl" />
              <div className="relative rounded-2xl overflow-hidden border border-border/70 shadow-2xl shadow-primary/10 bg-card">
                <img
                  src={movementImage}
                  alt="A focused builder's workspace"
                  loading="lazy"
                  decoding="async"
                  width={1280}
                  height={800}
                  className="w-full h-full object-cover aspect-[16/10]"
                />
                {/* Subtle vignette overlay for cohesion */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent pointer-events-none" />

                {/* Floating mini badge */}
                <div className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-md border border-border/70 shadow-lg">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="text-[11px] font-semibold text-foreground">Live cohort building</span>
                </div>

                {/* Floating bottom card */}
                <div className="absolute bottom-4 right-4 max-w-[200px] p-3 rounded-xl bg-background/85 backdrop-blur-md border border-border/70 shadow-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Top Outcome</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground leading-snug">Focused on skills that compound.</p>
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>
      {/* ── PLATFORM PILLARS ─────────────────────────────────────────────── */}
      <section className="relative py-20 px-6 bg-background border-b border-border/60 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,hsl(var(--primary)/0.06),transparent)]" />
        <div className="relative container mx-auto max-w-6xl">
          <FadeUp className="text-center mb-14 max-w-2xl mx-auto">
            <SectionLabel>The Platform</SectionLabel>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">
              An Ecosystem Built Around <span className="text-primary">Real Outcomes</span>
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
              Six pillars that separate us from generic course marketplaces — every feature designed
              to help serious learners turn knowledge into income.
            </p>
          </FadeUp>
          <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PILLARS.map(p => (
              <StaggerItem
                key={p.title}
                className="group relative p-6 rounded-2xl bg-card/70 border border-border/70 hover:border-primary/40 transition-all duration-300 overflow-hidden"
              >
                <div className="pointer-events-none absolute -top-12 -right-12 w-32 h-32 rounded-full bg-primary/8 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500" />
                <div className="relative">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    <p.icon className="w-5 h-5 text-primary" strokeWidth={1.75} />
                  </div>
                  <h3 className="font-bold text-base mb-1.5 text-foreground">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>
      {/* ── OUTCOMES — SKILLS YOU'LL MASTER ──────────────────────────────── */}
      <section className="py-20 px-6 bg-card/25 border-b border-border/60">
        <div className="container mx-auto max-w-6xl">
          <FadeUp className="text-center mb-14 max-w-2xl mx-auto">
            <SectionLabel>What You'll Master</SectionLabel>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">
              Skills You'll Walk Away <span className="text-primary">Actually Knowing</span>
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
              Every course is built around concrete outcomes — not vague promises. Here's what you'll
              be able to do after going through our curriculum.
            </p>
          </FadeUp>
          <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {OUTCOMES.map(o => (
              <StaggerItem
                key={o.title}
                className="group relative h-full p-6 rounded-2xl bg-card border border-border/70 hover:border-primary/40 hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <o.icon className="w-6 h-6 text-primary" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base mb-1.5 text-foreground group-hover:text-primary transition-colors">{o.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{o.desc}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>
      {/* ── COMPARISON: VKA vs Generic ───────────────────────────────────── */}
      <section className="py-20 px-6 bg-background border-b border-border/60">
        <div className="container mx-auto max-w-4xl">
          <FadeUp className="text-center mb-12 max-w-2xl mx-auto">
            <SectionLabel>The Difference</SectionLabel>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">
              VKA vs <span className="text-muted-foreground">Generic Course Sites</span>
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
              We strip out everything that wastes your time and double down on what actually moves
              the needle for your business.
            </p>
          </FadeUp>

          <FadeUp className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_120px_120px] items-center gap-3 sm:gap-6 px-4 sm:px-6 py-4 bg-card border-b border-border/70">
              <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Feature</span>
              <span className="text-xs font-bold tracking-wider uppercase text-primary text-center flex items-center justify-center gap-1">
                <Award className="w-3.5 h-3.5" /> VKA
              </span>
              <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground/80 text-center">Others</span>
            </div>
            {/* Rows */}
            <StaggerGrid>
              {COMPARISON.map((row, i) => (
                <StaggerItem
                  key={row.feature}
                  className={`grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_120px_120px] items-center gap-3 sm:gap-6 px-4 sm:px-6 py-4 ${i !== COMPARISON.length - 1 ? "border-b border-border/50" : ""} hover:bg-card/80 transition-colors`}
                >
                  <span className="text-sm text-foreground/90 leading-snug">{row.feature}</span>
                  <span className="flex items-center justify-center w-12 sm:w-auto">
                    {row.vka ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-500/10 border border-rose-500/25">
                        <X className="w-4 h-4 text-rose-400" />
                      </span>
                    )}
                  </span>
                  <span className="flex items-center justify-center w-12 sm:w-auto">
                    {row.others ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-500/10 border border-rose-500/25">
                        <CheckCircle className="w-4 h-4 text-rose-400/70" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted/50 border border-border/60">
                        <X className="w-4 h-4 text-muted-foreground/60" />
                      </span>
                    )}
                  </span>
                </StaggerItem>
              ))}
            </StaggerGrid>
          </FadeUp>
        </div>
      </section>
      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-background border-b border-border/60">
        <div className="container mx-auto max-w-5xl">
          <FadeUp className="text-center mb-12">
            <SectionLabel>Student Results</SectionLabel>
            <h2 className="text-3xl font-extrabold tracking-tight mb-2">Real People. Real Revenue.</h2>
            <p className="text-muted-foreground text-sm">Hear directly from operators who've taken the courses.</p>
          </FadeUp>
          <StaggerGrid className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map(t => (
              <StaggerItem key={t.name} className="relative p-6 rounded-xl bg-card border border-border/70 hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 flex flex-col">
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
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>
      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-card/25 border-b border-border/60">
        <div className="container mx-auto max-w-3xl">
          <FadeUp className="text-center mb-12">
            <SectionLabel>Questions, Answered</SectionLabel>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3 inline-flex items-center gap-3">
              <HelpCircle className="w-7 h-7 text-primary" strokeWidth={1.75} />
              Frequently Asked
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto leading-relaxed">
              Everything you need to know before getting started — straight answers, no marketing fluff.
            </p>
          </FadeUp>
          <FadeUp delay={0.1}>
            <Accordion.Root type="single" collapsible className="space-y-3">
              {FAQS.map((f, i) => (
                <FaqItem key={f.q} q={f.q} a={f.a} value={`faq-${i}`} />
              ))}
            </Accordion.Root>
          </FadeUp>
          <FadeUp delay={0.2} className="text-center mt-10">
            <p className="text-sm text-muted-foreground mb-4">Still have a question we didn't cover?</p>
            <Button variant="outline" size="sm" className="h-10 px-6 text-xs font-semibold border-border/60 hover:border-primary/40" asChild>
              <Link href="/contact-us">Contact Our Team <ArrowRight className="w-3.5 h-3.5 ml-2" /></Link>
            </Button>
          </FadeUp>
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
