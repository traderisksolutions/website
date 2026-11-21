'use client'

/**
 * Employment Benefits › After binding (docs/eb-v2.md P6): per EB policy, the premium billed against
 * the kept quotation or the policy's premium, member movements and whether a debit or credit note
 * followed within 60 days, and claims settled against premium. Read only; a row opens the client.
 */
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { PageFrame } from '@/components/page-frame'
import { Chip } from '@/components/crm/primitives'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { fmtDate } from '@/lib/format'
import type { BoundPolicy } from '@/lib/gb/after-binding-store'

const money = (n: number | null) => (n == null ? '–' : Math.round(n).toLocaleString('en-SG'))
const pct = (n: number | null) => (n == null ? '–' : `${Math.round(n * 100)}%`)
const BILL = {
  match: <Chip tone="green">Matches</Chip>, gst: <Chip tone="green">Matches with GST</Chip>, differs: <Chip tone="red">Differs</Chip>,
  no_quote: <Chip>Nothing to compare</Chip>, no_bill: <Chip>No premium note</Chip>,
} as const

export function AfterBinding({ rows }: { rows: BoundPolicy[] }) {
  const router = useRouter()
  const sorted = useMemo(() => [...rows].sort((a, b) =>
    Number(b.bill.status === 'differs') - Number(a.bill.status === 'differs')
    || b.movements.filter(m => !m.note).length - a.movements.filter(m => !m.note).length
    || (b.lossRatio ?? -1) - (a.lossRatio ?? -1)), [rows])
  const open = rows.reduce((a, r) => a + r.movements.filter(m => !m.note).length, 0)
  return (
    <PageFrame>
      <PageHeader title="After binding" meta={`${rows.length} Employment Benefits policies · ${rows.filter(r => r.bill.status === 'differs').length} bills differ · ${open} movements without a note · S$`} />
      <Register label="After binding" minWidth={1180}>
        <RegisterHead>
          <RegisterTh first width={240}>Client</RegisterTh><RegisterTh>Insurer</RegisterTh><RegisterTh>Period</RegisterTh>
          <RegisterTh>Billed</RegisterTh><RegisterTh>Expected</RegisterTh><RegisterTh>Bill</RegisterTh>
          <RegisterTh>Movements</RegisterTh><RegisterTh>Without a note</RegisterTh><RegisterTh>Claims</RegisterTh><RegisterTh>Settled</RegisterTh><RegisterTh last>Loss ratio</RegisterTh>
        </RegisterHead>
        <tbody>
          {sorted.map(r => {
            const without = r.movements.filter(m => !m.note)
            return (
              <RegisterRow key={r.id} onClick={() => r.companyId && router.push(`/companies/${r.companyId}`)} className={r.companyId ? 'cursor-pointer' : undefined}>
                <RegisterCell first primary={r.company} secondary={r.policyNumber ?? undefined} align="left" />
                <RegisterCell align="left">{r.insurer ?? '–'}</RegisterCell>
                <RegisterCell>{r.start ? `${fmtDate(r.start)} to ${fmtDate(r.end)}` : '–'}</RegisterCell>
                <RegisterCell>{money(r.bill.billed)}</RegisterCell>
                <RegisterCell title={r.bill.source === 'quotation' ? 'From the kept quotation' : r.bill.source === 'policy' ? 'From the policy' : undefined}>{money(r.bill.expected)}</RegisterCell>
                <RegisterCell>{BILL[r.bill.status]}{r.bill.status === 'differs' && r.bill.pct != null ? <span className="ml-1.5 text-small text-trs-neg">{`${r.bill.pct > 0 ? '+' : ''}${Math.round(r.bill.pct * 100)}%`}</span> : null}</RegisterCell>
                <RegisterCell>{r.movements.length || '–'}</RegisterCell>
                <RegisterCell title={without.map(m => `${fmtDate(m.date)} · ${m.filename}`).join('\n') || undefined}>{without.length ? <span className="font-semibold text-trs-warn">{without.length}</span> : '–'}</RegisterCell>
                <RegisterCell>{r.claims || '–'}</RegisterCell>
                <RegisterCell>{r.claims ? money(r.settled) : '–'}</RegisterCell>
                <RegisterCell last>{r.claims ? pct(r.lossRatio) : '–'}</RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
      </Register>
    </PageFrame>
  )
}
