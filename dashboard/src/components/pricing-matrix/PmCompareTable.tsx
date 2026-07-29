'use client'

import { Fragment, useMemo, useState } from 'react'
import { alignTerms, differingRows } from '@/lib/pm-compare'
import type { CompareInsurer } from '@/lib/pm-compare'

/** Level 2 — side-by-side coverage/wordings comparison across insurers, grouped by normalised
 *  (category, label) so each insurer's own terms line up under one row per benefit. */
export function PmCompareTable({ insurers }: { insurers: CompareInsurer[] }) {
  const [onlyDiff, setOnlyDiff] = useState(true)
  const ids = insurers.map(i => i.calculator_id)
  const allRows = useMemo(() => alignTerms(insurers), [insurers])
  const rows = useMemo(() => (onlyDiff ? differingRows(allRows, ids) : allRows), [allRows, onlyDiff, ids])

  const byCategory = new Map<string, typeof rows>()
  for (const r of rows) { const k = r.category || '—'; (byCategory.get(k) ?? byCategory.set(k, []).get(k)!).push(r) }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground self-end">
        <input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} className="accent-primary" />
        Show only where insurers differ
      </label>

      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left py-2.5 px-3 font-semibold text-foreground/80 w-[26%]">Coverage term</th>
              {insurers.map(ins => <th key={ins.calculator_id} className="text-left py-2.5 px-3 font-semibold text-foreground/80">{ins.insurer_name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={insurers.length + 1} className="py-8 text-center text-muted-foreground/60 text-[12.5px]">
                {allRows.length === 0 ? 'No coverage terms extracted for these insurers yet.' : 'No differences found across the selected insurers.'}
              </td></tr>
            ) : Array.from(byCategory.entries()).map(([cat, catRows]) => (
              <Fragment key={cat}>
                <tr className="bg-slate-50/70">
                  <td colSpan={insurers.length + 1} className="py-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{cat}</td>
                </tr>
                {catRows.map(r => (
                  <tr key={r.key} className="border-b border-border/40">
                    <td className="py-2 px-3 text-foreground/80">{r.label}</td>
                    {insurers.map(ins => (
                      <td key={ins.calculator_id} className="py-2 px-3 text-muted-foreground/90">
                        {r.per_insurer[ins.calculator_id] ?? <span className="text-muted-foreground/30">not stated</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
