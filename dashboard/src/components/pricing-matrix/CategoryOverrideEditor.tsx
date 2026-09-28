'use client'

import type { AvailableCalculator, CensusMember, CategoryOverrides } from '@/lib/pm-quote'
import { Tip } from '@/components/Tip'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const ctl = 'h-9 rounded-[8px] border border-[#dadce0] bg-white px-2.5 text-[13px] text-[#202124] outline-none focus:border-[#202124]'

/** Optional, per-employee-category plan-tier overrides — only shown when the census actually has
 *  employee categories set, and only for coverage lines you explicitly touch here; anything left
 *  blank keeps pricing exactly as the default plan selection above (PlanSelectionEditor). Same
 *  controlled-dropdown row layout as PlanSelectionEditor, one block per category. */
export function CategoryOverrideEditor({ avail, selected, census, overrides, setOverride }: {
  avail: AvailableCalculator[]
  selected: Record<string, boolean>
  census: CensusMember[]
  overrides: Record<string, CategoryOverrides>
  setOverride: (calcId: string, category: string, code: string, field: string, value: string) => void
}) {
  const categories = Array.from(new Set(census.map(m => m.employee_category).filter((c): c is string => !!c)))
  const selectedAvail = avail.filter(a => selected[a.id])
  if (categories.length === 0 || selectedAvail.length === 0) return null

  return (
    <div className="rounded-[16px] bg-white p-5 flex flex-col gap-4" style={{ border: `1px solid ${RULE}` }}>
      <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em] leading-tight flex items-center" style={{ color: INK }}>
        Plan tiers by employee category
        <Tip text="Optional. A blank field keeps the default plan selected above." />
      </h2>
      {categories.map(category => (
        <div key={category} className="flex flex-col gap-2.5">
          <span className="text-[14px] font-medium" style={{ color: INK }}>{category}</span>
          {selectedAvail.map(a => (
            <div key={a.id} className="pl-4 flex flex-col gap-2">
              <span className="text-[12.5px]" style={{ color: MUTED }}>{a.insurer_name}</span>
              {a.coverage_lines.map(l => (
                <div key={l.code} className="flex items-center gap-3 flex-wrap text-[13.5px] pl-3">
                  <span className="w-44" style={{ color: '#3c4043' }}>{l.label}</span>
                  {l.fields.map(f => {
                    const opts = a.dropdowns[`${l.code}.${f}`]
                    const val = overrides[a.id]?.[category]?.[l.code]?.[f] ?? ''
                    return (
                      <label key={f} className="flex items-center gap-1.5">
                        <span className="text-[12.5px]" style={{ color: MUTED }}>{f}</span>
                        {opts?.length
                          ? <select value={val} onChange={e => setOverride(a.id, category, l.code, f, e.target.value)} className={ctl}><option value="">Default</option>{opts.map(o => <option key={o}>{o}</option>)}</select>
                          : <input value={val} onChange={e => setOverride(a.id, category, l.code, f, e.target.value)} placeholder="Default" className={`${ctl} w-28`} />}
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
