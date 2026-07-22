'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import type { QuoteResult, InsurerResult } from '@/lib/pm-quote'

const fmt = (n: number | null | undefined) => (typeof n === 'number' ? '$' + n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')

/** The 3-column (per-insurer) comparison table + expandable per-member breakdown. */
export function PmComparison({ result }: { result: QuoteResult }) {
  const insurers = result.insurers
  const grands = insurers.map(i => i.grand).filter((g): g is number => typeof g === 'number')
  const cheapest = grands.length ? Math.min(...grands) : null

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left py-2.5 px-3 font-semibold text-foreground/80 w-[34%]">Coverage</th>
              {insurers.map(ins => (
                <th key={ins.calculator_id} className="text-right py-2.5 px-3 font-semibold text-foreground/80">
                  {ins.insurer_name}
                  {ins.effective_date && <div className="text-[10.5px] font-normal text-muted-foreground/50">eff. {ins.effective_date}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.lines_union.map(row => (
              <tr key={row.key} className="border-b border-border/40">
                <td className="py-2 px-3 text-foreground/80">{row.label}</td>
                {insurers.map(ins => {
                  const code = row.per_insurer[ins.calculator_id]
                  const val = code ? ins.by_line?.[code] : undefined
                  return <td key={ins.calculator_id} className="py-2 px-3 text-right tabular-nums text-muted-foreground/90">{code ? fmt(val) : <span className="text-muted-foreground/30">n/a</span>}</td>
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-emerald-50/40">
              <td className="py-2.5 px-3 font-bold text-foreground">Total annual premium (net)</td>
              {insurers.map(ins => (
                <td key={ins.calculator_id} className={`py-2.5 px-3 text-right tabular-nums font-bold ${ins.grand != null && ins.grand === cheapest ? 'text-emerald-700' : 'text-foreground'}`}>
                  {ins.error ? <span className="text-rose-500 text-[11px] inline-flex items-center gap-1"><AlertTriangle size={12} />error</span> : fmt(ins.grand)}
                  {ins.grand != null && ins.grand === cheapest && insurers.length > 1 && <div className="text-[10px] font-medium text-emerald-600">best price</div>}
                </td>
              ))}
            </tr>
            <tr className="text-muted-foreground/70">
              <td className="py-1.5 px-3">Average per life <span className="text-muted-foreground/40">({result.census_size} lives)</span></td>
              {insurers.map(ins => <td key={ins.calculator_id} className="py-1.5 px-3 text-right tabular-nums">{fmt(ins.avg_per_life)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {insurers.some(i => i.error) && (
        <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {insurers.filter(i => i.error).map(i => <div key={i.calculator_id}>{i.insurer_name}: {i.error}</div>)}
        </div>
      )}

      {insurers.map(ins => !ins.error && <MemberBreakdown key={ins.calculator_id} ins={ins} />)}
    </div>
  )
}

function MemberBreakdown({ ins }: { ins: InsurerResult }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium hover:bg-muted/40">
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {ins.insurer_name} — per-life breakdown
        <span className="ml-auto text-muted-foreground/60 tabular-nums">{fmt(ins.grand)}</span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-[11.5px] border-collapse">
            <thead>
              <tr className="text-left text-muted-foreground/60 border-b border-border/60 bg-muted/20">
                <th className="py-1.5 px-3 font-medium">Life</th>
                {ins.coverage_lines.map(l => <th key={l.code} className="py-1.5 px-2 font-medium text-right">{l.label}</th>)}
                <th className="py-1.5 px-3 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {ins.members.map(m => (
                <tr key={m.row} className="border-b border-border/30">
                  <td className="py-1.5 px-3">{m.name || `row ${m.row}`}</td>
                  {ins.coverage_lines.map(l => <td key={l.code} className="py-1.5 px-2 text-right tabular-nums">{fmt(m.lines[l.code])}</td>)}
                  <td className="py-1.5 px-3 text-right tabular-nums font-medium">{fmt(m.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
