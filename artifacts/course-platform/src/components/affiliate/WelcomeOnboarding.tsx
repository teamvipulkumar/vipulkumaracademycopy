import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles, PartyPopper, Rocket, ChevronRight, ChevronLeft, X,
  BadgeIndianRupee, Cookie, Link2, BarChart3, Image as ImageIcon,
  ShieldCheck, Wallet, Building2, FileText, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

type TourStep = {
  selector: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  placement?: "top" | "bottom" | "left" | "right" | "auto";
  /** True when target lives inside the sidebar — parent should open it on mobile. */
  isNavTarget?: boolean;
};

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="earnings-stats"]',
    title: "Your Earnings at a Glance",
    description: "Track today, yesterday, last 7 days and last 30 days commissions in real time. Numbers refresh automatically every 45 seconds.",
    icon: <BadgeIndianRupee className="w-5 h-5 text-green-400" />,
    placement: "bottom",
  },
  {
    selector: '[data-tour="earnings-chart"]',
    title: "Daily Earnings Chart",
    description: "Visualise your performance trend. Switch between 7 and 30 day views to spot what's working.",
    icon: <BarChart3 className="w-5 h-5 text-blue-400" />,
    placement: "top",
  },
  {
    selector: '[data-tour="nav-links"]',
    title: "Your Affiliate Link",
    description: "Get your unique referral link from here — copy it once, share everywhere. Every sale through this link earns you commission.",
    icon: <Link2 className="w-5 h-5 text-primary" />,
    placement: "auto",
    isNavTarget: true,
  },
  {
    selector: '[data-tour="nav-creatives"]',
    title: "Ready-Made Creatives",
    description: "Banners, posts and ad copy you can use directly on Instagram, WhatsApp and YouTube. No design skills needed.",
    icon: <ImageIcon className="w-5 h-5 text-purple-400" />,
    placement: "auto",
    isNavTarget: true,
  },
  {
    selector: '[data-tour="nav-kyc"]',
    title: "Complete KYC + Bank",
    description: "Submit your KYC (PAN) and bank details once — both are required before your first payout. KYC verification usually takes 24-48 hours.",
    icon: <ShieldCheck className="w-5 h-5 text-amber-400" />,
    placement: "auto",
    isNavTarget: true,
  },
  {
    selector: '[data-tour="nav-payouts"]',
    title: "Request Payouts",
    description: "Once your pending earnings cross the minimum threshold, request a payout here. Track all past payouts and their status too.",
    icon: <Wallet className="w-5 h-5 text-green-400" />,
    placement: "auto",
    isNavTarget: true,
  },
  {
    selector: '[data-tour="nav-pixel"]',
    title: "Facebook Pixel (Optional)",
    description: "Connect your own Facebook Pixel to retarget visitors who clicked your affiliate links. Powerful if you run paid ads — completely optional otherwise.",
    icon: <Zap className="w-5 h-5 text-pink-400" />,
    placement: "auto",
    isNavTarget: true,
  },
  {
    selector: '[data-tour="nav-bank"]',
    title: "Bank Details",
    description: "Add your account number, IFSC and beneficiary name here. Without bank details, payouts cannot be processed — fill this once and forget.",
    icon: <Building2 className="w-5 h-5 text-cyan-400" />,
    placement: "auto",
    isNavTarget: true,
  },
];

type Phase = "welcome" | "tour" | "done";

export default function WelcomeOnboarding({
  userName,
  commissionRate,
  cookieDays,
  referralCode,
  onComplete,
  onTourStart,
  onTourEnd,
  onTourStepChange,
  skipWelcomeModal = false,
}: {
  userName: string;
  commissionRate: number;
  cookieDays: number;
  referralCode: string;
  onComplete: () => void;
  onTourStart?: () => void;
  onTourEnd?: () => void;
  onTourStepChange?: (info: { index: number; isNavTarget: boolean }) => void;
  /** When true, jump straight to the interactive TourOverlay (no congrats modal).
   *  Used for the manual "Replay tour" entry point so returning users don't
   *  see the first-time congratulations card again. */
  skipWelcomeModal?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(skipWelcomeModal ? "tour" : "welcome");
  const stampedRef = useRef(false);

  // Stamp `welcomedAt` on the server as soon as this component first mounts in
  // the first-time flow. Skip stamping entirely on a manual replay — the user
  // is already past first-time onboarding (their welcomedAt is already set,
  // and the endpoint is a no-op anyway, but skipping the call keeps replays
  // network-quiet).
  useEffect(() => {
    if (skipWelcomeModal) return;
    if (stampedRef.current) return;
    stampedRef.current = true;
    void (async () => {
      try {
        await fetch(`${API_BASE}/api/affiliate/welcome-complete`, {
          method: "POST",
          credentials: "include",
        });
      } catch { /* non-fatal — finish() will retry on dismiss */ }
    })();
  }, [skipWelcomeModal]);

  // When the parent renders us with skipWelcomeModal=true, we land directly in
  // the tour phase — but the parent still needs its onTourStart hook to fire
  // (e.g. switch to the earnings tab so the first two tour targets exist).
  useEffect(() => {
    if (skipWelcomeModal) onTourStart?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipWelcomeModal]);

  const finish = useCallback(async () => {
    // Replay mode: pure UI dismissal, no server call. The user is past
    // first-time onboarding so there's nothing to stamp; always notify the
    // parent so it can reset its `replayingTour` flag and let the user
    // replay again.
    if (skipWelcomeModal) {
      setPhase("done");
      onTourEnd?.();
      onComplete();
      return;
    }

    let ok = false;
    try {
      const res = await fetch(`${API_BASE}/api/affiliate/welcome-complete`, {
        method: "POST",
        credentials: "include",
      });
      ok = res.ok;
    } catch { /* non-fatal */ }
    if (ok) {
      setPhase("done");
      onTourEnd?.();
      onComplete();
    } else {
      // Retry once silently before giving up so we don't loop the welcome on every reload.
      try {
        const retry = await fetch(`${API_BASE}/api/affiliate/welcome-complete`, {
          method: "POST",
          credentials: "include",
        });
        ok = retry.ok;
      } catch { /* non-fatal */ }
      setPhase("done");
      onTourEnd?.();
      // Only call onComplete (which optimistically updates parent) if the server confirmed.
      if (ok) onComplete();
    }
  }, [onComplete, onTourEnd, skipWelcomeModal]);

  const startTour = useCallback(() => {
    onTourStart?.();
    setPhase("tour");
  }, [onTourStart]);

  if (phase === "done") return null;

  if (phase === "welcome") {
    return createPortal(
      <WelcomeModal
        userName={userName}
        commissionRate={commissionRate}
        cookieDays={cookieDays}
        referralCode={referralCode}
        onStartTour={startTour}
        onSkip={finish}
      />,
      document.body,
    );
  }

  return createPortal(
    <TourOverlay onFinish={finish} onStepChange={onTourStepChange} />,
    document.body,
  );
}

/* ────────────────────── Welcome Modal ────────────────────── */
function WelcomeModal({
  userName, commissionRate, cookieDays, referralCode,
  onStartTour, onSkip,
}: {
  userName: string;
  commissionRate: number;
  cookieDays: number;
  referralCode: string;
  onStartTour: () => void;
  onSkip: () => void;
}) {
  const firstName = userName?.split(" ")[0] ?? "Affiliate";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onSkip} />

      {/* Floating sparkles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <Sparkles
            key={i}
            className="absolute text-amber-300/40 animate-pulse"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: `${10 + Math.random() * 24}px`,
              height: `${10 + Math.random() * 24}px`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${1.5 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Modal card */}
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl shadow-primary/20 overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Top gradient header */}
        <div className="relative bg-gradient-to-br from-primary/30 via-purple-500/20 to-amber-400/20 px-6 pt-8 pb-6 text-center overflow-hidden">
          <div className="absolute inset-0 opacity-20"
               style={{
                 backgroundImage: "radial-gradient(circle at 30% 20%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)",
                 backgroundSize: "30px 30px",
               }} />
          <div className="relative">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mb-4 shadow-lg shadow-amber-500/40 animate-in zoom-in duration-500">
              <PartyPopper className="w-9 h-9 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-1">
              Congratulations, {firstName}! 🎉
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Your affiliate account has been approved. You can now promote VKA courses and earn commission on every sale.
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="px-6 py-5 grid grid-cols-3 gap-3 border-b border-border">
          <Stat
            label="Commission"
            value={`${commissionRate}%`}
            icon={<BadgeIndianRupee className="w-4 h-4 text-green-400" />}
            color="text-green-400"
          />
          <Stat
            label="Cookie"
            value={`${cookieDays}d`}
            icon={<Cookie className="w-4 h-4 text-amber-400" />}
            color="text-amber-400"
          />
          <Stat
            label="Your Code"
            value={referralCode || "—"}
            icon={<Link2 className="w-4 h-4 text-primary" />}
            color="text-primary"
            mono
          />
        </div>

        {/* CTAs */}
        <div className="px-6 py-5 space-y-3">
          <Button
            onClick={onStartTour}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer gap-2"
          >
            <Rocket className="w-4 h-4" />
            Take a Quick Tour (60 sec)
          </Button>
          <button
            onClick={onSkip}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2 cursor-pointer"
          >
            Skip & explore on my own
          </button>
        </div>

        {/* Close X */}
        <button
          onClick={onSkip}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, color, mono }: {
  label: string; value: string; icon: React.ReactNode; color: string; mono?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        {icon}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      </div>
      <p className={`text-base sm:text-lg font-extrabold ${color} ${mono ? "font-mono truncate" : ""}`}>
        {value}
      </p>
    </div>
  );
}

/* ────────────────────── Tour Overlay ────────────────────── */
function TourOverlay({
  onFinish,
  onStepChange,
}: {
  onFinish: () => void;
  onStepChange?: (info: { index: number; isNavTarget: boolean }) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);

  // Notify parent whenever the active step changes so it can adjust the layout
  // (e.g. open the mobile sidebar only for nav-target steps).
  useEffect(() => {
    const s = TOUR_STEPS[stepIndex];
    if (s) onStepChange?.({ index: stepIndex, isNavTarget: !!s.isNavTarget });
  }, [stepIndex, onStepChange]);

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; arrow: string } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  // Locate target element + compute position
  useEffect(() => {
    if (!step) return;
    let cancelled = false;

    const updatePosition = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        setTooltipPos(null);
        return;
      }
      // Scroll into view
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

      // Wait a frame for scroll, then read position
      requestAnimationFrame(() => {
        if (cancelled) return;
        const r = el.getBoundingClientRect();
        setRect(r);
        setTooltipPos(computeTooltipPosition(r, step.placement ?? "auto"));
      });
    };

    updatePosition();

    const onResize = () => updatePosition();
    const onScroll = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect(r);
      setTooltipPos(computeTooltipPosition(r, step.placement ?? "auto"));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);

    // Re-check position after a delay (for any layout shifts / mobile sidebar etc)
    const t = setTimeout(updatePosition, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [step]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        if (isLast) onFinish();
        else setStepIndex(i => Math.min(TOUR_STEPS.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setStepIndex(i => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLast, onFinish]);

  const next = () => isLast ? onFinish() : setStepIndex(i => i + 1);
  const prev = () => setStepIndex(i => Math.max(0, i - 1));

  // SVG mask: dim everything except a rounded rectangle around the target
  const PADDING = 8;
  const RADIUS = 12;
  const hasTarget = rect !== null;
  const cutout = rect && {
    x: Math.max(0, rect.left - PADDING),
    y: Math.max(0, rect.top - PADDING),
    w: rect.width + PADDING * 2,
    h: rect.height + PADDING * 2,
  };

  return (
    <div className="fixed inset-0 z-[100] animate-in fade-in duration-200">
      {/* SVG dimmed backdrop with cutout */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto" onClick={() => { /* swallow */ }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {cutout && (
              <rect
                x={cutout.x} y={cutout.y} width={cutout.w} height={cutout.h}
                rx={RADIUS} ry={RADIUS} fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.78)" mask="url(#tour-mask)" />
        {/* Highlight ring */}
        {cutout && (
          <rect
            x={cutout.x} y={cutout.y} width={cutout.w} height={cutout.h}
            rx={RADIUS} ry={RADIUS}
            fill="none" stroke="rgb(59,130,246)" strokeWidth="2"
            className="tour-pulse"
          />
        )}
      </svg>

      {/* Tooltip card */}
      {hasTarget && tooltipPos ? (
        <div
          ref={tooltipRef}
          className="absolute pointer-events-auto w-[min(360px,calc(100vw-32px))] bg-card border border-border rounded-2xl shadow-2xl shadow-primary/30 p-5 animate-in fade-in zoom-in-95 duration-200"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          <TooltipBody step={step} stepIndex={stepIndex} total={TOUR_STEPS.length} onPrev={prev} onNext={next} onSkip={onFinish} isLast={isLast} />
        </div>
      ) : (
        // Fallback: center the tooltip if target not found
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
          <div className="pointer-events-auto w-[min(360px,calc(100vw-32px))] bg-card border border-border rounded-2xl shadow-2xl p-5">
            <TooltipBody step={step} stepIndex={stepIndex} total={TOUR_STEPS.length} onPrev={prev} onNext={next} onSkip={onFinish} isLast={isLast} />
          </div>
        </div>
      )}

      {/* Tour pulse animation */}
      <style>{`
        @keyframes tourPulse {
          0%, 100% { stroke-opacity: 1; stroke-width: 2; }
          50% { stroke-opacity: 0.5; stroke-width: 4; }
        }
        .tour-pulse { animation: tourPulse 1.8s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function TooltipBody({
  step, stepIndex, total, onPrev, onNext, onSkip, isLast,
}: {
  step: TourStep; stepIndex: number; total: number;
  onPrev: () => void; onNext: () => void; onSkip: () => void; isLast: boolean;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          {step.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Step {stepIndex + 1} of {total}
          </p>
          <h3 className="text-base font-bold text-foreground leading-tight">{step.title}</h3>
        </div>
        <button
          onClick={onSkip}
          aria-label="Close tour"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= stepIndex ? "bg-primary" : "bg-white/10"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Footer: nav */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrev}
            disabled={stepIndex === 0}
            className="h-8 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-1" />Back
          </Button>
          <Button
            size="sm"
            onClick={onNext}
            className="h-8 bg-primary hover:bg-primary/90 cursor-pointer"
          >
            {isLast ? "Finish" : "Next"}
            {!isLast && <ChevronRight className="w-3.5 h-3.5 ml-1" />}
          </Button>
        </div>
      </div>
    </>
  );
}

/* Decide where to place the tooltip relative to the target rect.
   Returns viewport-fixed top/left in pixels. */
function computeTooltipPosition(rect: DOMRect, placement: TourStep["placement"]):
  { top: number; left: number; arrow: string } {
  const TT_W = Math.min(360, window.innerWidth - 32);
  const TT_H = 240; // approximate
  const GAP = 16;
  const margin = 16;

  // Auto choose placement based on available space
  let p = placement ?? "auto";
  if (p === "auto") {
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;
    if (spaceBelow >= TT_H + GAP) p = "bottom";
    else if (spaceAbove >= TT_H + GAP) p = "top";
    else if (spaceRight >= TT_W + GAP) p = "right";
    else if (spaceLeft >= TT_W + GAP) p = "left";
    else p = "bottom";
  }

  let top = 0, left = 0;
  switch (p) {
    case "bottom":
      top = rect.bottom + GAP;
      left = rect.left + rect.width / 2 - TT_W / 2;
      break;
    case "top":
      top = rect.top - TT_H - GAP;
      left = rect.left + rect.width / 2 - TT_W / 2;
      break;
    case "right":
      top = rect.top + rect.height / 2 - TT_H / 2;
      left = rect.right + GAP;
      break;
    case "left":
      top = rect.top + rect.height / 2 - TT_H / 2;
      left = rect.left - TT_W - GAP;
      break;
  }

  // Clamp to viewport
  left = Math.max(margin, Math.min(window.innerWidth - TT_W - margin, left));
  top = Math.max(margin, Math.min(window.innerHeight - TT_H - margin, top));

  return { top, left, arrow: p };
}
