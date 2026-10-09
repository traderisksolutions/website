"use client";

import { useState } from "react";
import { categories, categoryTone, perks, sgd, type Category } from "@/content";
import { PerkIcon } from "./perk-icon";

type Filter = "All" | Category;
const filters: Filter[] = ["All", ...categories];

/** Partner directory: segmented filter over a full-width table. Collapses columns on small screens. */
export function PerkTable() {
  const [filter, setFilter] = useState<Filter>("All");
  const rows = filter === "All" ? perks : perks.filter(p => p.category === filter);
  const total = rows.reduce((s, p) => s + p.value, 0);

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Filter perks by category" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-track p-1.5">
          {filters.map(f => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3 py-2 text-sm transition-colors sm:px-5 sm:text-[15px] ${filter === f ? "bg-paper text-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <table className="mt-10 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-rule text-[11px] uppercase tracking-[0.1em] text-ink-2">
            <th className="py-4 pr-4 font-medium">Perk</th>
            <th className="hidden py-4 pr-4 font-medium sm:table-cell">Offer</th>
            <th className="hidden py-4 pr-4 font-medium lg:table-cell">About</th>
            <th className="hidden py-4 pr-8 font-medium md:table-cell">Category</th>
            <th className="whitespace-nowrap py-4 text-right font-medium">Value / yr</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.name} className="border-b border-rule align-middle">
              <td className="py-5 pr-4 sm:py-7">
                <div className="flex items-center gap-3.5">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${categoryTone[p.category]}`}>
                    <PerkIcon name={p.icon} className="size-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[17px]">
                      {p.partner ?? p.name}
                      {p.isNew && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">New</span>}
                    </div>
                    <div className="mt-0.5 text-[15px] text-ink-2 sm:hidden">{p.offer}</div>
                  </div>
                </div>
              </td>
              <td className="hidden py-7 pr-4 text-[17px] sm:table-cell">{p.offer}</td>
              <td className="hidden py-7 pr-4 text-[17px] text-ink-2 lg:table-cell">{p.about}</td>
              <td className="hidden py-7 pr-8 text-[17px] md:table-cell">{p.category}</td>
              <td className="py-5 text-right text-[17px] tabular-nums sm:py-7">{sgd(p.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-[15px]">
            <td className="py-5 pr-4 text-ink-2">{rows.length} perks</td>
            <td className="hidden sm:table-cell" />
            <td className="hidden lg:table-cell" />
            <td className="hidden md:table-cell" />
            <td className="py-5 text-right font-semibold tabular-nums">{sgd(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
