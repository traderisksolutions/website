'use client'

/**
 * What each insurer has declined, and why, with the thread it came from. Read from the mail and
 * added to by the placement agent; the quote-request panel uses the same register to skip an
 * insurer for a risk like one it declined.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Chip, Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { callApi, errText, ERROR, MUTED } from '@/components/placement/shared'

type Decline = { id: string; insurer_company_id: string | null; insurer_name: string; kind: string; line: string | null; risk: string | null; reason: string | null; quote: string | null; client_name: string | null; declined_on: string | null; thread_id: string | null; source: string }
const KIND: Record<string, { label: string; tone: 'neutral' | 'amber' | 'red' | 'blue' }> = { appetite: { label: 'Appetite', tone: 'red' }, blocked: { label: 'Another broker first', tone: 'amber' }, onboarding: { label: 'TRS not onboarded', tone: 'blue' }, other: { label: 'Other', tone: 'neutral' } }
const day = (s: string | null) => s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'
const LINE_TERMS: Record<string, string[]> = { construction_car: ['car'], general_liability: ['liability', 'product_liability'], surety_bonds: ['bond'], marine_cargo: ['marine', 'cargo', 'marine_liability'], professional_indemnity: ['pi'], do: ['d&o'], wica: ['wica'], foreign_worker_medical: ['fwmi'], employee_benefits: ['eb', 'gtl'], group_personal_accident: ['gpa'], commercial_vehicle: ['motor'], iar_fire: ['property'], trade_credit: ['trade_credit'], cyber: ['cyber'] }

export function DeclinesRegister({ q, line }: { q: string; line: string }) {
  const [rows, setRows] = useState<Decline[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState('')
  useEffect(() => { callApi<{ declines: Decline[] }>('/api/insurers/declines').then(d => setRows(d.declines)).catch(e => { setError(errText(e)); setRows([]) }) }, [])
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const terms = line ? (LINE_TERMS[line] ?? [line]) : null
    return (rows ?? []).filter(r => (!kind || r.kind === kind) && (!terms || terms.includes(String(r.line ?? '').toLowerCase()))
      && (!needle || [r.insurer_name, r.line, r.risk, r.reason, r.client_name].join(' ').toLowerCase().includes(needle)))
  }, [rows, q, line, kind])
  const byInsurer = useMemo(() => {
    const m = new Map<string, Decline[]>()
    for (const r of list) m.set(r.insurer_name, [...(m.get(r.insurer_name) ?? []), r])
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [list])
  if (!rows) return <Spinner label="Loading declines…" />
  return (
    <div className="flex flex-col gap-4">
      {error && <p className="m-0 text-[13px]" style={{ color: ERROR }}>{error}</p>}
      <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: MUTED }}>
        <span>{list.length} declines from {byInsurer.length} insurers</span>
        {Object.entries(KIND).map(([k, v]) => (
          <button key={k} type="button" onClick={() => setKind(kind === k ? '' : k)} className="bg-transparent border-0 p-0 cursor-pointer"><Chip tone={kind === k ? v.tone : 'neutral'}>{v.label} · {rows.filter(r => r.kind === k).length}</Chip></button>
        ))}
      </div>
      <Register label="Insurer declines" minWidth={1180}>
        <RegisterHead>
          <RegisterTh first width={190}>Insurer</RegisterTh><RegisterTh width={100}>Date</RegisterTh><RegisterTh width={120}>Line</RegisterTh>
          <RegisterTh>Risk and reason</RegisterTh><RegisterTh width={160}>Kind</RegisterTh><RegisterTh last width={200}>Client · source</RegisterTh>
        </RegisterHead>
        <tbody>
          {list.length === 0 && <RegisterEmpty colSpan={6}>No declines match.</RegisterEmpty>}
          {byInsurer.flatMap(([name, ds]) => ds.map((r, i) => (
            <RegisterRow key={r.id}>
              <RegisterCell first>{i === 0 ? <span className="font-medium">{name}<span className="block text-[12px] font-normal" style={{ color: MUTED }}>{ds.length} declined</span></span> : null}</RegisterCell>
              <RegisterCell>{day(r.declined_on)}</RegisterCell>
              <RegisterCell>{r.line ?? '–'}</RegisterCell>
              <RegisterCell title={r.quote ?? undefined}>
                <div>{r.risk ?? '–'}</div>
                <div className="text-[12.5px]" style={{ color: MUTED }}>{r.reason}</div>
              </RegisterCell>
              <RegisterCell><Chip tone={KIND[r.kind]?.tone ?? 'neutral'}>{KIND[r.kind]?.label ?? r.kind}</Chip></RegisterCell>
              <RegisterCell last>
                <div className="truncate">{r.client_name ?? '–'}</div>
                {r.thread_id && <Link href={`/engagement?lead=${r.thread_id}`} className="text-[12.5px] underline underline-offset-2" style={{ color: MUTED }}>Open thread</Link>}
              </RegisterCell>
            </RegisterRow>
          )))}
        </tbody>
      </Register>
    </div>
  )
}
