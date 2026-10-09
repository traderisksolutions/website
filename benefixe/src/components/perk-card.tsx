import { categoryTone, sgd, type Perk } from "@/content";
import { PerkIcon } from "./perk-icon";

export function PerkCard({ perk }: { perk: Perk }) {
  return (
    <article className="perk-card flex flex-col gap-4 rounded-3xl border border-rule bg-paper p-5">
      <div className="flex items-start justify-between">
        <span className={`grid size-12 place-items-center rounded-2xl text-ink ${categoryTone[perk.category]}`}>
          <PerkIcon name={perk.icon} className="size-6" />
        </span>
        {perk.isNew && <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">New</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="text-[17px] font-semibold">{perk.partner ?? perk.name}</h3>
        <p className="text-[15px] leading-snug text-ink-2">{perk.offer}</p>
      </div>
      <div className="flex items-center justify-between border-t border-rule pt-3 text-sm">
        <span className="text-ink-3">{perk.category}</span>
        <span className="font-semibold tabular-nums">{sgd(perk.value)} / yr</span>
      </div>
    </article>
  );
}
