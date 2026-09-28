'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Btn, Field, inputCls, textareaCls } from './primitives'
import { fmtMoney, fmtDate, todaySGT } from '@/lib/crm/format'
import { CHANNEL_LABEL, type ReceiptChannel } from '@/lib/crm/receipts'
import type { PaymentDerived } from '@/lib/crm/types'

const CHANNELS: ReceiptChannel[] = ['trs', 'insurer', 'writeoff']
const INK = '#202124'
const MUTED = '#5f6368'

/**
 * Record what was actually received against one debit note. The whole point of the finance
 * reconciliation: a balance is cleared by entering the payment, never by editing a status.
 */
export function RecordPaymentDialog({ note, open, onClose, onDone }: {
  note: (PaymentDerived & { companyName?: string | null }) | null
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState('')
  const [receivedOn, setReceivedOn] = useState(todaySGT())
  const [channel, setChannel] = useState<ReceiptChannel>('trs')
  const [reference, setReference] = useState('')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Open on the full balance: settling in full is far and away the common case.
  useEffect(() => {
    if (!open || !note) return
    setAmount(note.outstanding.toFixed(2))
    setReceivedOn(todaySGT())
    setChannel(note.pay_direct_to_insurer ? 'insurer' : 'trs')
    setReference('')
    setMemo('')
    setError(null)
    setBusy(false)
  }, [open, note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!note) return null

  const entered = Number(amount)
  const remaining = Math.round((note.outstanding - (Number.isFinite(entered) ? entered : 0)) * 100) / 100

  async function save() {
    if (!note) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/finance/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          debitNoteId: note.id,
          amount: entered,
          receivedOn,
          channel,
          reference,
          note: memo,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not record that payment.')
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {note.debit_note_no}
            {note.companyName ? ` · ${note.companyName}` : ''}
            {' · '}
            {fmtMoney(note.outstanding, note.currency)} outstanding
            {note.payment_due_date ? ` · was due ${fmtDate(note.payment_due_date)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={`Amount received (${note.currency})`}>
              <input
                className={inputCls}
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Date received">
              <input className={inputCls} type="date" value={receivedOn} onChange={e => setReceivedOn(e.target.value)} />
            </Field>
          </div>

          <Field label="How it was settled">
            <div className="flex flex-col gap-1.5 pt-0.5">
              {CHANNELS.map(c => (
                <label key={c} className="flex items-center gap-2 text-[14px] cursor-pointer" style={{ color: INK }}>
                  <input
                    type="radio"
                    name="receipt-channel"
                    checked={channel === c}
                    onChange={() => setChannel(c)}
                  />
                  {CHANNEL_LABEL[c]}
                  {c === 'writeoff' && <span className="text-[13px]" style={{ color: MUTED }}>— clears the balance, counts as nothing collected</span>}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Reference" hint="Bank reference, cheque number or receipt number. Optional.">
            <input className={inputCls} value={reference} onChange={e => setReference(e.target.value)} />
          </Field>

          <Field label="Note" hint="Optional.">
            <textarea className={textareaCls} rows={2} value={memo} onChange={e => setMemo(e.target.value)} />
          </Field>

          <p className="text-[13px] m-0" style={{ color: MUTED }}>
            {!Number.isFinite(entered) || entered <= 0
              ? 'Enter an amount greater than zero.'
              : remaining > 0
                ? <>Leaves <span className="tabular-nums font-medium" style={{ color: INK }}>{fmtMoney(remaining, note.currency)}</span> still to collect.</>
                : remaining < 0
                  ? 'That is more than the balance on this note.'
                  : 'Settles this debit note in full.'}
          </p>

          {error && <p className="text-[13px] m-0" style={{ color: '#c5221f' }}>{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Btn level="tertiary" onClick={onClose}>Cancel</Btn>
          <Btn
            level="primary"
            className="h-10 px-4"
            onClick={save}
            loading={busy}
            disabled={!Number.isFinite(entered) || entered <= 0 || remaining < 0}
          >
            Record payment
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  )
}
