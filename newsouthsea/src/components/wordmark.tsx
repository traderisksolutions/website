import { site } from "@/site";

/* The NSS mark system (locked 23 Oct 2026). One colour, NSS navy.
   Mark: NSS in tight serif capitals. Lockup: the navy block with the mark on its bottom edge and the
   long name, Chinese name and registered name beside it. Favicon: the N alone (src/app/icon.png). */

/** NSS, tight capitals. With `descriptor` the long name sits beside it in small capitals, J.P.Morgan style. */
export function Mark({ descriptor = false, className = "" }: { descriptor?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-3 ${className}`}>
      <span className="font-display text-[32px] font-semibold leading-none tracking-[-0.03em] text-ultra">NSS</span>
      {descriptor && <span className="hidden text-[11px] font-medium uppercase tracking-[0.16em] text-ink-2 sm:inline">{site.name}</span>}
    </span>
  );
}

/** Full lockup: block, long name, Chinese name, registered name. `stacked` puts the names under the block. */
export function Lockup({ stacked = false, onDark = false, className = "" }: { stacked?: boolean; onDark?: boolean; className?: string }) {
  const nameColor = onDark ? "text-white" : "text-ultra";
  return (
    <span className={`inline-flex ${stacked ? "flex-col items-start gap-5" : "items-center gap-6"} ${className}`}>
      <span className={`relative block h-[90px] w-[120px] shrink-0 ${onDark ? "bg-white" : "bg-ultra"}`} aria-hidden>
        <span className={`absolute bottom-[7px] left-[9px] font-display text-[30px] font-semibold leading-none tracking-[-0.02em] ${onDark ? "text-ultra" : "text-white"}`}>NSS</span>
      </span>
      <span className="flex flex-col gap-1">
        <span className={`font-display text-[24px] font-semibold leading-none tracking-[-0.01em] ${nameColor}`}>{site.name}</span>
        <span className={`font-cn text-[13px] leading-snug tracking-[0.08em] ${nameColor}`}>{site.nameZh}</span>
        <span className={`font-serif text-[13px] leading-snug ${onDark ? "text-white/60" : "text-bronze"}`}>{site.entity}</span>
      </span>
    </span>
  );
}
