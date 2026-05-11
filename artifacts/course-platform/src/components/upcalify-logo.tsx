import { useId } from "react";

/**
 * Vipul Kumar Academy default brand mark — inline SVG so:
 *   • the icon is a premium rounded-square "VK" monogram badge filled with
 *     a sky → indigo gradient (academic / EdTech feel). The fixed gradient
 *     pops cleanly on every theme background (dark / light / midnight).
 *   • the wordmark fills follow `currentColor` (adapts to every theme via
 *     the parent's text colour).
 *
 * Layout: a rounded badge with stylised "VK" monogram on the left, paired
 * with a two-line wordmark — "VIPUL KUMAR" (bold) over "ACADEMY"
 * (letter-spaced caption) — for a refined, institutional feel.
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
  // Per-instance gradient ID so multiple logos on a page never collide.
  const uid = useId().replace(/:/g, "");
  const gradId = `vka-grad-${uid}`;
  const innerGradId = `vka-grad-inner-${uid}`;
  const fillRef = `url(#${gradId})`;
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
        {/* Premium sky → indigo gradient drives the badge fill. */}
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="55%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </linearGradient>
        {/* Subtle inner highlight for the badge top edge. */}
        <linearGradient id={innerGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ── Badge — rounded square with VK monogram ── */}
      <g>
        {/* Main badge body */}
        <rect x="2" y="2" width="44" height="44" rx="11" ry="11" fill={fillRef} />
        {/* Top-edge inner highlight for depth */}
        <rect x="2" y="2" width="44" height="44" rx="11" ry="11" fill={`url(#${innerGradId})`} />

        {/* "V" stroke — bold geometric chevron */}
        <path
          d="M 11.5 14 L 19.5 34 L 24 34 L 16 14 Z"
          fill="#FFFFFF"
        />
        {/* "K" — vertical bar + two angled strokes */}
        <path
          d="M 26 14 L 30.5 14 L 30.5 22.5 L 36.5 14 L 41.6 14 L 35 23 L 41.8 34 L 36.5 34 L 31.7 26 L 30.5 27.6 L 30.5 34 L 26 34 Z"
          fill="#FFFFFF"
        />

        {/* Tiny graduation tassel detail above the badge for an academic touch */}
        <circle cx="42" cy="7" r="1.6" fill="#FFFFFF" opacity="0.9" />
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
