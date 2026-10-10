"use client";

import { useEffect, useState } from "react";
import { categories, perks, sgd, type Category } from "@/content";
import { PerkIcon } from "./perk-icon";

type Filter = "All" | Category;
const filters: Filter[] = ["All", ...categories];
const fromHash = (h: string): Filter => filters.find(f => f.toLowerCase() === h.replace("#", "").toLowerCase()) ?? "All";

/** Perk directory: segmented filter over a full-width table. #travel etc. preselects a category. */
export function PerkTable() {
  const [filter, setFilter] = useState<Filter>("All");
  useEffect(() => {
    const sync = () => setFilter(fromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const choose = (f: Filter) => {
    setFilter(f);
    history.replaceState(null, "", f === "All" ? window.location.pathname : `#${f.toLowerCase()}`);
  };
  const rows = filter === "All" ? perks : perks.filter(p => p.category === filter);
  const total = rows.reduce((s, p) => s + p.value, 0);

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Filter perks by category" className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-ink/5 p-1">
          {filters.map(f => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => choose(f)}
              className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors sm:px-4 ${filter === f ? "bg-paper text-ink shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_rgba(10,10,10,.04)]" : "text-ink-2 hover:text-ink"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <table className="mt-10 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-rule">
            <th className="mono-label py-3 pr-4 font-normal">Perk</th>
            <th className="mono-label hidden py-3 pr-4 font-normal sm:table-cell">Offer</th>
            <th className="mono-label hidden py-3 pr-4 font-normal lg:table-cell">About</th>
            <th className="mono-label hidden py-3 pr-8 font-normal md:table-cell">Category</th>
            <th className="mono-label whitespace-nowrap py-3 text-right font-normal">Value / yr</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.name} className="border-b border-rule align-middle transition-colors hover:bg-surface/60">
              <td className="py-4 pr-4 sm:py-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-ink"><PerkIcon name={p.icon} className="size-4" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                      {p.partner ?? p.name}
                      {p.isNew && <span className="rounded-full border border-rule px-1.5 py-px font-mono text-[10px] uppercase text-accent">New</span>}
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink-2 sm:hidden">{p.offer}</div>
                  </div>
                </div>
              </td>
              <td className="hidden py-5 pr-4 text-[15px] sm:table-cell">{p.offer}</td>
              <td className="hidden py-5 pr-4 text-[15px] text-ink-2 lg:table-cell">{p.about}</td>
              <td className="hidden py-5 pr-8 text-[15px] text-ink-2 md:table-cell">{p.category}</td>
              <td className="py-4 text-right font-mono text-[14px] tabular-nums sm:py-5">{sgd(p.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-[13px]">
            <td className="py-4 pr-4 text-ink-2">{rows.length} perks</td>
            <td className="hidden sm:table-cell" />
            <td className="hidden lg:table-cell" />
            <td className="hidden md:table-cell" />
            <td className="py-4 text-right font-mono text-[14px] font-medium tabular-nums">{sgd(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
