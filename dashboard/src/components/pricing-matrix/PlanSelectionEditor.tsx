'use client'

import { Wand2 } from 'lucide-react'
import type { AvailableCalculator, Selection } from '@/lib/pm-quote'

/** Per-insurer plan-selection checkboxes + coverage dropdowns — shared by the "New quote" wizard
 *  and editing an already-saved quote's plan tiers. Purely controlled: all state lives with the
 *  caller so both the wizard and the edit view can drive a live recompute (pm-calc.ts) off it. */
export function PlanSelectionEditor({ avail, selected, selections, toggleInsurer, setSel, namedCount, matchNotes = {} }: {
  avail: AvailableCalculator[]
  selected: Record<string, boolean>
  selections: Record<string, Selection>
  toggleInsurer: (a: AvailableCalculator) => void
  setSel: (calcId: string, code: string, field: string, value: string) => void
  namedCount: number
  matchNotes?: Record<string, string>
}) {
  if (avail.length === 0) {
    return <p className="text-[13px] text-muted-foreground py-8 text-center border border-dashed border-border rounded-xl">No approved calculators yet. Add + approve an insurer calculator first.</p>
  }
  return (
    <>
      {avail.map(a => (
        <div key={a.id} className={`border rounded-xl p-3 ${selected[a.id] ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!selected[a.id]} onChange={() => toggleInsurer(a)} className="accent-primary" />
            <span className="text-[13.5px] font-semibold">{a.insurer_name}</span>
            <span className="text-[11px] text-muted-foreground/50">v{a.version}{a.effective_date ? ` · eff. ${a.effective_date}` : ''}</span>
          </label>
          {selected[a.id] && (
            <div className="mt-2.5 pl-6 flex flex-col gap-2">
              {a.coverage_lines.map(l => (
                <div key={l.code} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
                    <span className="w-40 text-muted-foreground/80">{l.label}</span>
                    {l.fields.map(f => {
                      const opts = a.dropdowns[`${l.code}.${f}`]
                      const val = selections[a.id]?.[l.code]?.[f] ?? ''
                      return (
                        <label key={f} className="flex items-center gap-1">
                          <span className="text-muted-foreground/50">{f}</span>
                          {opts?.length
                            ? <select value={val} onChange={e => setSel(a.id, l.code, f, e.target.value)} className="text-[11px] border border-border rounded px-1 py-0.5 bg-background"><option value="">—</option>{opts.map(o => <option key={o}>{o}</option>)}</select>
                            : <input value={val} onChange={e => setSel(a.id, l.code, f, e.target.value)} className="w-20 text-[11px] border border-border rounded px-1 py-0.5 bg-background" />}
                        </label>
                      )
                    })}
                  </div>
                  {matchNotes[`${a.id}.${l.code}`] && <p className="text-[10.5px] text-primary/70 pl-40 flex items-center gap-1"><Wand2 size={10} className="shrink-0" /> {matchNotes[`${a.id}.${l.code}`]}</p>}
                </div>
              ))}
              <p className="text-[10.5px] text-muted-foreground/40">Applied to all {namedCount} lives (dependants priced on their own age).</p>
            </div>
          )}
        </div>
      ))}
    </>
  )
}
