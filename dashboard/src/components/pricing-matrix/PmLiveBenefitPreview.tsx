'use client'

import { Fragment } from 'react'
import { UNCONFIRMED_TAG } from '@/lib/pm-compare'
import type { CompareRow } from '@/lib/pm-compare'
import { Chip } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterGroupRow, RegisterEmpty } from '@/components/ui/register'

/** Live benefit-schedule preview for the quote wizard — takes already-aligned rows (from
 *  alignSelectedTerms, scoped to the plan tiers currently toggled) and renders them grouped by
 *  category on the register matrix (benefit frozen left, one column per insurer), without the
 *  compare page's "only differences" toggle — here we always want to see what the currently
 *  selected tiers actually cover. */
export function PmLiveBenefitPreview({ rows, insurers }: { rows: CompareRow[]; insurers: { calculator_id: string; insurer_name: string }[] }) {
  const byCategory = new Map<string, CompareRow[]>()
  for (const r of rows) { const k = r.canonical_category || r.category || '—'; (byCategory.get(k) ?? byCategory.set(k, []).get(k)!).push(r) }

  if (insurers.length === 0) return null
  const cols = insurers.length + 1
  const lastIx = insurers.length - 1

  return (
    <Register label="Benefit schedule" minWidth={Math.max(640, 260 + insurers.length * 220)}>
      <RegisterHead>
        <RegisterTh first width={260}>Benefit</RegisterTh>
        {insurers.map((ins, i) => <RegisterTh key={ins.calculator_id} last={i === lastIx}>{ins.insurer_name}</RegisterTh>)}
      </RegisterHead>
      <tbody>
        {rows.length === 0 ? (
          <RegisterEmpty colSpan={cols}>No coverage terms extracted for the selected plans yet.</RegisterEmpty>
        ) : Array.from(byCategory.entries()).map(([cat, catRows]) => (
          <Fragment key={cat}>
            <RegisterGroupRow colSpan={cols}>{cat} <span className="tabular-nums font-normal" style={{ color: '#9aa0a6' }}>{catRows.length}</span></RegisterGroupRow>
            {catRows.map(r => (
              <RegisterRow key={r.key}>
                <RegisterCell first nowrap={false}><span className="block text-[14px] leading-snug" style={{ color: '#202124' }}>{r.label}</span></RegisterCell>
                {insurers.map((ins, i) => {
                  const v = r.per_insurer[ins.calculator_id]
                  const unconfirmed = v?.startsWith(UNCONFIRMED_TAG)
                  return (
                    <RegisterCell key={ins.calculator_id} last={i === lastIx} nowrap={false} className="min-w-[200px]">
                      {v ? (
                        <span className="inline-flex items-center gap-1.5 flex-wrap text-[14px] leading-snug" style={{ color: '#3c4043' }}>
                          {unconfirmed ? v.slice(UNCONFIRMED_TAG.length) : v}
                          {unconfirmed && <Chip title="Not confirmed to belong to the selected plan tier">Unconfirmed</Chip>}
                        </span>
                      ) : <span className="text-[14px]" style={{ color: '#9aa0a6' }}>not stated</span>}
                    </RegisterCell>
                  )
                })}
              </RegisterRow>
            ))}
          </Fragment>
        ))}
      </tbody>
    </Register>
  )
}
