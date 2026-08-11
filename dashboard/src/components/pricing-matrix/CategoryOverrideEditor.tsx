'use client'

import type { AvailableCalculator, CensusMember, CategoryOverrides } from '@/lib/pm-quote'

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
    <div className="border border-border rounded-xl p-3 flex flex-col gap-3">
      <div>
        <h2 className="text-[12.5px] font-semibold text-foreground/80">Plan-tier overrides by employee category <span className="font-normal text-muted-foreground/50">(optional — anything left blank uses the default plan above)</span></h2>
      </div>
      {categories.map(category => (
        <div key={category} className="flex flex-col gap-2 pl-1">
          <span className="text-[11.5px] font-semibold text-foreground/70">{category}</span>
          {selectedAvail.map(a => (
            <div key={a.id} className="pl-3 flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground/70">{a.insurer_name}</span>
              {a.coverage_lines.map(l => (
                <div key={l.code} className="flex items-center gap-2 flex-wrap text-[11.5px] pl-2">
                  <span className="w-40 text-muted-foreground/70">{l.label}</span>
                  {l.fields.map(f => {
                    const opts = a.dropdowns[`${l.code}.${f}`]
                    const val = overrides[a.id]?.[category]?.[l.code]?.[f] ?? ''
                    return (
                      <label key={f} className="flex items-center gap-1">
                        <span className="text-muted-foreground/50">{f}</span>
                        {opts?.length
                          ? <select value={val} onChange={e => setOverride(a.id, category, l.code, f, e.target.value)} className="text-[11px] border border-border rounded px-1 py-0.5 bg-background"><option value="">uses default</option>{opts.map(o => <option key={o}>{o}</option>)}</select>
                          : <input value={val} onChange={e => setOverride(a.id, category, l.code, f, e.target.value)} placeholder="uses default" className="w-24 text-[11px] border border-border rounded px-1 py-0.5 bg-background" />}
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
