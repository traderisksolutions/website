'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { CENSUS_CSV_FIELDS, CENSUS_CSV_FIELD_LABEL, CENSUS_CSV_REQUIRED } from '@/lib/pm-census'
import type { CensusCsvField } from '@/lib/pm-census'
import { Btn, inputCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

/** Shown after picking a CSV, before any rows are imported — lets the broker confirm/fix which
 *  uploaded column is which field instead of silently guessing and dropping mismatches. */
export function CsvMappingModal({ headers, guesses, previewRows, onCancel, onConfirm }: {
  headers: string[]
  guesses: Record<CensusCsvField, number | null>
  previewRows: string[][]
  onCancel: () => void
  onConfirm: (mapping: Record<CensusCsvField, number | null>) => void
}) {
  const [mapping, setMapping] = useState<Record<CensusCsvField, number | null>>(guesses)
  const canConfirm = CENSUS_CSV_REQUIRED.every(f => mapping[f] != null)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]" style={{ background: 'rgba(32,33,36,0.28)' }} onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="csv-map" className="w-full max-w-[680px] max-h-[85vh] overflow-y-auto rounded-[16px] bg-white" style={{ boxShadow: '0 24px 64px rgba(32,33,36,0.2)', color: INK }}>
        <div className="sticky top-0 bg-white px-6 pt-6 pb-4 flex items-start justify-between gap-3" style={{ borderBottom: `1px solid ${RULE}` }}>
          <div>
            <h2 id="csv-map" className="m-0 text-[20px] font-medium tracking-[-0.01em]">Match CSV columns</h2>
            <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>Unmapped optional fields stay blank.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={16} /></button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-3 items-center">
            {CENSUS_CSV_FIELDS.map(f => (
              <div key={f} className="contents">
                <span className="text-[13.5px]" style={{ color: '#3c4043' }}>
                  {CENSUS_CSV_FIELD_LABEL[f]}{CENSUS_CSV_REQUIRED.includes(f) && <span className="ml-1 text-[12px]" style={{ color: MUTED }}>required</span>}
                </span>
                <select
                  value={mapping[f] ?? ''}
                  onChange={e => setMapping(m => ({ ...m, [f]: e.target.value === '' ? null : Number(e.target.value) }))}
                  className={inputCls}
                >
                  <option value="">None</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {previewRows.length > 0 && (
            <div>
              <p className="m-0 mb-2 text-[12.5px]" style={{ color: MUTED }}>First {previewRows.length} rows</p>
              <Register label="CSV preview" minWidth={0} maxHeight="40vh">
                <RegisterHead>
                  {headers.map((h, i) => <RegisterTh key={i} first={i === 0} last={i === headers.length - 1}>{h}</RegisterTh>)}
                </RegisterHead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <RegisterRow key={i}>
                      {row.map((cell, j) => <RegisterCell key={j} first={j === 0} last={j === row.length - 1} className={j === 0 ? 'min-w-[160px]' : undefined}><span className="text-[13.5px] tabular-nums" style={{ color: '#3c4043' }}>{cell}</span></RegisterCell>)}
                    </RegisterRow>
                  ))}
                </tbody>
              </Register>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white px-6 py-4 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${RULE}` }}>
          <Btn level="tertiary" onClick={onCancel}>Cancel</Btn>
          <Btn level="primary" onClick={() => onConfirm(mapping)} disabled={!canConfirm}>Import</Btn>
        </div>
      </div>
    </div>
  )
}
