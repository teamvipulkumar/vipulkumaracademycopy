import { Users, Target, Lightbulb, Award, TrendingUp, Heart } from "lucide-react";

const stats = [
  { label: "Students Enrolled", value: "10,000+" },
  { label: "Courses Published", value: "50+" },
  { label: "Countries Reached", value: "30+" },
  { label: "Success Stories", value: "2,500+" },
];

const values = [
  {
    icon: Target,
    title: "Results-First Learning",
    description: "Every course is built around one question: will this actually help students earn? We skip the fluff and focus on what moves the needle.",
  },
  {
    icon: Lightbulb,
    title: "Built by Operators",
    description: "Vipul Kumar is an active entrepreneur, not a theoretical educator. Our content comes from real campaigns, real stores, and real results.",
  },
  {
    icon: Heart,
    title: "Community Driven",
    description: "Learning is better together. Our student community shares wins, troubleshoots together, and holds each other accountable.",
  },
  {
    icon: Award,
    title: "Uncompromising Quality",
    description: "We obsess over course depth, video quality, and support response times. If it's not the best, it doesn't ship.",
  },
];

const team = [
  {
    name: "Vipul Kumar",
    role: "Founder & Lead Instructor",
    bio: "Serial entrepreneur and digital marketing expert with over 8 years of hands-on experience in affiliate marketing, e-commerce, and dropshipping. Vipul has generated crores in revenue across multiple business models and is passionate about making that knowledge accessible to everyone.",
    initial: "V",
  },
  {
    name: "Curriculum Team",
    role: "Content & Research",
    bio: "A dedicated team of marketers, copywriters, and educators who research, script, and refine every lesson to ensure maximum clarity and impact.",
    initial: "C",
  },
  {
    name: "Student Success Team",
    role: "Support & Mentorship",
    bio: "Our support specialists are available to help students with questions, troubleshoot issues, and keep learners on track toward their goals.",
    initial: "S",
  },
];

export default function AboutUsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-16">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-primary uppercase tracking-widest">Our Story</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">About ClickOcean</h1>
        <p className="text-lg text-muted-foreground leading-relaxed mb-8">
          We're on a mission to make high-income digital skills accessible to every ambitious person in India and beyond — regardless of their background, degree, or starting capital.
        </p>

        {/* Origin story */}
        <div className="prose prose-invert max-w-none space-y-5 text-muted-foreground leading-relaxed mb-14">
          <p>
            ClickOcean was founded with a single frustration: the gap between what business schools teach and what actually works online. The founders started their entrepreneurial journey with almost nothing — a laptop, a Wi-Fi connection, and a relentless drive to figure things out through trial and error.
          </p>
          <p>
            After building multiple revenue streams through affiliate marketing, dropshipping, and e-commerce, the team realized that the real playbooks — the ones that actually work — weren't being taught anywhere. Most online courses were either too generic, already outdated, or taught by people who had never actually run a business.
          </p>
          <p>
            So they built the school they wished they had. ClickOcean was born from real campaigns, real failures, and real wins. Every module, every case study, and every strategy comes directly from active business operations — not theory.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-14">
          {stats.map(({ label, value }) => (
            <div key={label} className="text-center p-4 rounded-xl border border-border bg-card">
              <p className="text-2xl font-extrabold text-primary mb-1">{value}</p>
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Mission */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 mb-14">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Our Mission</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            To equip 1 million students with practical, income-generating digital skills by 2030 — through courses, community, and mentorship that go beyond theory and deliver real-world results.
          </p>
        </div>

        {/* Values */}
        <h2 className="text-2xl font-bold text-foreground mb-6">What We Stand For</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-14">
          {values.map(({ icon: Icon, title, description }) => (
            <div key={title} className="p-5 rounded-xl border border-border bg-card">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                <Icon className="w-4.5 h-4.5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

        {/* Team */}
        <h2 className="text-2xl font-bold text-foreground mb-6">The Team Behind the Academy</h2>
        <div className="space-y-5 mb-14">
          {team.map(({ name, role, bio, initial }) => (
            <div key={name} className="flex gap-4 p-5 rounded-xl border border-border bg-card">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {initial}
              </div>
              <div>
                <p className="font-semibold text-foreground">{name}</p>
                <p className="text-xs text-primary font-medium mb-2">{role}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{bio}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center rounded-xl border border-border bg-card p-8">
          <h2 className="text-xl font-bold text-foreground mb-2">Ready to start your journey?</h2>
          <p className="text-muted-foreground text-sm mb-5">Browse our courses and take the first step toward financial independence.</p>
          <a
            href="/courses"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            Browse Courses
          </a>
        </div>
      </div>
    </div>
  );
}
