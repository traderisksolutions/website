'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Spinner, Btn, Segmented, inputCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { RecordPaymentDialog } from '@/components/crm/RecordPaymentDialog'
import { fmtMoney, fmtDate } from '@/lib/crm/format'
import { CHANNEL_LABEL, type Receipt } from '@/lib/crm/receipts'
import type { PaymentDerived, PaymentSummary, DerivedPaymentStatus } from '@/lib/crm/types'

const INK = '#202124'
const MUTED = '#5f6368'
const BODY = '#3c4043'
const COLS = 6

type Note = PaymentDerived & { companyName: string | null; receipts: Receipt[] }

type Data = {
  notes: Note[]
  summary: PaymentSummary
  totals: { currency: string; billed: number; collected: number }[]
  counts: { open: number; settled: number; total: number }
  ledgerReady: boolean
}

/** Status in words only. A note past its due date is still awaiting payment. */
const STATUS_LABEL: Record<DerivedPaymentStatus, string> = {
  paid: 'Settled', partial: 'Part paid', unpaid: 'Awaiting payment', overdue: 'Awaiting payment',
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
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1400px] px-6 sm:px-12 pt-12 pb-20">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Finance</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {data ? `${data.counts.open} debit note${data.counts.open === 1 ? '' : 's'} waiting for payment, oldest first.` : 'Loading…'}
            </p>
          </div>
        </div>

        {error && <p className="mt-6 mb-0 text-[14px]" style={{ color: '#c5221f' }}>{error}</p>}
        {!data && !error && <Spinner label="Loading the reconciliation…" />}

        {data && (
          <>
            {!data.ledgerReady && (
              <p className="mt-6 mb-0 text-[14px]" style={{ color: MUTED }}>
                Payments are being written straight onto the debit note because the finance migration has not been run yet.
                Recording still works. Once <code className="text-[13px]">20260911_debit_note_payments.sql</code> is applied,
                each payment is kept as its own entry and can be undone.
              </p>
            )}

            {/* Two figures: what has come in, what is still to come. */}
            {sgd && (
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-[16px] p-5" style={{ background: '#f1f3f4' }}>
                  <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Collected</p>
                  <p className="m-0 mt-1.5 text-[28px] font-medium tracking-[-0.02em] leading-none tabular-nums" style={{ color: INK }}>{fmtMoney(sgd.collected, 'SGD')}</p>
                  <p className="m-0 mt-2 text-[12.5px] tabular-nums" style={{ color: MUTED }}>of {fmtMoney(sgd.billed, 'SGD')} billed · {data.counts.settled} of {data.counts.total} settled</p>
                  <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: '#dadce0' }} aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: INK }} />
                  </div>
                </div>
                <div className="rounded-[16px] p-5" style={{ background: '#f1f3f4' }}>
                  <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Still to collect</p>
                  <p className="m-0 mt-1.5 text-[28px] font-medium tracking-[-0.02em] leading-none tabular-nums" style={{ color: INK }}>{fmtMoney(sgd.billed - sgd.collected, 'SGD')}</p>
                  <p className="m-0 mt-2 text-[12.5px] tabular-nums" style={{ color: MUTED }}>across {data.counts.open} debit note{data.counts.open === 1 ? '' : 's'}</p>
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center gap-3 flex-wrap">
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'open', label: 'To collect', count: data.counts.open },
                  { value: 'all', label: 'Everything', count: data.counts.total },
                ]}
              />
              <label className="relative flex-1 min-w-[220px] max-w-[360px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#80868b' }} />
                <input
                  className={cn(inputCls, 'pl-9')}
                  placeholder="Search client, debit note or insurer"
                  aria-label="Search debit notes"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </label>
            </div>

            <h2 className="m-0 mt-8 mb-3 text-[16px] font-medium tracking-[-0.01em]">{view === 'open' ? 'Waiting to be collected' : 'Every debit note'}</h2>

            <Register label={view === 'open' ? 'Debit notes waiting to be collected' : 'Every debit note'} minWidth={820}>
              <RegisterHead>
                <RegisterTh first hint="Client, and the debit note number">Client</RegisterTh>
                <RegisterTh hint="Class of insurance, and the insurer">Cover</RegisterTh>
                <RegisterTh hint="Payment due date">Due</RegisterTh>
                <RegisterTh align="right" hint="Net premium billed">Billed</RegisterTh>
                <RegisterTh align="right" hint="Balance still outstanding">To collect</RegisterTh>
                <RegisterTh last><span className="sr-only">Actions</span></RegisterTh>
              </RegisterHead>
              <tbody>
                {rows.length === 0 && <RegisterEmpty colSpan={COLS}>{query ? 'Nothing matches that search.' : 'Everything is settled.'}</RegisterEmpty>}
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
            </Register>
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
  const client = note.companyName ?? 'Unnamed client'
  return (
    <>
      <RegisterRow onClick={onToggle} className={cn(open && 'bg-[#f8f9fa]')}>
        <RegisterCell first title={client}
          primary={note.company_id
            ? <Link href={`/companies/${note.company_id}?tab=payments`} onClick={e => e.stopPropagation()} className="no-underline hover:underline" style={{ color: INK }}>{client}</Link>
            : client}
          secondary={<span className="tabular-nums">{note.debit_note_no}</span>}
          className={cn(open && 'bg-[#f8f9fa]')}
        />
        <RegisterCell primary={note.classOfInsurance ?? note.event_type ?? '—'} secondary={note.insurer ?? 'No insurer on file'} className="max-w-[230px]" nowrap={false} />
        <RegisterCell primary={fmtDate(note.payment_due_date)} />
        <RegisterCell align="right" primary={fmtMoney(billed, note.currency)} />
        <RegisterCell align="right" nowrap={false}
          primary={<span className={cn('whitespace-nowrap', note.outstanding > 0 && 'font-medium')}>{note.outstanding > 0 ? fmtMoney(note.outstanding, note.currency) : '—'}</span>}
          secondary={billed - note.outstanding > 0 ? `${fmtMoney(billed - note.outstanding, note.currency)} received` : STATUS_LABEL[note.derived]} />
        <RegisterCell last align="right">
          {note.outstanding > 0 && (
            <Btn size="xs" level="secondary" onClick={e => { e.stopPropagation(); onPay() }}>
              Record payment
            </Btn>
          )}
        </RegisterCell>
      </RegisterRow>

      {open && (
        <RegisterRow style={{ background: '#f8f9fa' }}>
          <RegisterCell colSpan={COLS} nowrap={false} className="px-6">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="min-w-[260px]">
                <p className="text-[12.5px] m-0 mb-2" style={{ color: MUTED }}>Payments recorded</p>
                {note.receipts.length === 0 && (
                  <p className="text-[14px] m-0" style={{ color: MUTED }}>
                    Nothing recorded yet.
                    {Number(note.paid_amount ?? 0) + Number(note.paid_direct_amount ?? 0) > 0 &&
                      ` ${fmtMoney(Number(note.paid_amount ?? 0) + Number(note.paid_direct_amount ?? 0), note.currency)} is already set on the debit note itself.`}
                  </p>
                )}
                <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                  {note.receipts.map(r => (
                    <li key={r.id} className="flex items-center gap-3 text-[14px] flex-wrap" style={{ color: INK }}>
                      <span className="tabular-nums font-medium">{fmtMoney(Number(r.amount), note.currency)}</span>
                      <span style={{ color: MUTED }}>{fmtDate(r.received_on)} · {CHANNEL_LABEL[r.channel]}</span>
                      {r.reference && <span className="tabular-nums text-[13px]" style={{ color: MUTED }}>{r.reference}</span>}
                      <button
                        type="button"
                        onClick={() => onUndo(r.id)}
                        disabled={undoing === r.id}
                        className="text-[13px] bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4 disabled:opacity-50"
                        style={{ color: '#c5221f' }}
                        title="Undo this payment and put the balance back"
                      >
                        Undo
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-4 text-[13.5px]">
                {note.drive_folder_url && (
                  <a href={note.drive_folder_url} target="_blank" rel="noreferrer" className="underline underline-offset-4" style={{ color: INK }}>
                    Drive folder
                  </a>
                )}
                <Link href={`/debit-notes?open=${note.id}`} className="underline underline-offset-4" style={{ color: INK }}>
                  Open the debit note
                </Link>
              </div>
            </div>
          </RegisterCell>
        </RegisterRow>
      )}
    </>
  )
}
