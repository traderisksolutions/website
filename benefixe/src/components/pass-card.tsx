import { perks } from "@/content";
import { PerkIcon } from "./perk-icon";

/** The membership card: frosted glass over the ember gradient, framed with crop marks. */
export function PassFrame({ className = "" }: { className?: string }) {
  return (
    <div className={`crop ${className}`}>
      <i /><i /><i /><i />
      <div className="ember grid h-full place-items-center rounded-[4px] p-6 sm:p-10">
        <PassCard />
      </div>
    </div>
  );
}

export function PassCard() {
  const chips = perks.filter(p => p.featured).slice(0, 5);
  return (
    <div className="flex aspect-[1.586] w-full max-w-[400px] flex-col justify-between rounded-[18px] bg-[#0b0b0b]/85 p-5 text-white shadow-[0_40px_70px_-25px_rgba(40,8,0,.75)] ring-1 ring-white/15 backdrop-blur-xl sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.02em]">benefixe</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#ff9a62]">Insider Pass</div>
        </div>
        <svg viewBox="0 0 28 20" className="h-5 w-7 text-white/80" aria-hidden><rect x=".5" y=".5" width="27" height="19" rx="4" fill="none" stroke="currentColor" /><path d="M9 .5v19M19 .5v19M.5 10h27" stroke="currentColor" opacity=".6" /></svg>
      </div>
      <div className="flex gap-1.5">
        {chips.map(p => (
          <span key={p.name} className="grid size-8 place-items-center rounded-lg bg-white/8 ring-1 ring-white/12" title={p.name}>
            <PerkIcon name={p.icon} className="size-4" />
          </span>
        ))}
        <span className="grid h-8 place-items-center rounded-lg bg-white/8 px-2 font-mono text-[11px] ring-1 ring-white/20">+{perks.length - chips.length}</span>
      </div>
      <div className="flex items-end justify-between font-mono text-[11px] text-white/55">
        <span>MEMBER · 0001</span>
        <span>VALID 2027</span>
      </div>
    </div>
  );
}
