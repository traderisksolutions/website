'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BadgeDollarSign, Undo2, ExternalLink, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { SectionCard, Chip, Empty, Spinner, Btn, Segmented, inputCls } from '@/components/crm/primitives'
import { RecordPaymentDialog } from '@/components/crm/RecordPaymentDialog'
import { fmtMoney, fmtDate, fmtRelative } from '@/lib/crm/format'
import { PAYMENT_LABEL } from '@/lib/crm/payments'
import { CHANNEL_LABEL, type Receipt } from '@/lib/crm/receipts'
import type { PaymentDerived, PaymentSummary, DerivedPaymentStatus } from '@/lib/crm/types'

type Note = PaymentDerived & { companyName: string | null; receipts: Receipt[] }

type Data = {
  notes: Note[]
  summary: PaymentSummary
  totals: { currency: string; billed: number; collected: number }[]
  counts: { open: number; settled: number; total: number }
  ledgerReady: boolean
}

const TONE: Record<DerivedPaymentStatus, 'green' | 'amber' | 'red' | 'neutral'> = {
  paid: 'green', partial: 'amber', unpaid: 'neutral', overdue: 'red',
}

/**
 * Finance reconciliation — the one place a balance gets cleared.
 *
 * A debit note stops being outstanding when somebody records the payment that came in, not
 * when somebody edits a status. The list is ordered oldest first so the backlog can be worked
 * straight down the page.
 */
export default function FinancePage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'open' | 'all'>('open')
  const [query, setQuery] = useState('')
  const [paying, setPaying] = useState<Note | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [undoing, setUndoing] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/finance/reconciliation${view === 'all' ? '?settled=1' : ''}`, { cache: 'no-store' })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Could not load.'); setData(d) })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [view])

  useEffect(() => { setData(null); load() }, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.notes
    return data.notes.filter(n =>
      (n.companyName ?? '').toLowerCase().includes(q) ||
      n.debit_note_no.toLowerCase().includes(q) ||
      (n.insurer ?? '').toLowerCase().includes(q),
    )
  }, [data, query])

  async function undo(receiptId: string) {
    setUndoing(receiptId)
    try {
      const res = await fetch(`/api/finance/receipts/${receiptId}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not undo that.')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUndoing(null)
    }
  }

  const sgd = data?.totals.find(t => t.currency === 'SGD')
  const pct = sgd && sgd.billed > 0 ? Math.round((sgd.collected / sgd.billed) * 100) : 0

  return (
    <div className="p-6">
      <div className="max-w-[1200px] mx-auto">
        <PageHeader
          title="Finance"
          description="Record what has been received and clear the balance. A debit note is settled by entering the payment, never by editing a status."
        />

        {error && <p className="text-[12.5px] text-destructive">{error}</p>}
        {!data && !error && <Spinner label="Loading the reconciliation…" />}

        {data && (
          <>
            {!data.ledgerReady && (
              <div className="mb-4 rounded-md border border-[--border-subtle] bg-muted/40 px-3 py-2.5">
                <p className="text-[12.5px] m-0">
                  Payments are being written straight onto the debit note because the finance migration has not been run yet.
                  Recording still works. Once <code className="text-[11.5px]">20260911_debit_note_payments.sql</code> is applied,
                  each payment is kept as its own entry and can be undone.
                </p>
              </div>
            )}

            {/* Progress, not a single stark number: what was billed, what has come in. */}
            {sgd && (
              <div className="mb-5 rounded-md border border-[--border-subtle] p-4">
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <p className="text-[13px] m-0">
                    <span className="text-muted-foreground">Collected </span>
                    <strong className="tabular-nums">{fmtMoney(sgd.collected, 'SGD')}</strong>
                    <span className="text-muted-foreground"> of </span>
                    <strong className="tabular-nums">{fmtMoney(sgd.billed, 'SGD')}</strong>
                    <span className="text-muted-foreground"> billed</span>
                  </p>
                  <p className="text-[13px] m-0 tabular-nums">
                    <span className="text-muted-foreground">Still to collect </span>
                    <strong>{fmtMoney(sgd.billed - sgd.collected, 'SGD')}</strong>
                    <span className="text-muted-foreground"> across {data.counts.open} note{data.counts.open === 1 ? '' : 's'}</span>
                  </p>
                </div>
                <div className="mt-2.5 h-2 rounded-sm bg-muted overflow-hidden">
                  <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: 'var(--success)' }} />
                </div>
                <p className="text-[11.5px] text-muted-foreground m-0 mt-1.5">
                  {pct}% collected · {data.counts.settled} of {data.counts.total} debit notes settled
                </p>
              </div>
            )}

            <div className="mb-3 flex items-center gap-3 flex-wrap">
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'open', label: 'To collect', count: data.counts.open },
                  { value: 'all', label: 'Everything', count: data.counts.total },
                ]}
              />
              <label className="relative flex-1 min-w-[200px] max-w-[320px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  className={cn(inputCls, 'pl-8')}
                  placeholder="Search client, debit note or insurer"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </label>
            </div>

            <SectionCard
              title={view === 'open' ? 'Waiting to be collected' : 'Every debit note'}
              description="Oldest first. Open a row to see what has already been recorded against it."
              padded={false}
            >
              {rows.length === 0 && <Empty compact>{query ? 'Nothing matches that search.' : 'Everything is settled.'}</Empty>}

              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px] min-w-[820px]">
                    <thead>
                      <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground border-b border-[--border-subtle]">
                        <th className="text-left pl-4 pr-3 py-2 font-semibold">Client</th>
                        <th className="text-left pr-3 py-2 font-semibold">Debit note</th>
                        <th className="text-left pr-3 py-2 font-semibold">Cover</th>
                        <th className="text-left pr-3 py-2 font-semibold">Due</th>
                        <th className="text-right pr-3 py-2 font-semibold">Billed</th>
                        <th className="text-right pr-3 py-2 font-semibold">To collect</th>
                        <th className="text-left pr-3 py-2 font-semibold">Status</th>
                        <th className="pr-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(n => (
                        <FinanceRow
                          key={n.id}
                          note={n}
                          open={expanded === n.id}
                          onToggle={() => setExpanded(v => (v === n.id ? null : n.id))}
                          onPay={() => setPaying(n)}
                          onUndo={undo}
                          undoing={undoing}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        )}

        <RecordPaymentDialog
          note={paying}
          open={paying !== null}
          onClose={() => setPaying(null)}
          onDone={load}
        />
      </div>
    </div>
  )
}

function FinanceRow({ note, open, onToggle, onPay, onUndo, undoing }: {
  note: Note
  open: boolean
  onToggle: () => void
  onPay: () => void
  onUndo: (id: string) => void
  undoing: string | null
}) {
  const billed = Number(note.net_amount ?? note.gross_amount ?? 0)
  return (
    <>
      <tr className="border-b border-[--border-subtle] hover:bg-muted/40 cursor-pointer" onClick={onToggle}>
        <td className="pl-4 pr-3 py-2.5">
          {note.company_id
            ? <Link href={`/companies/${note.company_id}?tab=payments`} onClick={e => e.stopPropagation()} className="font-semibold no-underline text-foreground hover:text-primary">{note.companyName ?? 'Unnamed client'}</Link>
            : <span className="font-semibold">{note.companyName ?? 'Unnamed client'}</span>}
        </td>
        <td className="pr-3 py-2.5 font-mono text-[11.5px] whitespace-nowrap">{note.debit_note_no}</td>
        <td className="pr-3 py-2.5 text-muted-foreground">
          <span className="block truncate max-w-[200px]">{note.classOfInsurance ?? note.event_type ?? '—'}</span>
          <span className="block text-[11px] truncate max-w-[200px]">{note.insurer ?? ''}</span>
        </td>
        <td className="pr-3 py-2.5 whitespace-nowrap">
          {fmtDate(note.payment_due_date)}
          {note.derived === 'overdue' && (
            <span className="block text-[10.5px] text-muted-foreground">{fmtRelative(note.payment_due_date)}</span>
          )}
        </td>
        <td className="pr-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmtMoney(billed, note.currency)}</td>
        <td className="pr-3 py-2.5 text-right tabular-nums whitespace-nowrap font-semibold">
          {note.outstanding > 0 ? fmtMoney(note.outstanding, note.currency) : '—'}
        </td>
        <td className="pr-3 py-2.5"><Chip tone={TONE[note.derived]}>{PAYMENT_LABEL[note.derived]}</Chip></td>
        <td className="pr-4 py-2.5 text-right">
          {note.outstanding > 0 && (
            <Btn size="xs" level="secondary" onClick={e => { e.stopPropagation(); onPay() }}>
              <BadgeDollarSign size={12} /> Record payment
            </Btn>
          )}
        </td>
      </tr>

      {open && (
        <tr className="border-b border-[--border-subtle] bg-muted/20">
          <td colSpan={8} className="px-4 py-3">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="min-w-[260px]">
                <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground m-0 mb-1.5 font-semibold">Payments recorded</p>
                {note.receipts.length === 0 && (
                  <p className="text-[12.5px] text-muted-foreground m-0">
                    Nothing recorded yet.
                    {Number(note.paid_amount ?? 0) + Number(note.paid_direct_amount ?? 0) > 0 &&
                      ` ${fmtMoney(Number(note.paid_amount ?? 0) + Number(note.paid_direct_amount ?? 0), note.currency)} is already set on the debit note itself.`}
                  </p>
                )}
                <ul className="m-0 p-0 list-none flex flex-col gap-1">
                  {note.receipts.map(r => (
                    <li key={r.id} className="flex items-center gap-2.5 text-[12.5px]">
                      <span className="tabular-nums font-semibold">{fmtMoney(Number(r.amount), note.currency)}</span>
                      <span className="text-muted-foreground">{fmtDate(r.received_on)} · {CHANNEL_LABEL[r.channel]}</span>
                      {r.reference && <span className="text-muted-foreground font-mono text-[11px]">{r.reference}</span>}
                      <button
                        onClick={() => onUndo(r.id)}
                        disabled={undoing === r.id}
                        className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-destructive bg-transparent border-0 p-0 cursor-pointer disabled:opacity-50"
                        title="Undo this payment and put the balance back"
                      >
                        <Undo2 size={11} /> Undo
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-2">
                {note.drive_folder_url && (
                  <a href={note.drive_folder_url} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-primary no-underline hover:underline inline-flex items-center gap-1">
                    <ExternalLink size={11} /> Drive folder
                  </a>
                )}
                <Link href={`/debit-notes?open=${note.id}`} className="text-[12px] font-semibold text-primary no-underline hover:underline inline-flex items-center gap-1">
                  <ExternalLink size={11} /> Open the debit note
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
