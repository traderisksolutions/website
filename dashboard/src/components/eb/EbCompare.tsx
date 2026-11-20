'use client'

/**
 * Step 3 · Compare (Jarod's approved design, 20 Nov 2026): one column per product, per insurer
 * schedule and per copy; Current first, blank unless a premium or debit note was read (call note
 * 23). Every cover has a plan list per column and category, every plan priced by code; changing a
 * plan changes the cover premium and the total. The copy icon adds an independent copy at the far
 * right; a copy has × and shows its difference from the original in Total a year. A red chip marks
 * a census category with no same plan at that product, or a plan with no rate for these ages
 * (call note 1). The model is src/lib/gb/eb-compare.ts.
 */
import { useEffect, useRef } from 'react'
import { CopyPlus, X } from 'lucide-react'
import { Chip } from '@/components/crm/primitives'
import { CompareTable, CTd, CTh } from '@/components/ui/compare-table'
import { IconBtn } from '@/components/ui/icon-button'
import { SelectBox } from '@/components/ui/select-box'
import type { CoverKey } from '@/lib/gb/eb-quote'
import type { CompareModel, PlanCell, ScheduleCell } from '@/lib/gb/eb-compare'
import { fmtMoney0, fmtSigned } from './eb-format'

const STATUS_TONE = { read: 'neutral', check: 'amber', missing: 'red' } as const

export function EbCompare({ model, onChoose, onCopy, onRemove }: {
  model: CompareModel
  onChoose: (colId: string, category: string, key: CoverKey, plan: string) => void
  onCopy: (colId: string) => void
  onRemove: (colId: string) => void
}) {
  const multi = model.categories.length > 1
  const count = useRef(model.columns.length)
  useEffect(() => {
    // A copy lands at the far right: bring it into view.
    if (model.columns.length > count.current) {
      const wrap = document.querySelector('table[aria-label="Compare"]')?.parentElement
      try { wrap?.scrollTo({ left: wrap.scrollWidth, behavior: 'smooth' }) } catch { /* old browsers */ }
    }
    count.current = model.columns.length
  }, [model.columns.length])

  const planCell = (cell: PlanCell, colLabel: string, colId: string, key: CoverKey, rowLabel: string) => {
    if (cell.perCategory.every(x => !x.options.length)) return <span className="text-xs text-trs-muted">Not offered</span>
    const chosen = cell.perCategory.filter(x => x.plan)
    const price = cell.premium != null ? (chosen.length && chosen.every(x => x.locked && x.premium === 0) ? 'In hospital premium' : fmtMoney0(cell.premium)) : chosen.length ? 'Not priced' : '—'
    return (
      <div className="flex flex-col items-center gap-1.5">
        {cell.perCategory.map(x => (
          <div key={x.category} className="flex w-full flex-col items-center gap-0.5">
            {multi && <span className="text-xs text-trs-muted">{x.category}</span>}
            {/* A cover the plan rules set with the hospital plan (Income, AIA, Steadfast major medical) follows it: shown, not chosen. */}
            <SelectBox label={`${colLabel}, ${rowLabel}${multi ? `, ${x.category}` : ''}`} value={x.plan} changed={x.reason === 'changed'} disabled={x.locked}
              onChange={v => onChoose(colId, x.category, key, v)} className="max-w-48"
              options={[...(x.locked && x.plan ? [] : [{ value: '', label: 'None' }]), ...x.options.map(o => ({ value: o.plan, label: o.plan }))]} />
            {x.plan && x.premium == null && <Chip tone="red" title="No rate in the house workbook for this plan and these lives">Not priced</Chip>}
            {x.plan && x.premium != null && x.unpriced > 0 && <Chip tone="amber" title="Occupation class missing, or an age outside every rate band">{`${x.unpriced} not priced`}</Chip>}
            {x.reason && x.reason !== 'changed' && x.reason !== 'none' && <Chip tone={x.reason === 'no same plan' ? 'red' : 'neutral'}>{x.reason}</Chip>}
          </div>
        ))}
        <span className="text-xs text-trs-ink-2">{price}</span>
      </div>
    )
  }
  const scheduleCell = (cell: ScheduleCell) => cell.status == null
    ? <span className="text-xs text-trs-muted">Not in the schedule</span>
    : (
      <div className="flex flex-col items-center gap-1" title={cell.sources.join('\n')}>
        <span className="text-sm">{cell.premium != null ? fmtMoney0(cell.premium) : '—'}</span>
        <Chip tone={STATUS_TONE[cell.status]}>{cell.status}</Chip>
      </div>
    )

  return (
    <CompareTable label="Compare">
      <thead>
        <tr>
          <CTh first>Cover</CTh>
          <CTh>
            <div className="flex flex-col items-center gap-1"><span>Current</span><span className="text-xs font-normal text-trs-muted">{model.current.total != null ? 'Last year’s policy' : 'Not on file'}</span></div>
          </CTh>
          {model.columns.map(c => (
            <CTh key={c.id} tone={c.kind === 'copy' ? 'copy' : undefined}>
              <div className="flex flex-col items-center gap-1">
                <span className="text-trs-ink">{c.label}</span>
                <span className="text-xs font-normal text-trs-muted">{c.source}</span>
                {c.flags > 0 && <Chip tone="red">{`No same plan on ${c.flags} ${c.flags === 1 ? 'cover' : 'covers'}`}</Chip>}
                {c.warnings.map(w => <Chip key={w} tone="amber" className="whitespace-normal">{w}</Chip>)}
                {c.kind !== 'schedule' && (
                  <span className="inline-flex gap-1">
                    <IconBtn label={`Copy ${c.label} as a new column on the right`} onClick={() => onCopy(c.id)}><CopyPlus size={16} aria-hidden /></IconBtn>
                    {c.kind === 'copy' && <IconBtn label={`Remove ${c.label}`} onClick={() => onRemove(c.id)}><X size={14} aria-hidden /></IconBtn>}
                  </span>
                )}
              </div>
            </CTh>
          ))}
        </tr>
      </thead>
      <tbody>
        {model.rows.map(r => (
          <tr key={r.key}>
            <CTd first>{r.label}</CTd>
            <CTd>{fmtMoney0(r.current)}</CTd>
            {r.cells.map((cell, i) => {
              const col = model.columns[i]
              return <CTd key={col.id} tone={col.kind === 'copy' ? 'copy' : undefined} className="py-2">{cell.kind === 'plans' ? planCell(cell, col.label, col.id, r.key, r.label) : scheduleCell(cell)}</CTd>
            })}
          </tr>
        ))}
        <tr className="row-total">
          <CTd first>Total a year</CTd>
          <CTd>{fmtMoney0(model.current.total)}</CTd>
          {model.columns.map(c => (
            <CTd key={c.id} tone={c.kind === 'copy' ? 'copy' : undefined}>
              <div className="flex flex-col items-center">
                <span>{fmtMoney0(c.total)}</span>
                {c.vsOriginal != null && Math.round(c.vsOriginal) !== 0 && <span className="text-xs font-semibold">{`${fmtSigned(c.vsOriginal)} vs original`}</span>}
              </div>
            </CTd>
          ))}
        </tr>
        <tr>
          <CTd first>Per employee</CTd>
          <CTd>{fmtMoney0(model.current.perEmployee)}</CTd>
          {model.columns.map(c => <CTd key={c.id} tone={c.kind === 'copy' ? 'copy' : undefined}>{fmtMoney0(c.perEmployee)}</CTd>)}
        </tr>
      </tbody>
    </CompareTable>
  )
}
