'use client'

import { Fragment, useMemo, useState } from 'react'
import { alignTerms, differingRows } from '@/lib/pm-compare'
import type { CompareInsurer } from '@/lib/pm-compare'
import { TableShell, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shared/table-shell'

/** Level 2 — side-by-side coverage/wordings comparison across insurers, grouped by normalised
 *  (category, label) so each insurer's own terms line up under one row per benefit. */
export function PmCompareTable({ insurers }: { insurers: CompareInsurer[] }) {
  const [onlyDiff, setOnlyDiff] = useState(true)
  const ids = insurers.map(i => i.calculator_id)
  const allRows = useMemo(() => alignTerms(insurers), [insurers])
  const rows = useMemo(() => (onlyDiff ? differingRows(allRows, ids) : allRows), [allRows, onlyDiff, ids])

  const byCategory = new Map<string, typeof rows>()
  for (const r of rows) { const k = r.canonical_category || r.category || '—'; (byCategory.get(k) ?? byCategory.set(k, []).get(k)!).push(r) }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground self-end">
        <input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} className="accent-primary" />
        Show only where insurers differ
      </label>

      <div className="border border-border rounded-xl overflow-hidden">
        <TableShell matrix>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[26%]">Coverage term</TableHead>
              {insurers.map(ins => <TableHead key={ins.calculator_id}>{ins.insurer_name}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={insurers.length + 1} className="py-8 text-center text-muted-foreground/60 text-[12.5px]">
                {allRows.length === 0 ? 'No coverage terms extracted for these insurers yet.' : 'No differences found across the selected insurers.'}
              </TableCell></TableRow>
            ) : Array.from(byCategory.entries()).map(([cat, catRows]) => (
              <Fragment key={cat}>
                <TableRow className="group-row">
                  <TableCell colSpan={insurers.length + 1}>{cat}</TableCell>
                </TableRow>
                {catRows.map(r => (
                  <TableRow key={r.key}>
                    <TableCell className="text-foreground/80">{r.label}</TableCell>
                    {insurers.map(ins => (
                      <TableCell key={ins.calculator_id} className="text-muted-foreground/90">
                        {r.per_insurer[ins.calculator_id] ?? <span className="text-muted-foreground/30">not stated</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </TableShell>
      </div>
    </div>
  )
}
