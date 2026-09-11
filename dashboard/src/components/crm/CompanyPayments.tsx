'use client'

import { useState } from 'react'
import { Send, ExternalLink, FolderOpen, BadgeDollarSign } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { SectionCard, Chip, Empty, Btn, LinkBtn } from './primitives'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { fmtMoney, fmtDate } from '@/lib/crm/format'
import { PAYMENT_LABEL } from '@/lib/crm/payments'
import { openEngagementCompose } from '@/lib/engagement-handoff'
import type { PaymentDerived, PaymentSummary, DerivedPaymentStatus } from '@/lib/crm/types'

const TONE: Record<DerivedPaymentStatus, 'green' | 'amber' | 'red' | 'neutral'> = { paid: 'green', partial: 'amber', unpaid: 'neutral', overdue: 'red' }

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
      description="Everything raised for this client, and what has come back in."
      actions={
        <>
          {open.length > 0 && (
            <Btn size="xs" level="secondary" onClick={remind} loading={drafting} title="Opens a pre-filled reminder in the composer. Nothing is sent until you send it.">
              <Send size={12} /> Draft reminder{selected.size ? ` (${selected.size})` : ''}
            </Btn>
          )}
          <LinkBtn size="xs" level="tertiary" href="/finance"><ExternalLink size={12} /> Reconciliation</LinkBtn>
        </>
      }
    >
      {error && <p className="text-[12px] text-destructive mb-2 m-0">{error}</p>}

      {notes.length > 0 && (
        <div className="mb-3">
          <p className="text-[13px] m-0">
            <span className="text-muted-foreground">Collected </span>
            <strong className="tabular-nums">{fmtMoney(collected, currency)}</strong>
            <span className="text-muted-foreground"> of </span>
            <strong className="tabular-nums">{fmtMoney(billed, currency)}</strong>
            <span className="text-muted-foreground"> billed</span>
            {summary.byCurrency.map(m => (
              <span key={m.currency}>
                <span className="text-muted-foreground"> · Still to collect </span>
                <strong className="tabular-nums">{fmtMoney(m.outstanding, m.currency)}</strong>
                {m.overdue > 0 && <span className="text-muted-foreground"> ({fmtMoney(m.overdue, m.currency)} past due)</span>}
              </span>
            ))}
            {summary.nextDue && <><span className="text-muted-foreground"> · Next due </span>{fmtDate(summary.nextDue)}</>}
          </p>
          <div className="mt-2 h-1.5 rounded-sm bg-muted overflow-hidden">
            <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: 'var(--success)' }} />
          </div>
        </div>
      )}

      {rows.length === 0 && <Empty compact>{notes.length === 0 ? 'Nothing has been billed to this client yet.' : 'Everything has been collected.'}</Empty>}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[640px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground border-b border-[--border-subtle]">
                <th className="w-7 py-1.5" />
                <th className="text-left pr-3 py-1.5 font-semibold">Debit note</th>
                <th className="text-left pr-3 py-1.5 font-semibold">Cover</th>
                <th className="text-left pr-3 py-1.5 font-semibold">Due</th>
                <th className="text-right pr-3 py-1.5 font-semibold">Billed</th>
                <th className="text-right pr-3 py-1.5 font-semibold">To collect</th>
                <th className="text-left pr-3 py-1.5 font-semibold">Status</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map(n => (
                <tr key={n.id} className={cn('border-b border-[--border-subtle] last:border-b-0', n.outstanding > 0 && 'cursor-pointer hover:bg-muted/40')} onClick={() => n.outstanding > 0 && toggle(n.id)}>
                  <td className="py-2">{n.outstanding > 0 && <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} onClick={e => e.stopPropagation()} aria-label={`Select ${n.debit_note_no}`} />}</td>
                  <td className="pr-3 py-2 font-mono text-[11.5px] whitespace-nowrap">
                    {n.debit_note_no}
                    {n.drive_folder_url && <a href={n.drive_folder_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-primary" title="Open Drive folder"><FolderOpen size={11} /></a>}
                  </td>
                  <td className="pr-3 py-2 text-muted-foreground"><span className="block truncate max-w-[200px]">{n.classOfInsurance ?? n.event_type ?? '—'}</span><span className="block text-[11px] truncate max-w-[200px]">{n.insurer ?? ''}</span></td>
                  <td className="pr-3 py-2 whitespace-nowrap">{fmtDate(n.payment_due_date)}{n.derived === 'overdue' && <span className="block text-[10.5px] text-muted-foreground">{n.daysOverdue} days past due</span>}</td>
                  <td className="pr-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtMoney(n.net_amount ?? n.gross_amount, n.currency)}</td>
                  <td className="pr-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">{n.outstanding > 0 ? fmtMoney(n.outstanding, n.currency) : '—'}</td>
                  <td className="pr-3 py-2"><Chip tone={TONE[n.derived]}>{PAYMENT_LABEL[n.derived]}</Chip></td>
                  <td className="py-2 text-right">
                    {n.outstanding > 0 && (
                      <Btn size="xs" level="tertiary" onClick={e => { e.stopPropagation(); setPaying(n) }} title="Record what has been received against this debit note">
                        <BadgeDollarSign size={12} /> Record payment
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {settled.length > 0 && (
        <button onClick={() => setShowPaid(v => !v)} className="mt-2 text-[12px] font-semibold text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline">
          {showPaid ? 'Hide settled' : `Show ${settled.length} settled debit note${settled.length === 1 ? '' : 's'}`}
        </button>
      )}

      <p className="text-[11.5px] text-muted-foreground m-0 mt-3">
        Clearing a balance here records the payment against the debit note. To work through everything at once, use{' '}
        <Link href="/finance" className="text-primary no-underline hover:underline">Finance</Link>.
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
