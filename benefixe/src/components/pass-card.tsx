import { perks } from "@/content";
import { PerkIcon } from "./perk-icon";

/** The membership card. Two stacked cards, tilted, so the hero reads as a thing you hold. */
export function PassCard() {
  const chips = perks.filter(p => p.featured).slice(0, 6);
  return (
    <div className="relative mx-auto aspect-[1.58] w-full max-w-[460px]">
      <div aria-hidden className="absolute inset-0 translate-x-5 translate-y-3 rotate-[7deg] rounded-[28px] bg-tile-lilac" />
      <div className="pass-card relative flex h-full -rotate-[4deg] flex-col justify-between rounded-[28px] p-6 text-white sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display text-xl font-bold tracking-[-0.03em]">benefixe.</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">Insider Pass</div>
          </div>
          <div className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] backdrop-blur">Member</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map(p => (
            <span key={p.name} className="grid size-9 place-items-center rounded-xl bg-white/18 backdrop-blur" title={p.name}>
              <PerkIcon name={p.icon} className="size-[18px]" />
            </span>
          ))}
          <span className="grid h-9 place-items-center rounded-xl bg-white/18 px-2.5 text-xs font-semibold backdrop-blur">+{perks.length - chips.length}</span>
        </div>
        <div className="flex items-end justify-between text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/70">Member name</div>
            <div className="font-medium">Your name here</div>
          </div>
          <div className="text-right font-mono text-xs text-white/80">No. 0001 · 2027</div>
        </div>
      </div>
    </div>
  );
}
