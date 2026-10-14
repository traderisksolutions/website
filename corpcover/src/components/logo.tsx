// The Rails mark: two Cs drawn in three parallel lines, the right one laid over the left.
// The overlap is cut with a mask, so the mark sits on any ground. Each instance needs its own id.

const C = (cx: number, r: number, tail: number) => `M${tail} ${50 - r}H${cx}A${r} ${r} 0 0 0 ${cx} ${50 + r}H${tail}`;
const RADII = [27, 20, 13];

export function RailsMark({ id, tone = "steel", className = "h-[24px] w-auto" }: { id: string; tone?: "steel" | "white"; className?: string }) {
  const stroke = tone === "white" ? "#ffffff" : `url(#${id}-g)`;
  return (
    <svg viewBox="6 20 91 60" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7d9cbb" />
          <stop offset="1" stopColor="#3f5f7f" />
        </linearGradient>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" />
          {RADII.map(r => <path key={r} d={C(58, r, 97)} fill="none" stroke="#000" strokeWidth="9" />)}
        </mask>
      </defs>
      <g fill="none" stroke={stroke} strokeWidth="3.2">
        <g mask={`url(#${id}-m)`}>{RADII.map(r => <path key={r} d={C(36, r, 92)} />)}</g>
        {RADII.map(r => <path key={r} d={C(58, r, 94)} />)}
      </g>
    </svg>
  );
}

/** Mark and name, as used in the navbar, drawer and footer. */
export function Logo({ id, tone = "steel", name }: { id: string; tone?: "steel" | "white"; name: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <RailsMark id={id} tone={tone} />
      <span>{name}</span>
    </span>
  );
}
