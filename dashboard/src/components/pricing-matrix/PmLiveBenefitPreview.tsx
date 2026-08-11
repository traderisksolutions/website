'use client'

import { Fragment } from 'react'
import { UNCONFIRMED_TAG } from '@/lib/pm-compare'
import type { CompareRow } from '@/lib/pm-compare'

/** Live benefit-schedule preview for the quote wizard — takes already-aligned rows (from
 *  alignSelectedTerms, scoped to the plan tiers currently toggled) and renders them grouped by
 *  category, same visual language as PmCompareTable but without its "only differences" toggle —
 *  here we always want to see what the currently selected tiers actually cover. */
export function PmLiveBenefitPreview({ rows, insurers }: { rows: CompareRow[]; insurers: { calculator_id: string; insurer_name: string }[] }) {
  const byCategory = new Map<string, CompareRow[]>()
  for (const r of rows) { const k = r.canonical_category || r.category || '—'; (byCategory.get(k) ?? byCategory.set(k, []).get(k)!).push(r) }
  const anyUnconfirmed = rows.some(r => Object.values(r.per_insurer).some(v => v.startsWith(UNCONFIRMED_TAG)))

  if (insurers.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      {anyUnconfirmed && (
        <p className="text-[11px] text-amber-700/80">Amber = couldn&rsquo;t confirm this value belongs to the selected plan tier — shown anyway rather than hidden, worth a second look.</p>
      )}
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left py-2.5 px-3 font-semibold text-foreground/80 w-[26%]">Benefit</th>
              {insurers.map(ins => <th key={ins.calculator_id} className="text-left py-2.5 px-3 font-semibold text-foreground/80">{ins.insurer_name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={insurers.length + 1} className="py-8 text-center text-muted-foreground/60 text-[12.5px]">
                No coverage terms extracted for these insurers&rsquo; selected plans yet.
              </td></tr>
            ) : Array.from(byCategory.entries()).map(([cat, catRows]) => (
              <Fragment key={cat}>
                <tr className="bg-slate-50/70">
                  <td colSpan={insurers.length + 1} className="py-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{cat}</td>
                </tr>
                {catRows.map(r => (
                  <tr key={r.key} className="border-b border-border/40">
                    <td className="py-2 px-3 text-foreground/80">{r.label}</td>
                    {insurers.map(ins => {
                      const v = r.per_insurer[ins.calculator_id]
                      const unconfirmed = v?.startsWith(UNCONFIRMED_TAG)
                      return (
                        <td key={ins.calculator_id} className={`py-2 px-3 ${unconfirmed ? 'text-amber-700 bg-amber-50/60' : 'text-muted-foreground/90'}`}
                          title={unconfirmed ? 'Could not confirm this value belongs to the selected plan tier' : undefined}>
                          {v ? (unconfirmed ? v.slice(UNCONFIRMED_TAG.length) : v) : <span className="text-muted-foreground/30">not stated</span>}
                        </td>
                      )
                    })}
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
