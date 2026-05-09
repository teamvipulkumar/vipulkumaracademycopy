import { Briefcase, MapPin, Clock, Users, Zap, Globe, Heart } from "lucide-react";

const perks = [
  { icon: Globe, title: "100% Remote", description: "Work from anywhere in India. We believe great talent isn't limited to a single city." },
  { icon: Zap, title: "Fast Growth", description: "Join a fast-scaling EdTech company where your impact is visible and your career moves quickly." },
  { icon: Users, title: "Mission-Driven Team", description: "Work alongside people who are genuinely passionate about changing how India learns." },
  { icon: Heart, title: "Great Culture", description: "Transparent, low-ego, high-ownership culture where results matter more than office politics." },
  { icon: Clock, title: "Flexible Hours", description: "We care about output, not when you clock in. Manage your time the way that works best for you." },
  { icon: Briefcase, title: "Competitive Pay", description: "Market-rate salaries with performance bonuses, equity discussions for senior roles, and regular reviews." },
];

const openings = [
  {
    title: "Content Writer – Digital Marketing",
    type: "Full-time",
    location: "Remote",
    department: "Content",
    description: "Write engaging, SEO-optimised blog posts, email sequences, course scripts, and social media content on topics like affiliate marketing, dropshipping, and e-commerce.",
    requirements: ["2+ years of content writing experience", "Strong understanding of digital marketing concepts", "Excellent Hindi and English writing skills", "SEO knowledge is a plus"],
  },
  {
    title: "Video Editor & Motion Designer",
    type: "Full-time",
    location: "Remote",
    department: "Production",
    description: "Edit course videos, create motion graphics, and produce promotional content that maintains our high production quality across all platforms.",
    requirements: ["Proficiency in Premiere Pro and After Effects", "Experience with educational or YouTube content", "Strong eye for design and pacing", "Portfolio demonstrating past work required"],
  },
  {
    title: "Student Success Executive",
    type: "Full-time",
    location: "Remote",
    department: "Support",
    description: "Be the first point of contact for our students — resolve queries, guide learners through course content, and ensure every student gets the most out of their learning experience.",
    requirements: ["Excellent communication skills in Hindi and English", "Empathetic, patient, and solution-oriented mindset", "Familiarity with e-learning platforms", "Prior customer support experience preferred"],
  },
  {
    title: "Performance Marketing Specialist",
    type: "Full-time",
    location: "Remote",
    department: "Marketing",
    description: "Plan and execute paid ad campaigns across Meta, Google, and YouTube to drive student enrollments. Own the entire funnel from creative brief to ROAS optimization.",
    requirements: ["3+ years running paid performance campaigns", "Experience with Meta Ads and Google Ads at scale", "Strong analytical mindset and data-driven approach", "EdTech or D2C experience is a big plus"],
  },
];

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-primary uppercase tracking-widest">Careers</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Join Our Team</h1>
        <p className="text-lg text-muted-foreground leading-relaxed mb-12">
          Help us build the best digital education platform in India. We're looking for passionate, driven people who want to make a real difference in how students learn and earn.
        </p>

        {/* Perks */}
        <h2 className="text-2xl font-bold text-foreground mb-6">Why Work With Us</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-14">
          {perks.map(({ icon: Icon, title, description }) => (
            <div key={title} className="p-5 rounded-xl border border-border bg-card">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

        {/* Open Roles */}
        <h2 className="text-2xl font-bold text-foreground mb-2">Open Positions</h2>
        <p className="text-muted-foreground mb-8">We're a growing team and these roles change frequently. Even if you don't see a perfect fit, we'd love to hear from you.</p>

        <div className="space-y-5 mb-14">
          {openings.map(({ title, type, location, department, description, requirements }) => (
            <div key={title} className="p-6 rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-bold text-foreground text-base">{title}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Briefcase className="w-3 h-3" />{type}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />{location}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">{department}</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{description}</p>
              <div className="mb-4">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Requirements</p>
                <ul className="space-y-1">
                  {requirements.map(r => (
                    <li key={r} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href="mailto:careers@vipulkumaracademy.com?subject=Application: Upcalify"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Apply Now
              </a>
            </div>
          ))}
        </div>

        {/* General application */}
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <h2 className="text-lg font-bold text-foreground mb-2">Don't see your role?</h2>
          <p className="text-sm text-muted-foreground mb-5">
            We're always looking for exceptional talent. Send us your CV and a short note on what you'd like to build with us.
          </p>
          <a
            href="mailto:careers@vipulkumaracademy.com?subject=General Application – Upcalify"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Send a General Application
          </a>
        </div>
      </div>
    </div>
  );
}
