'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Send, FilePlus, ExternalLink, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, Chip, Empty, Btn, LinkBtn } from './primitives'
import { fmtMoney, fmtDate } from '@/lib/crm/format'
import { PAYMENT_LABEL } from '@/lib/crm/payments'
import { openEngagementCompose } from '@/lib/engagement-handoff'
import type { PaymentDerived, PaymentSummary, DerivedPaymentStatus, QuoteRow, QuoteKind } from '@/lib/crm/types'

const PAY_TONE: Record<DerivedPaymentStatus, 'green' | 'amber' | 'red' | 'neutral'> = { paid: 'green', partial: 'amber', unpaid: 'neutral', overdue: 'red' }
const KIND_LABEL: Record<QuoteKind, string> = { rfq: 'RFQ', pricing_matrix: 'Pricing Matrix', group_benefits: 'Legacy' }

/**
 * Quotation: everything commercial for this company in one tab — quotes going out (RFQs to
 * insurers, Pricing Matrix quotations) and debit notes coming back (what is owed and overdue).
 * Group Benefits quotations are shown as Legacy; Pricing Matrix superseded that flow.
 */
export function QuotationTab({ companyId, quotes, notes, summary }: {
  companyId: string
  quotes: QuoteRow[]
  notes: PaymentDerived[]
  summary: PaymentSummary
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = notes.filter(n => n.outstanding > 0)

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
    <>
      <SectionCard
        title="Quotes"
        description="Requests out to insurers and quotations prepared for this client."
        actions={
          <>
            <LinkBtn size="xs" level="tertiary" href={`/nexus?newCase=1&companyId=${companyId}`}><Send size={12} /> Start RFQ</LinkBtn>
            <LinkBtn size="xs" level="tertiary" href="/pricing-matrix/quote/new"><FilePlus size={12} /> New quotation</LinkBtn>
          </>
        }
      >
        {quotes.length === 0 && <Empty compact>No quotes yet.</Empty>}
        <ul className="m-0 p-0 list-none flex flex-col">
          {quotes.map(q => (
            <li key={`${q.kind}-${q.id}`} className="border-b border-[--border-subtle] last:border-b-0">
              <Link href={q.href} className="flex items-center gap-3 py-2 no-underline text-foreground hover:text-primary">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] m-0 flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium truncate">{q.title}</span>
                    <Chip tone={q.kind === 'rfq' ? 'blue' : q.kind === 'group_benefits' ? 'neutral' : 'green'}>{KIND_LABEL[q.kind]}</Chip>
                    <Chip tone={q.isOpen ? 'amber' : 'neutral'}>{q.status}</Chip>
                  </p>
                  <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5">
                    {fmtDate(q.created_at)}
                    {q.quotesReceived != null && ` · ${q.quotesReceived} insurer quote${q.quotesReceived === 1 ? '' : 's'} received`}
                    {q.memberCount != null && ` · ${q.memberCount} members`}
                    {q.effective_date && ` · effective ${fmtDate(q.effective_date)}`}
                  </p>
                </div>
                <ExternalLink size={12} className="text-muted-foreground/40 flex-shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Debit notes"
        description="What has been billed, and what is still outstanding."
        actions={
          <>
            {open.length > 0 && (
              <Btn size="xs" level={summary.overdueCount > 0 ? 'primary' : 'tertiary'} onClick={remind} loading={drafting} title="Opens a pre-filled reminder in the composer. Nothing is sent until you send it.">
                <Send size={12} /> Draft reminder{selected.size ? ` (${selected.size})` : ''}
              </Btn>
            )}
            <LinkBtn size="xs" level="tertiary" href={`/debit-notes?company_id=${companyId}`}><ExternalLink size={12} /> Open in Debit Notes</LinkBtn>
          </>
        }
      >
        {error && <p className="text-[12px] text-destructive mb-2 m-0">{error}</p>}

        {summary.byCurrency.length > 0 && (
          <p className="text-[13px] m-0 mb-2">
            {summary.byCurrency.map((m, i) => (
              <span key={m.currency}>
                {i > 0 && <span className="text-muted-foreground"> · </span>}
                <span className="text-muted-foreground">Outstanding </span><strong className="tabular-nums">{fmtMoney(m.outstanding, m.currency)}</strong>
                {m.overdue > 0 && <><span className="text-muted-foreground">, overdue </span><strong className="tabular-nums" style={{ color: 'var(--error)' }}>{fmtMoney(m.overdue, m.currency)}</strong></>}
              </span>
            ))}
            {summary.nextDue && <><span className="text-muted-foreground"> · Next due </span>{fmtDate(summary.nextDue)}</>}
          </p>
        )}

        {notes.length === 0 && <Empty compact>No debit notes for this company yet.</Empty>}

        {notes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[560px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground border-b border-[--border-subtle]">
                  <th className="w-7 py-1.5" />
                  <th className="text-left pr-3 py-1.5 font-semibold">Debit note</th>
                  <th className="text-left pr-3 py-1.5 font-semibold">Cover</th>
                  <th className="text-left pr-3 py-1.5 font-semibold">Due</th>
                  <th className="text-right pr-3 py-1.5 font-semibold">Amount</th>
                  <th className="text-right pr-3 py-1.5 font-semibold">Outstanding</th>
                  <th className="text-left py-1.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {notes.map(n => (
                  <tr key={n.id} className={cn('border-b border-[--border-subtle] last:border-b-0', n.outstanding > 0 && 'cursor-pointer hover:bg-muted/40')} onClick={() => n.outstanding > 0 && toggle(n.id)}>
                    <td className="py-2">{n.outstanding > 0 && <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} onClick={e => e.stopPropagation()} aria-label={`Select ${n.debit_note_no}`} />}</td>
                    <td className="pr-3 py-2 font-mono text-[11.5px] whitespace-nowrap">
                      {n.debit_note_no}
                      {n.drive_folder_url && <a href={n.drive_folder_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-primary" title="Open Drive folder"><FolderOpen size={11} /></a>}
                    </td>
                    <td className="pr-3 py-2 text-muted-foreground"><span className="block truncate max-w-[200px]">{n.classOfInsurance ?? n.event_type ?? '—'}</span><span className="block text-[11px] truncate max-w-[200px]">{n.insurer ?? ''}</span></td>
                    <td className="pr-3 py-2 whitespace-nowrap">{fmtDate(n.payment_due_date)}{n.derived === 'overdue' && <span className="block text-[10.5px]" style={{ color: 'var(--error)' }}>{n.daysOverdue} days late</span>}</td>
                    <td className="pr-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtMoney(n.net_amount ?? n.gross_amount, n.currency)}</td>
                    <td className="pr-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">{n.outstanding > 0 ? fmtMoney(n.outstanding, n.currency) : '—'}</td>
                    <td className="py-2"><Chip tone={PAY_TONE[n.derived]}>{PAYMENT_LABEL[n.derived]}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  )
}
