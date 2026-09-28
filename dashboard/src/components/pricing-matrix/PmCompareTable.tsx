'use client'

import { Fragment, useMemo, useState } from 'react'
import { alignTerms, differingRows } from '@/lib/pm-compare'
import type { CompareInsurer } from '@/lib/pm-compare'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterGroupRow, RegisterEmpty } from '@/components/ui/register'

/** Level 2 — side-by-side coverage/wordings comparison across insurers, grouped by normalised
 *  (category, label) so each insurer's own terms line up under one row per benefit. A matrix on
 *  the register: the coverage term frozen on the left, one column per insurer. */
export function PmCompareTable({ insurers }: { insurers: CompareInsurer[] }) {
  const [onlyDiff, setOnlyDiff] = useState(true)
  const ids = insurers.map(i => i.calculator_id)
  const allRows = useMemo(() => alignTerms(insurers), [insurers])
  const rows = useMemo(() => (onlyDiff ? differingRows(allRows, ids) : allRows), [allRows, onlyDiff, ids])

  const byCategory = new Map<string, typeof rows>()
  for (const r of rows) { const k = r.canonical_category || r.category || '—'; (byCategory.get(k) ?? byCategory.set(k, []).get(k)!).push(r) }
  const cols = insurers.length + 1

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-[13.5px] self-end cursor-pointer" style={{ color: '#3c4043' }}>
        <input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} className="w-4 h-4 accent-[#202124]" />
        Only where insurers differ
      </label>

      <Register label="Coverage comparison" minWidth={Math.max(720, 300 + insurers.length * 220)}>
        <RegisterHead>
          <RegisterTh first width={300}>Coverage term</RegisterTh>
          {insurers.map((ins, i) => <RegisterTh key={ins.calculator_id} last={i === insurers.length - 1}>{ins.insurer_name}</RegisterTh>)}
        </RegisterHead>
        <tbody>
          {rows.length === 0 ? (
            <RegisterEmpty colSpan={cols}>{allRows.length === 0 ? 'No coverage terms extracted for these insurers yet.' : 'No differences across the selected insurers.'}</RegisterEmpty>
          ) : Array.from(byCategory.entries()).map(([cat, catRows]) => (
            <Fragment key={cat}>
              <RegisterGroupRow colSpan={cols}>{cat} <span className="tabular-nums font-normal" style={{ color: '#9aa0a6' }}>{catRows.length}</span></RegisterGroupRow>
              {catRows.map(r => (
                <RegisterRow key={r.key}>
                  <RegisterCell first nowrap={false}><span className="block text-[14px] leading-snug" style={{ color: '#202124' }}>{r.label}</span></RegisterCell>
                  {insurers.map((ins, i) => (
                    <RegisterCell key={ins.calculator_id} last={i === insurers.length - 1} nowrap={false} className="min-w-[200px]">
                      <span className="block text-[14px] leading-snug" style={{ color: r.per_insurer[ins.calculator_id] ? '#3c4043' : '#9aa0a6' }}>{r.per_insurer[ins.calculator_id] ?? 'not stated'}</span>
                    </RegisterCell>
                  ))}
                </RegisterRow>
              ))}
            </Fragment>
          ))}
        </tbody>
      </Register>
    </div>
  )
}
