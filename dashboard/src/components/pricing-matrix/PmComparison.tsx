'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { QuoteResult, InsurerResult } from '@/lib/pm-quote'
import { Chip } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const fmt = (n: number | null | undefined) => (typeof n === 'number' ? '$' + n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')

/** The per-insurer comparison matrix (coverage down, insurers across, premiums right-aligned)
 *  on the register, plus an expandable per-life breakdown for each insurer. */
export function PmComparison({ result }: { result: QuoteResult }) {
  const insurers = result.insurers
  const grands = insurers.map(i => i.grand).filter((g): g is number => typeof g === 'number')
  const cheapest = grands.length ? Math.min(...grands) : null
  const lastIx = insurers.length - 1

  return (
    <div className="flex flex-col gap-5">
      <Register label="Premium comparison" minWidth={Math.max(720, 300 + insurers.length * 180)}>
        <RegisterHead>
          <RegisterTh first width={300}>Coverage</RegisterTh>
          {insurers.map((ins, i) => (
            <RegisterTh key={ins.calculator_id} align="right" last={i === lastIx}>
              <span className="flex flex-col items-end leading-tight">
                <span className="text-[14px] font-medium" style={{ color: INK }}>{ins.insurer_name}</span>
                {ins.effective_date && <span className="text-[12px] tabular-nums" style={{ color: MUTED }}>effective {ins.effective_date}</span>}
              </span>
            </RegisterTh>
          ))}
        </RegisterHead>
        <tbody>
          {result.lines_union.map(row => (
            <RegisterRow key={row.key}>
              <RegisterCell first nowrap={false}><span className="block text-[14px] leading-snug" style={{ color: INK }}>{row.label}</span></RegisterCell>
              {insurers.map((ins, i) => {
                const code = row.per_insurer[ins.calculator_id]
                const val = code ? ins.by_line?.[code] : undefined
                return (
                  <RegisterCell key={ins.calculator_id} align="right" last={i === lastIx}>
                    <span className="text-[14px] tabular-nums" style={{ color: code ? '#3c4043' : '#9aa0a6' }}>{code ? fmt(val) : 'n/a'}</span>
                  </RegisterCell>
                )
              })}
            </RegisterRow>
          ))}
          <RegisterRow style={{ borderTop: '1px solid #dadce0' }}>
            <RegisterCell first><span className="block text-[15px] font-medium" style={{ color: INK }}>Total annual premium, net</span></RegisterCell>
            {insurers.map((ins, i) => {
              const lowest = ins.grand != null && ins.grand === cheapest && insurers.length > 1
              return (
                <RegisterCell key={ins.calculator_id} align="right" last={i === lastIx}>
                  <span className="block text-[15px] font-medium tabular-nums" style={{ color: INK }}>{ins.error ? <Chip title={ins.error}>Error</Chip> : fmt(ins.grand)}</span>
                  {lowest && <span className="block mt-1"><Chip>Lowest premium</Chip></span>}
                </RegisterCell>
              )
            })}
          </RegisterRow>
          <RegisterRow>
            <RegisterCell first><span className="block text-[13px]" style={{ color: MUTED }}>Average per life <span className="tabular-nums">({result.census_size} lives)</span></span></RegisterCell>
            {insurers.map((ins, i) => <RegisterCell key={ins.calculator_id} align="right" last={i === lastIx}><span className="text-[13px] tabular-nums" style={{ color: MUTED }}>{fmt(ins.avg_per_life)}</span></RegisterCell>)}
          </RegisterRow>
        </tbody>
      </Register>

      {insurers.some(i => i.error) && (
        <ul className="m-0 p-0 list-none flex flex-col text-[13.5px]" style={{ color: '#3c4043' }}>
          {insurers.filter(i => i.error).map(i => <li key={i.calculator_id} className="py-2" style={{ borderBottom: `1px solid ${RULE}` }}><span className="font-medium" style={{ color: INK }}>{i.insurer_name}</span> · {i.error}</li>)}
        </ul>
      )}

      {insurers.map(ins => !ins.error && <MemberBreakdown key={ins.calculator_id} ins={ins} />)}
    </div>
  )
}

function MemberBreakdown({ ins }: { ins: InsurerResult }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="flex flex-col gap-3">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center gap-2 px-0 h-10 text-[16px] font-medium tracking-[-0.01em] bg-transparent border-0 cursor-pointer text-left" style={{ color: INK }}>
        {open ? <ChevronDown size={15} style={{ color: MUTED }} /> : <ChevronRight size={15} style={{ color: MUTED }} />} {ins.insurer_name} per life
        <span className="ml-auto text-[14px] tabular-nums font-normal" style={{ color: MUTED }}>{fmt(ins.grand)}</span>
      </button>
      {open && (
        <Register label={`${ins.insurer_name} per life`} minWidth={Math.max(720, 260 + (ins.coverage_lines.length + 1) * 140)} maxHeight="60vh">
          <RegisterHead>
            <RegisterTh first width={260}>Life</RegisterTh>
            {ins.coverage_lines.map(l => <RegisterTh key={l.code} align="right">{l.label}</RegisterTh>)}
            <RegisterTh align="right" last>Subtotal</RegisterTh>
          </RegisterHead>
          <tbody>
            {ins.members.map(m => (
              <RegisterRow key={m.row}>
                <RegisterCell first primary={m.name || `row ${m.row}`} secondary={`row ${m.row}`} />
                {ins.coverage_lines.map(l => <RegisterCell key={l.code} align="right"><span className="text-[14px] tabular-nums" style={{ color: '#3c4043' }}>{fmt(m.lines[l.code])}</span></RegisterCell>)}
                <RegisterCell align="right" last><span className="text-[14px] font-medium tabular-nums" style={{ color: INK }}>{fmt(m.subtotal)}</span></RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </section>
  )
}
