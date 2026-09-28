'use client'

import { Wand2 } from 'lucide-react'
import type { AvailableCalculator, Selection } from '@/lib/pm-quote'
import { Empty } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const ctl = 'h-9 rounded-[8px] border border-[#dadce0] bg-white px-2.5 text-[13px] text-[#202124] outline-none focus:border-[#202124]'

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
    return <Empty>No approved calculators yet. Add and approve an insurer calculator first.</Empty>
  }
  return (
    <>
      {avail.map(a => {
        const on = !!selected[a.id]
        return (
          <div key={a.id} className="rounded-[16px] bg-white p-5" style={{ border: `1px solid ${on ? INK : RULE}` }}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={on} onChange={() => toggleInsurer(a)} className="w-4 h-4 accent-[#202124]" />
              <span className="text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>{a.insurer_name}</span>
              <span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>v{a.version}{a.effective_date ? ` · effective ${a.effective_date}` : ''}</span>
            </label>
            {on && (
              <div className="mt-4 pl-7 flex flex-col gap-3">
                {a.coverage_lines.map(l => (
                  <div key={l.code} className="flex flex-col gap-1">
                    <div className="flex items-center gap-3 flex-wrap text-[13.5px]">
                      <span className="w-44" style={{ color: '#3c4043' }}>{l.label}</span>
                      {l.fields.map(f => {
                        const opts = a.dropdowns[`${l.code}.${f}`]
                        const val = selections[a.id]?.[l.code]?.[f] ?? ''
                        return (
                          <label key={f} className="flex items-center gap-1.5">
                            <span className="text-[12.5px]" style={{ color: MUTED }}>{f}</span>
                            {opts?.length
                              ? <select value={val} onChange={e => setSel(a.id, l.code, f, e.target.value)} className={ctl}><option value="">—</option>{opts.map(o => <option key={o}>{o}</option>)}</select>
                              : <input value={val} onChange={e => setSel(a.id, l.code, f, e.target.value)} className={`${ctl} w-24`} />}
                          </label>
                        )
                      })}
                    </div>
                    {matchNotes[`${a.id}.${l.code}`] && <p className="m-0 text-[12.5px] pl-44 flex items-center gap-1.5" style={{ color: MUTED }}><Wand2 size={11} className="shrink-0" /> {matchNotes[`${a.id}.${l.code}`]}</p>}
                  </div>
                ))}
                <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Applied to all {namedCount} lives. Dependants are priced on their own age.</p>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
