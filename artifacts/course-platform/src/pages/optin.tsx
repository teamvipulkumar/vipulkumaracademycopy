import { useState } from "react";
import { Link, useLocation } from "wouter";
import { SiteFooter } from "@/components/layout/app-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, CheckCircle2, ShieldCheck, VideoOff, BadgeDollarSign } from "lucide-react";

const TRUST_BADGES = [
  { label: "No Upselling",          Icon: ShieldCheck },
  { label: "No Webinars",           Icon: VideoOff },
  { label: "No High Ticket Pitches",Icon: BadgeDollarSign },
];

export default function OptinPage() {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.email.trim()) return;
    setError("");
    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setLoading(false);
    setSubmitted(true);
    navigate("/vsl");
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}>
      {/* ── Hero / form section ── */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 md:py-12">
        <div className="w-full max-w-2xl mx-auto text-center">

          {/* Eyebrow */}
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase text-primary bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-8">
            Free Training
          </span>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-[3.25rem] font-extrabold leading-[1.12] tracking-tight text-foreground mb-5">
            Learn How to Start{" "}
            <span className="text-primary">Affiliate Marketing</span>{" "}
            with WarriorPlus
          </h1>

          {/* Subheadline */}
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed mb-5">
            Learn the exact system I used to build a{" "}
            <span className="text-primary font-semibold">6-figure affiliate marketing business</span>{" "}
            from scratch — even if you're a complete beginner.
          </p>

          {/* Form card */}
          {!submitted ? (
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/30 space-y-4 text-left"
              style={{ backgroundColor: "var(--card)" }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">First Name *</label>
                  <Input
                    placeholder="Enter Your First Name"
                    value={form.firstName}
                    onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                    required
                    className="h-12 bg-background/60 border-border text-base placeholder:text-muted-foreground/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Name</label>
                  <Input
                    placeholder="Enter Your Last Name"
                    value={form.lastName}
                    onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                    className="h-12 bg-background/60 border-border text-base placeholder:text-muted-foreground/40"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email Address *</label>
                <Input
                  type="email"
                  placeholder="Enter Your Best Email Address"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  required
                  className="h-12 bg-background/60 border-border text-base placeholder:text-muted-foreground/40"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className={`w-full text-base font-bold bg-primary hover:bg-primary/90 text-white rounded-xl gap-2.5${!loading ? " cta-bounce-glow" : ""}`}
                style={{ height: "52px" }}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Sending you access...</>
                ) : (
                  <>Show Me The System <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>


            </form>
          ) : (
            <div
              className="rounded-2xl border p-8 sm:p-12 shadow-2xl shadow-black/30 text-center space-y-4"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
            >
              <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">You're In!</h2>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Check your inbox — we've sent the free training access link to{" "}
                <span className="text-foreground font-medium">{form.email}</span>.
              </p>
              <Button variant="outline" className="mt-2 border-border" asChild>
                <Link href="/courses">Browse All Courses</Link>
              </Button>
            </div>
          )}

          {/* Trust badges */}
          {!submitted && (
            <div className="flex flex-nowrap items-center justify-center gap-3 sm:gap-6 mt-3 w-full">
              {TRUST_BADGES.map(({ label, Icon }) => (
                <span
                  key={label}
                  className="flex items-center gap-1 sm:gap-1.5 font-medium whitespace-nowrap flex-shrink-0"
                  style={{ color: "var(--muted-foreground)", fontSize: "clamp(11px, 2.8vw, 14px)" }}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 text-primary opacity-70" />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Platform footer ── */}
      <SiteFooter />
    </div>
  );
}
