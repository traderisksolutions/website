import type { Article } from "@/content/articles";

// Cover illustrations. One drawing per guide, all on the same 400 × 266 card:
// title set on the left, a pale topic tag under it, the drawing on the right.
// Burgundy family on one warm-grey ground, matching the --accent and --tile tokens.

export const K = "#1a1a1c";   // line
export const A = "#c9a3a9";   // dusty rose
export const T = "#7a1f2e";   // burgundy
export const R = "#a3414f";   // light burgundy
export const Y = "#ecdfe1";   // pale rose
export const W = "#ffffff";
const BG = "#efedeb";

export const line = { stroke: K, strokeWidth: 3.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Drawing({ art }: { art: Article["art"] }) {
  switch (art) {
    case "hardhat":
      return (
        <g>
          <path d="M14 122 Q14 40 78 40 Q142 40 142 122 Z" fill={A} {...line} />
          <path d="M78 40 V122 M52 50 Q46 84 46 122 M104 50 Q110 84 110 122" fill="none" {...line} strokeWidth={2.5} />
          <rect x="2" y="116" width="150" height="20" rx="10" fill={A} {...line} />
          <circle cx="44" cy="170" r="24" fill={W} {...line} />
          <path d="M37 154 h14 v9 h9 v14 h-9 v9 h-14 v-9 h-9 v-14 h9 Z" fill={R} />
          <path d="M120 160 l10 -6 M126 176 h12 M120 190 l10 6" fill="none" {...line} strokeWidth={3} />
        </g>
      );
    case "pass":
      return (
        <g>
          <g transform="rotate(9 95 150)">
            <rect x="48" y="96" width="92" height="112" rx="8" fill={T} {...line} />
            <circle cx="94" cy="142" r="16" fill="none" stroke={W} strokeWidth={3} />
            <path d="M70 182 h48" stroke={W} strokeWidth={3} strokeLinecap="round" />
          </g>
          <rect x="4" y="34" width="132" height="88" rx="10" fill={W} {...line} />
          <path d="M4 56 V44 Q4 34 14 34 H126 Q136 34 136 44 V56 Z" fill={A} {...line} />
          <circle cx="38" cy="88" r="15" fill={Y} {...line} />
          <path d="M66 82 h52 M66 98 h36" fill="none" {...line} strokeWidth={3} />
          <circle cx="40" cy="176" r="22" fill="none" stroke={R} strokeWidth={3.5} strokeDasharray="6 5" />
          <path d="M30 176 l7 7 l14 -15" fill="none" stroke={R} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "umbrella":
      return (
        <g>
          <path d="M6 104 Q76 -6 146 104 Q128 88 111 104 Q93 88 76 104 Q59 88 41 104 Q24 88 6 104 Z" fill={R} {...line} />
          <path d="M76 22 Q60 60 41 104 M76 22 Q92 60 111 104" fill="none" {...line} strokeWidth={2.5} />
          <path d="M76 104 V178 Q76 196 60 196 Q46 196 46 182" fill="none" {...line} />
          <rect x="96" y="150" width="48" height="44" rx="4" fill={Y} {...line} />
          <path d="M96 164 h48 M112 194 v-18 h16 v18" fill="none" {...line} strokeWidth={2.5} />
          <path d="M10 140 l-6 12 M28 150 l-6 12 M150 128 l-6 12 M18 176 l-6 12" fill="none" stroke={T} strokeWidth={3} strokeLinecap="round" />
        </g>
      );
    case "document":
      return (
        <g>
          <g transform="rotate(-6 70 100)">
            <rect x="16" y="20" width="110" height="150" rx="6" fill={W} {...line} />
            <path d="M30 52 l7 7 l14 -15" fill="none" stroke={T} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M30 92 l7 7 l14 -15" fill="none" stroke={T} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M31 124 l16 16 M47 124 l-16 16" fill="none" stroke={R} strokeWidth={4} strokeLinecap="round" />
            <path d="M62 52 h48 M62 92 h40 M62 132 h44" fill="none" {...line} strokeWidth={3} />
          </g>
          <circle cx="112" cy="162" r="24" fill={Y} fillOpacity={0.55} {...line} />
          <path d="M129 179 L148 198" fill="none" {...line} strokeWidth={7} />
        </g>
      );
    case "gavel":
      return (
        <g>
          <rect x="6" y="170" width="120" height="22" rx="6" fill={T} {...line} />
          <g transform="rotate(-32 80 90)">
            <rect x="72" y="88" width="14" height="96" rx="7" fill={W} {...line} />
            <rect x="26" y="50" width="106" height="40" rx="9" fill={A} {...line} />
            <path d="M46 50 v40 M112 50 v40" fill="none" {...line} strokeWidth={3} />
          </g>
          <path d="M18 150 l-10 -6 M30 140 l-4 -11 M140 158 l10 -4" fill="none" {...line} strokeWidth={3} />
        </g>
      );
    case "building":
      return (
        <g>
          <rect x="10" y="62" width="84" height="132" fill={W} {...line} />
          {[0, 1, 2, 3].map(r => [0, 1, 2].map(c => (
            <rect key={`${r}${c}`} x={22 + c * 24} y={76 + r * 26} width="14" height="14" fill={r === 0 && c > 0 ? R : Y} stroke={K} strokeWidth={2} />
          )))}
          <rect x="94" y="112" width="52" height="82" fill={T} {...line} />
          <path d="M106 128 h8 M126 128 h8 M106 148 h8 M126 148 h8 M106 168 h8 M126 168 h8" stroke={W} strokeWidth={3} strokeLinecap="round" />
          <path d="M60 62 C44 40 52 22 66 6 C66 22 76 26 80 38 C86 30 86 22 84 16 C98 32 98 52 84 62 Z" fill={R} {...line} />
          <path d="M66 62 C60 52 64 44 70 36 C72 46 80 50 76 62 Z" fill={A} />
        </g>
      );
  }
}

export function CoverArt({ article, compact = false }: { article: Article; compact?: boolean }) {
  const lines = article.cover;
  // Fit the longest line into the left 210px; bold Helvetica runs ~0.6em per character.
  const size = Math.min(36, Math.floor(210 / (Math.max(...lines.map(l => l.length)) * 0.6)));
  const top = 133 - (lines.length * (size + 2)) / 2 - 10;
  return (
    <svg viewBox="0 0 400 266" role="img" aria-label={article.title} className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="400" height="266" fill={BG} />
      <g transform={compact ? "translate(125 20) scale(1.25)" : "translate(246 44) scale(0.92)"}>
        <Drawing art={article.art} />
      </g>
      {!compact && (
        <g fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif" fill={K}>
          {lines.map((l, i) => (
            <text key={l} x="24" y={top + (i + 1) * (size + 2)} fontSize={size} fontWeight={800} letterSpacing="-0.5">{l}</text>
          ))}
          <g transform={`translate(26 ${top + lines.length * (size + 2) + 14}) rotate(-3)`}>
            <rect width={article.topic.length * 7.4 + 18} height="22" fill={Y} stroke={K} strokeWidth={1.5} />
            <text x="9" y="15.5" fontSize="12" fontWeight={700}>{article.topic}</text>
          </g>
        </g>
      )}
    </svg>
  );
}
