import { useId } from "react";

/**
 * Vipul Kumar Academy default brand mark.
 *
 * ── Design ────────────────────────────────────────────────────────────
 *   • Icon — premium rounded-square badge with a stylised graduation cap
 *     (mortarboard + cap + tassel) in white. Conveys education / academy
 *     at a glance.
 *   • Wordmark — two lines: "VIPUL KUMAR" (extra-bold) over "ACADEMY"
 *     (letter-spaced caption).
 *
 * ── Theming ───────────────────────────────────────────────────────────
 * The badge gradient adapts to the active theme so the mark stays
 * vibrant on every background:
 *   • dark / light → bold sky → indigo gradient (default)
 *   • midnight     → emerald → teal gradient (fresh accent that pops
 *     against the deep midnight backdrop)
 * Theme detection uses the `.light` / `.dark` / `.midnight` classes the
 * ThemeProvider sets on <html>, via the SVG's CSS sibling selectors.
 *
 * The wordmark uses `currentColor`, so it inherits the parent text
 * colour and remains legible across every theme automatically.
 *
 * Width derives from `height` to preserve the 200 × 48 viewBox aspect
 * ratio (~4.17:1).
 *
 * NOTE: Component name kept as `UpcalifyLogo` purely to avoid touching
 * every existing import — the rendered mark is fully Vipul Kumar Academy.
 */
export function UpcalifyLogo({
  height = 32,
  className,
  title = "Vipul Kumar Academy",
}: {
  height?: number;
  className?: string;
  title?: string;
}) {
  const ratio = 200 / 48;
  // Per-instance IDs so multiple logos on a page never collide.
  const uid = useId().replace(/:/g, "");
  const darkGradId = `vka-grad-dark-${uid}`;
  const lightGradId = `vka-grad-light-${uid}`;
  const innerGradId = `vka-grad-inner-${uid}`;
  const ringGradId = `vka-grad-ring-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 48"
      height={height}
      width={height * ratio}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>

      <defs>
        {/* Dark / midnight theme gradient (sky → indigo). */}
        <linearGradient id={darkGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="55%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </linearGradient>
        {/* Light theme gradient (emerald → teal — fresh academic feel). */}
        <linearGradient id={lightGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="55%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        {/* Subtle inner highlight on the badge top edge for depth. */}
        <linearGradient id={innerGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        {/* Soft outer ring used only on light theme to give the badge
            a defined edge against pale page backgrounds. */}
        <linearGradient id={ringGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
        </linearGradient>

        {/* Theme-aware badge fill driven by the <html> theme class.
            Default (dark / light) uses the sky→indigo gradient; the
            `.midnight` ancestor swaps it to the emerald→teal gradient. */}
        <style>{`
          .vka-badge-fill-${uid} { fill: url(#${darkGradId}); }
          :where(.midnight) .vka-badge-fill-${uid} { fill: url(#${lightGradId}); }

          .vka-badge-ring-${uid} { stroke: url(#${ringGradId}); }
          :where(.dark, .midnight) .vka-badge-ring-${uid} { stroke: transparent; }
        `}</style>
      </defs>

      {/* ── Badge ── */}
      <g>
        {/* Main badge body (theme-aware fill). */}
        <rect
          className={`vka-badge-fill-${uid}`}
          x="2"
          y="2"
          width="44"
          height="44"
          rx="11"
          ry="11"
        />
        {/* Inner top highlight for depth. */}
        <rect x="2" y="2" width="44" height="44" rx="11" ry="11" fill={`url(#${innerGradId})`} />
        {/* Outer ring only renders in light theme (transparent otherwise)
            to give the badge a soft definition against white pages. */}
        <rect
          className={`vka-badge-ring-${uid}`}
          x="2.5"
          y="2.5"
          width="43"
          height="43"
          rx="10.5"
          ry="10.5"
          fill="none"
          strokeWidth="1"
        />

        {/* ─ Graduation cap icon (white) ─ */}
        <g fill="#FFFFFF">
          {/* Mortarboard — diamond/rhombus seen in slight perspective. */}
          <path d="M 24 11 L 40 19 L 24 27 L 8 19 Z" />
          {/* Cap base — arched trapezoid sitting under the mortarboard. */}
          <path d="M 14.5 21.5 L 16 30 Q 16 32.2 18.2 32.2 L 29.8 32.2 Q 32 32.2 32 30 L 33.5 21.5 L 24 26.4 Z" />
        </g>
        {/* Center button stud on the mortarboard for definition. */}
        <circle cx="24" cy="19" r="1.4" fill="rgba(15,23,42,0.32)" />
        {/* Tassel cord — curves from the centre stud out to the right edge. */}
        <path
          d="M 24 19 C 32.5 19 36 21 36 23.5 L 36 28.5"
          stroke="#FFFFFF"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
        {/* Tassel bead at the end of the cord. */}
        <ellipse cx="36" cy="30.4" rx="1.7" ry="2.2" fill="#FFFFFF" />
      </g>

      {/* ── Wordmark — inherits currentColor from parent text colour ── */}
      <g fill="currentColor">
        <text
          x="58"
          y="23"
          fontFamily="ui-sans-serif, -apple-system, 'Segoe UI', Inter, system-ui, Roboto, Arial, sans-serif"
          fontSize="15"
          fontWeight="800"
          letterSpacing="0.2"
        >
          VIPUL KUMAR
        </text>
        <text
          x="58"
          y="38"
          fontFamily="ui-sans-serif, -apple-system, 'Segoe UI', Inter, system-ui, Roboto, Arial, sans-serif"
          fontSize="9.5"
          fontWeight="600"
          letterSpacing="3.4"
          opacity="0.72"
        >
          ACADEMY
        </text>
      </g>
    </svg>
  );
}
