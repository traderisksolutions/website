'use client'

import { useState } from 'react'
import { Send, ExternalLink, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, Chip, Empty, Btn, LinkBtn } from './primitives'
import { fmtMoney, fmtDate } from '@/lib/crm/format'
import { PAYMENT_LABEL } from '@/lib/crm/payments'
import { openEngagementCompose } from '@/lib/engagement-handoff'
import type { PaymentDerived, PaymentSummary, DerivedPaymentStatus } from '@/lib/crm/types'

const TONE: Record<DerivedPaymentStatus, 'green' | 'amber' | 'red' | 'neutral'> = { paid: 'green', partial: 'amber', unpaid: 'neutral', overdue: 'red' }

export function PaymentsPanel({ companyId, notes, summary, compact }: { companyId: string; notes: PaymentDerived[]; summary: PaymentSummary; compact?: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = notes.filter(n => n.outstanding > 0)
  const rows = compact ? open.slice(0, 5) : notes

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

  const actions = (
    <>
      {open.length > 0 && (
        <Btn size="xs" level={summary.overdueCount > 0 ? 'primary' : 'secondary'} onClick={remind} loading={drafting} title="Opens a pre-filled reminder in the composer. Nothing is sent until you send it.">
          <Send size={12} /> Draft reminder{selected.size ? ` (${selected.size})` : open.length > 1 ? ` (${open.length})` : ''}
        </Btn>
      )}
      <LinkBtn size="xs" level="tertiary" href={`/debit-notes?company_id=${companyId}`}><ExternalLink size={12} /> All debit notes</LinkBtn>
    </>
  )

  return (
    <SectionCard title="Payments" description={compact ? undefined : 'Debit notes and what is still outstanding. Overdue is worked out from the due date.'} actions={actions} padded={false}>
      {error && <p className="text-[12px] text-destructive px-4 pt-3 m-0">{error}</p>}

      {summary.byCurrency.length > 0 && (
        <div className="px-4 py-3 flex flex-wrap gap-x-6 gap-y-2 border-b border-[--border-subtle]">
          {summary.byCurrency.map(m => (
            <div key={m.currency} className="flex items-baseline gap-3">
              <div><p className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground m-0">Outstanding</p><p className="text-[15px] font-bold m-0 tabular-nums">{fmtMoney(m.outstanding, m.currency)}</p></div>
              {m.overdue > 0 && <div><p className="text-[10.5px] uppercase tracking-[0.06em] m-0" style={{ color: 'var(--error)' }}>Overdue</p><p className="text-[15px] font-bold m-0 tabular-nums" style={{ color: 'var(--error)' }}>{fmtMoney(m.overdue, m.currency)}</p></div>}
            </div>
          ))}
          {summary.nextDue && <div><p className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground m-0">Next due</p><p className="text-[15px] font-bold m-0">{fmtDate(summary.nextDue)}</p></div>}
        </div>
      )}

      {rows.length === 0 && <Empty compact>{notes.length === 0 ? 'No debit notes for this company yet.' : 'Everything is paid.'}</Empty>}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[560px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ background: 'var(--table-header-bg)' }}>
                {!compact && <th className="w-8 px-3 py-2" />}
                <th className="text-left px-3 py-2 font-semibold">Debit note</th>
                <th className="text-left px-3 py-2 font-semibold">Cover</th>
                <th className="text-left px-3 py-2 font-semibold">Due</th>
                <th className="text-right px-3 py-2 font-semibold">Amount</th>
                <th className="text-right px-3 py-2 font-semibold">Outstanding</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(n => (
                <tr key={n.id} className={cn('border-b border-[--border-subtle]', n.outstanding > 0 && 'cursor-pointer hover:bg-muted/40')} onClick={() => !compact && n.outstanding > 0 && toggle(n.id)}>
                  {!compact && <td className="px-3 py-2">{n.outstanding > 0 && <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} onClick={e => e.stopPropagation()} aria-label={`Select ${n.debit_note_no}`} />}</td>}
                  <td className="px-3 py-2 font-mono text-[11.5px] whitespace-nowrap">
                    {n.debit_note_no}
                    {n.drive_folder_url && <a href={n.drive_folder_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-primary" title="Open Drive folder"><FolderOpen size={11} /></a>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground"><span className="block truncate max-w-[220px]">{n.classOfInsurance ?? n.event_type ?? '—'}</span><span className="block text-[11px] truncate max-w-[220px]">{n.insurer ?? ''}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(n.payment_due_date)}{n.derived === 'overdue' && <span className="block text-[10.5px]" style={{ color: 'var(--error)' }}>{n.daysOverdue} days late</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtMoney(n.net_amount ?? n.gross_amount, n.currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">{n.outstanding > 0 ? fmtMoney(n.outstanding, n.currency) : '—'}</td>
                  <td className="px-3 py-2"><Chip tone={TONE[n.derived]}>{PAYMENT_LABEL[n.derived]}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}
