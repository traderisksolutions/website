"use client";

import { useState } from "react";
import { pass, sgd } from "@/content";

/** Retail value of the perks a team receives on a group plan. Numbers only. */
export function TeamCalculator() {
  const [size, setSize] = useState(25);
  return (
    <div className="grain overflow-hidden rounded-[18px] bg-night p-6 text-white sm:p-10">
      <div className="grid gap-10 md:grid-cols-2 md:items-end">
        <div>
          <label htmlFor="team-size" className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/45">Team size</label>
          <div className="mt-3 text-5xl font-medium tabular-nums tracking-[-0.03em]">{size} <span className="text-xl text-white/45">employees</span></div>
          <input id="team-size" type="range" min={3} max={200} value={size} onChange={e => setSize(Number(e.target.value))}
            className="range mt-7 w-full" aria-valuetext={`${size} employees`} />
          <div className="mt-2 flex justify-between font-mono text-[11px] text-white/35"><span>3</span><span>200</span></div>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-white/12 border-t border-white/12 pt-6 md:border-0 md:pt-0">
          <div className="pr-6">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/45">Perks value / yr</dt>
            <dd className="mt-3 text-3xl font-medium tabular-nums tracking-[-0.02em] text-[#ff9a62] sm:text-4xl">{sgd(size * pass.totalValue)}</dd>
          </div>
          <div className="pl-6">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/45">Pass cost to employer</dt>
            <dd className="mt-3 text-3xl font-medium tabular-nums tracking-[-0.02em] sm:text-4xl">S$0</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
