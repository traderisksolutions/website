'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import Link from 'next/link'
import { SectionCard, Empty, Btn, LinkBtn } from './primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { fmtMoney, fmtDate } from '@/lib/crm/format'
import { openEngagementCompose } from '@/lib/engagement-handoff'
import type { PaymentDerived, PaymentSummary, DerivedPaymentStatus } from '@/lib/crm/types'

const INK = '#202124'
const MUTED = '#5f6368'

/** Status in words only. A note past its due date is still awaiting payment. */
const STATUS_LABEL: Record<DerivedPaymentStatus, string> = { paid: 'Settled', partial: 'Part paid', unpaid: 'Awaiting payment', overdue: 'Awaiting payment' }

/**
 * What this client has been billed and what is still to come in.
 *
 * Framed as collection progress rather than a debt notice: the figure people act on is what is
 * left to collect, and it is cleared by recording the payment, not by editing a status.
 */
export function CompanyPayments({ companyId, notes, summary, onChanged }: {
  companyId: string
  notes: PaymentDerived[]
  summary: PaymentSummary
  onChanged?: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPaid, setShowPaid] = useState(false)
  const [paying, setPaying] = useState<PaymentDerived | null>(null)

  const open = notes.filter(n => n.outstanding > 0)
  const settled = notes.filter(n => n.outstanding <= 0)
  const rows = showPaid ? notes : open

  const billed = notes.reduce((sum, n) => sum + Number(n.net_amount ?? n.gross_amount ?? 0), 0)
  const collected = notes.reduce((sum, n) => sum + Number(n.paid_amount ?? 0) + Number(n.paid_direct_amount ?? 0), 0)
  const currency = notes[0]?.currency ?? 'SGD'
  const pct = billed > 0 ? Math.round((collected / billed) * 100) : 0

  async function remind() {
    setDrafting(true); setError(null)
    try {
      const ids = selected.size ? Array.from(selected) : open.map(n => n.id)
      const res = await fetch(`/api/companies/${companyId}/payments/reminder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debitNoteIds: ids }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not draft the reminder.')
      openEngagementCompose(d.draft)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setDrafting(false) }
  }

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <SectionCard
      title="Billing and payments"
      actions={
        <>
          {open.length > 0 && (
            <Btn size="xs" level="secondary" onClick={remind} loading={drafting} title="Opens a pre-filled reminder in the composer. Nothing is sent until you send it.">
              <Send size={12} /> Draft reminder{selected.size ? ` (${selected.size})` : ''}
            </Btn>
          )}
          <LinkBtn size="xs" level="tertiary" href="/finance">Reconciliation</LinkBtn>
        </>
      }
    >
      {error && <p className="text-[13px] mb-2 m-0" style={{ color: '#c5221f' }}>{error}</p>}

      {notes.length > 0 && (
        <div className="mb-5">
          <p className="text-[14px] m-0" style={{ color: INK }}>
            <span style={{ color: MUTED }}>Collected </span>
            <span className="font-medium tabular-nums">{fmtMoney(collected, currency)}</span>
            <span style={{ color: MUTED }}> of </span>
            <span className="font-medium tabular-nums">{fmtMoney(billed, currency)}</span>
            <span style={{ color: MUTED }}> billed</span>
            {summary.byCurrency.map(m => (
              <span key={m.currency}>
                <span style={{ color: MUTED }}> · Still to collect </span>
                <span className="font-medium tabular-nums">{fmtMoney(m.outstanding, m.currency)}</span>
              </span>
            ))}
            {summary.nextDue && <><span style={{ color: MUTED }}> · Next due </span>{fmtDate(summary.nextDue)}</>}
          </p>
          <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: '#dadce0' }} aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: INK }} />
          </div>
        </div>
      )}

      {rows.length === 0 && <Empty compact>{notes.length === 0 ? 'Nothing has been billed to this client yet.' : 'Everything has been collected.'}</Empty>}

      {rows.length > 0 && (
        <Register label="Debit notes" minWidth={700}>
          <RegisterHead>
            <RegisterTh first>Debit note</RegisterTh>
            <RegisterTh>Cover</RegisterTh>
            <RegisterTh>Due</RegisterTh>
            <RegisterTh align="right">Billed</RegisterTh>
            <RegisterTh align="right">To collect</RegisterTh>
            <RegisterTh last />
          </RegisterHead>
          <tbody>
            {rows.map(n => {
              const openNote = n.outstanding > 0
              const on = selected.has(n.id)
              return (
                <RegisterRow key={n.id} selected={on} onClick={openNote ? () => toggle(n.id) : undefined}>
                  <RegisterCell first selected={on}>
                    <span className="flex items-center gap-3">
                      <span className="w-4 flex-shrink-0 inline-flex items-center">
                        {openNote && <input type="checkbox" checked={on} onChange={() => toggle(n.id)} onClick={e => e.stopPropagation()} aria-label={`Select ${n.debit_note_no}`} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium leading-tight truncate tabular-nums" style={{ color: INK }}>{n.debit_note_no}</span>
                        <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>
                          {n.drive_folder_url
                            ? <a href={n.drive_folder_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="no-underline hover:underline" style={{ color: MUTED }} title="Open Drive folder">Drive folder</a>
                            : `Issued ${fmtDate(n.issue_date)}`}
                        </span>
                      </span>
                    </span>
                  </RegisterCell>
                  <RegisterCell primary={n.classOfInsurance ?? n.event_type ?? '—'} secondary={n.insurer ?? 'Insurer not recorded'} className="max-w-[260px]" nowrap={false} />
                  <RegisterCell primary={fmtDate(n.payment_due_date)} />
                  <RegisterCell align="right" primary={fmtMoney(n.net_amount ?? n.gross_amount, n.currency)} secondary={n.commission ? `Commission ${fmtMoney(n.commission, n.currency)}` : undefined} />
                  <RegisterCell align="right" primary={openNote ? <span className="font-medium">{fmtMoney(n.outstanding, n.currency)}</span> : '—'}
                    secondary={openNote && (Number(n.paid_amount ?? 0) + Number(n.paid_direct_amount ?? 0)) > 0 ? `${fmtMoney(Number(n.paid_amount ?? 0) + Number(n.paid_direct_amount ?? 0), n.currency)} received` : STATUS_LABEL[n.derived]} />
                  <RegisterCell last align="right">
                    {openNote && (
                      <Btn size="xs" level="secondary" onClick={e => { e.stopPropagation(); setPaying(n) }} title="Record what has been received against this debit note">
                        Record payment
                      </Btn>
                    )}
                  </RegisterCell>
                </RegisterRow>
              )
            })}
          </tbody>
        </Register>
      )}

      {settled.length > 0 && (
        <button type="button" onClick={() => setShowPaid(v => !v)} className="mt-3 text-[13px] bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>
          {showPaid ? 'Hide settled' : `Show ${settled.length} settled debit note${settled.length === 1 ? '' : 's'}`}
        </button>
      )}

      <p className="text-[13px] m-0 mt-4" style={{ color: MUTED }}>
        Recording a payment here clears the balance on the debit note. To work through everything at once, use{' '}
        <Link href="/finance" className="underline underline-offset-4" style={{ color: INK }}>Finance</Link>.
      </p>

      <RecordPaymentDialog
        note={paying}
        open={paying !== null}
        onClose={() => setPaying(null)}
        onDone={() => onChanged?.()}
      />
    </SectionCard>
  )
}
