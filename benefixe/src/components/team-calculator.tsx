"use client";

import { useState } from "react";
import { pass, sgd } from "@/content";

/** Retail value of the perks a team receives on a group plan. Numbers only. */
export function TeamCalculator() {
  const [size, setSize] = useState(25);
  return (
    <div className="rounded-[28px] bg-ink p-6 text-white sm:p-10">
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="w-full max-w-md">
          <label htmlFor="team-size" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Team size</label>
          <div className="mt-2 font-display text-5xl font-bold tabular-nums tracking-[-0.03em]">{size} <span className="text-2xl font-medium text-white/60">employees</span></div>
          <input id="team-size" type="range" min={3} max={200} value={size} onChange={e => setSize(Number(e.target.value))}
            className="range mt-6 w-full" aria-valuetext={`${size} employees`} />
          <div className="mt-2 flex justify-between text-xs text-white/50"><span>3</span><span>200</span></div>
        </div>
        <dl className="grid grid-cols-2 gap-6 md:min-w-[360px]">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Perks value / yr</dt>
            <dd className="mt-2 font-display text-3xl font-bold tabular-nums tracking-[-0.02em] text-accent-soft sm:text-4xl">{sgd(size * pass.totalValue)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Pass cost to employer</dt>
            <dd className="mt-2 font-display text-3xl font-bold tabular-nums tracking-[-0.02em] sm:text-4xl">S$0</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
