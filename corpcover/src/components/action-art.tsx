import { A, K, R, T, W, Y, line } from "./cover-art";

// Drawings for the three ways to start, in the same hand as the guide covers.

export type ActionArtKind = "review" | "finder" | "adviser";

export function ActionArt({ kind }: { kind: ActionArtKind }) {
  return (
    <svg viewBox="0 0 220 150" aria-hidden className="block h-full w-full">
      {kind === "review" && (
        <g>
          <g transform="rotate(-7 80 75)">
            <rect x="34" y="14" width="92" height="120" rx="6" fill={W} {...line} />
            <path d="M50 38 h56 M50 54 h44 M50 70 h52 M50 86 h36 M50 102 h48" fill="none" {...line} strokeWidth={3} />
            <path d="M110 52 l5 5 l10 -11" fill="none" stroke={T} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M108 84 l12 12 M120 84 l-12 12" fill="none" stroke={R} strokeWidth={4} strokeLinecap="round" />
          </g>
          <circle cx="160" cy="98" r="30" fill={T} {...line} />
          <path d="M160 112 V84 M148 95 l12 -12 l12 12" fill="none" stroke={W} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M186 40 l10 -6 M192 58 h12 M150 26 l4 -10" fill="none" {...line} strokeWidth={3} />
        </g>
      )}
      {kind === "finder" && (
        <g>
          <rect x="30" y="16" width="160" height="118" rx="12" fill={W} {...line} />
          <rect x="46" y="32" width="128" height="8" rx="4" fill="#ece6dc" />
          <rect x="46" y="32" width="58" height="8" rx="4" fill={T} />
          <rect x="46" y="54" width="58" height="26" rx="13" fill={Y} {...line} strokeWidth={2.5} />
          <path d="M60 67 l5 5 l10 -10" fill="none" stroke={K} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          <rect x="116" y="54" width="58" height="26" rx="13" fill={W} {...line} strokeWidth={2.5} />
          <rect x="46" y="90" width="58" height="26" rx="13" fill={W} {...line} strokeWidth={2.5} />
          <rect x="116" y="90" width="58" height="26" rx="13" fill={W} {...line} strokeWidth={2.5} />
          <path d="M150 112 l26 22 l-12 2 l6 12 l-7 3 l-6 -12 l-8 8 Z" fill={A} {...line} strokeWidth={2.5} />
        </g>
      )}
      {kind === "adviser" && (
        <g>
          <path d="M22 30 Q22 18 34 18 H120 Q132 18 132 30 V74 Q132 86 120 86 H58 L38 104 V86 H34 Q22 86 22 74 Z" fill={W} {...line} />
          <path d="M40 42 h72 M40 60 h50" fill="none" {...line} strokeWidth={3} />
          <path d="M198 66 Q198 54 186 54 H100 Q88 54 88 66 V106 Q88 118 100 118 H164 L184 136 V118 H186 Q198 118 198 106 Z" fill={T} {...line} />
          <circle cx="120" cy="86" r="5" fill={W} />
          <circle cx="143" cy="86" r="5" fill={W} />
          <circle cx="166" cy="86" r="5" fill={W} />
          <path d="M160 26 l8 -10 M176 34 l12 -4 M146 20 l-2 -12" fill="none" stroke={R} strokeWidth={3.5} strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
