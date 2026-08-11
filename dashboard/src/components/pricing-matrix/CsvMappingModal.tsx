'use client'

import { useState } from 'react'
import { X, Upload } from 'lucide-react'
import { CENSUS_CSV_FIELDS, CENSUS_CSV_FIELD_LABEL, CENSUS_CSV_REQUIRED } from '@/lib/pm-census'
import type { CensusCsvField } from '@/lib/pm-census'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-card shadow-2xl">
        <div className="sticky top-0 bg-card border-b border-[--border-subtle] px-5 py-3.5 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-foreground flex items-center gap-2"><Upload size={15} /> Match CSV columns</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-[11.5px] text-muted-foreground">Confirm which column in your file is which field. Unmapped optional fields are just left blank.</p>

          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 items-center">
            {CENSUS_CSV_FIELDS.map(f => (
              <div key={f} className="contents">
                <span className="text-[12px] font-medium text-foreground/80">
                  {CENSUS_CSV_FIELD_LABEL[f]}{CENSUS_CSV_REQUIRED.includes(f) && <span className="text-rose-500"> *</span>}
                </span>
                <select
                  value={mapping[f] ?? ''}
                  onChange={e => setMapping(m => ({ ...m, [f]: e.target.value === '' ? null : Number(e.target.value) }))}
                  className="text-[12.5px] border border-border rounded-md px-2 py-1 bg-background"
                >
                  <option value="">— none —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {previewRows.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] font-medium text-muted-foreground/70 mb-1.5">Preview (first {previewRows.length} rows)</p>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-[11.5px] border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      {headers.map((h, i) => <th key={i} className="text-left py-1.5 px-2 font-medium text-foreground/70 whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 last:border-0">
                        {row.map((cell, j) => <td key={j} className="py-1.5 px-2 text-muted-foreground/90 whitespace-nowrap">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-card border-t border-[--border-subtle] px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-[12px] text-muted-foreground hover:text-foreground px-3 py-1.5">Cancel</button>
          <button
            onClick={() => onConfirm(mapping)}
            disabled={!canConfirm}
            className="text-[12px] font-semibold px-4 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
