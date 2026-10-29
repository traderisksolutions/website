/* Depth contours: the NSS signature graphic (brand locked 30 Oct 2026).
   Hairline chart soundings, low contrast, placed at the edges of a block and masked away from text.
   Paths are generated once at build time from fixed seeds, so every render is identical. */

type Island = { x: number; y: number; rings: number; base: number; step: number; seed: number; sx?: number };

const W = 1200;
const H = 800;

function ring(cx: number, cy: number, r0: number, k: number, seed: number, sx: number) {
  let d = "";
  for (let i = 0; i <= 360; i += 4) {
    const t = (i * Math.PI) / 180;
    const r = r0 * (1 + 0.13 * Math.sin(3 * t + seed + k * 0.22) + 0.07 * Math.sin(5 * t + 1.3 + k * 0.15) + 0.04 * Math.sin(9 * t + seed * 2));
    d += `${i ? "L" : "M"}${(cx + r * Math.cos(t) * sx).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
  }
  return d + "Z";
}

function paths(islands: Island[]) {
  return islands.flatMap(({ x, y, rings, base, step, seed, sx = 1 }) =>
    Array.from({ length: rings }, (_, k) => ring(x * W, y * H, base + k * step, k, seed, sx)),
  );
}

/** Named placements. Each fixes where the soundings sit and which mask keeps them clear of text. */
const PRESETS = {
  /** Top-right corner of a dark panel or band. */
  corner: [{ x: 0.98, y: 0.04, rings: 22, base: 14, step: 22, seed: 0.6 }],
  /** Both sides of a centred block; the middle stays clear. */
  sides: [
    { x: 0.04, y: 0.9, rings: 16, base: 20, step: 22, seed: 2.1 },
    { x: 0.97, y: 0.12, rings: 18, base: 16, step: 22, seed: 0.9 },
  ],
  /** Bottom-right corner, used on paper bands and the footer. */
  low: [{ x: 1.0, y: 1.02, rings: 20, base: 18, step: 24, seed: 1.4, sx: 1.3 }],
} satisfies Record<string, Island[]>;

const CACHE = Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, paths(v)])) as Record<keyof typeof PRESETS, string[]>;

export function Contours({ at = "corner", tone = "dark" }: { at?: keyof typeof PRESETS; tone?: "dark" | "navy" | "paper" }) {
  return (
    <svg className={`contours at-${at} tone-${tone}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {CACHE[at].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
