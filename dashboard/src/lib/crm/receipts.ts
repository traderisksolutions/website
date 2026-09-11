/**
 * Finance reconciliation: recording that a debit note was actually paid.
 *
 * Every receipt is a row in `debit_note_payments`, and a database trigger keeps the three
 * payment columns on `debit_notes` derived from those rows. That makes the ledger the single
 * source of truth and means the stored status can never disagree with the amounts.
 *
 * Before the migration has been applied the ledger table is absent, so `recordReceipt` falls
 * back to patching the debit note directly. The reconciliation screen works either way; the
 * only thing lost until the migration lands is the receipt history and the ability to undo.
 */
import { sb, sbTry, enc } from './db'
import { todaySGT } from './format'
import type { DebitNoteRow } from './types'

export type ReceiptChannel = 'trs' | 'insurer' | 'writeoff'

export interface Receipt {
  id: string
  debit_note_id: string
  amount: number
  received_on: string
  channel: ReceiptChannel
  reference: string | null
  note: string | null
  recorded_by: string | null
  created_at: string
}

export const CHANNEL_LABEL: Record<ReceiptChannel, string> = {
  trs: 'Paid to TRS',
  insurer: 'Paid direct to insurer',
  writeoff: 'Written off',
}

export interface RecordReceiptInput {
  debitNoteId: string
  amount: number
  receivedOn?: string | null
  channel?: ReceiptChannel
  reference?: string | null
  note?: string | null
  recordedBy?: string | null
}

const MONEY_COLS = 'id,net_amount,gross_amount,paid_amount,paid_direct_amount,status'

type MoneyRow = Pick<DebitNoteRow, 'id' | 'net_amount' | 'gross_amount' | 'paid_amount' | 'paid_direct_amount' | 'status'>

function round(n: number): number {
  return Math.round(n * 100) / 100
}

export function totalOf(row: Pick<MoneyRow, 'net_amount' | 'gross_amount'>): number {
  return Number(row.net_amount ?? row.gross_amount ?? 0)
}

/** Has the receipts ledger been created yet? Cached for a minute so the pages stay quick. */
let ledgerKnown: { at: number; present: boolean } | null = null

export async function ledgerAvailable(): Promise<boolean> {
  if (ledgerKnown && Date.now() - ledgerKnown.at < 60_000) return ledgerKnown.present
  let present = true
  try {
    await sb(`debit_note_payments?select=id&limit=1`)
  } catch {
    present = false
  }
  ledgerKnown = { at: Date.now(), present }
  return present
}

export async function listReceipts(debitNoteIds: string[]): Promise<Map<string, Receipt[]>> {
  const out = new Map<string, Receipt[]>()
  if (debitNoteIds.length === 0) return out
  const rows = await sbTry<Receipt[]>(
    `debit_note_payments?debit_note_id=in.(${debitNoteIds.map(enc).join(',')})&select=*&order=received_on.desc,created_at.desc`,
    [],
  )
  for (const r of rows) {
    const arr = out.get(r.debit_note_id) ?? []
    arr.push({ ...r, amount: Number(r.amount) })
    out.set(r.debit_note_id, arr)
  }
  return out
}

/**
 * Record one payment. Returns what the note now looks like so the caller can show the result
 * without a second round trip.
 */
export async function recordReceipt(input: RecordReceiptInput): Promise<{
  outstanding: number
  status: string
  viaLedger: boolean
}> {
  const amount = round(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.')

  const notes = await sb<MoneyRow[]>(`debit_notes?id=eq.${enc(input.debitNoteId)}&select=${MONEY_COLS}`)
  const note = notes[0]
  if (!note) throw new Error('That debit note no longer exists.')

  const total = totalOf(note)
  const alreadyPaid = Number(note.paid_amount ?? 0) + Number(note.paid_direct_amount ?? 0)
  const outstandingBefore = round(Math.max(0, total - alreadyPaid))
  if (outstandingBefore <= 0) throw new Error('This debit note is already settled.')
  if (amount > outstandingBefore + 0.005) {
    throw new Error(`That is more than the ${round(outstandingBefore)} still outstanding on this note.`)
  }

  const channel: ReceiptChannel = input.channel ?? 'trs'
  const viaLedger = await ledgerAvailable()

  if (viaLedger) {
    // The trigger recomputes paid_amount, paid_direct_amount and status from the ledger.
    await sb(`debit_note_payments`, {
      method: 'POST',
      body: JSON.stringify({
        debit_note_id: input.debitNoteId,
        amount,
        received_on: input.receivedOn || todaySGT(),
        channel,
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
        recorded_by: input.recordedBy ?? null,
      }),
    })
  } else {
    // No ledger yet: keep the same arithmetic the trigger would have applied.
    const toTrs = channel === 'trs' ? amount : 0
    const toOther = channel === 'trs' ? 0 : amount
    const paidTrs = round(Number(note.paid_amount ?? 0) + toTrs)
    const paidOther = round(Number(note.paid_direct_amount ?? 0) + toOther)
    await sb(`debit_notes?id=eq.${enc(input.debitNoteId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        paid_amount: paidTrs,
        paid_direct_amount: paidOther,
        status: statusFor(paidTrs + paidOther, total),
        paid_direct_status: statusFor(paidOther, total),
      }),
    })
  }

  const after = await sb<MoneyRow[]>(`debit_notes?id=eq.${enc(input.debitNoteId)}&select=${MONEY_COLS}`)
  const row = after[0] ?? note
  const paidNow = Number(row.paid_amount ?? 0) + Number(row.paid_direct_amount ?? 0)
  return {
    outstanding: round(Math.max(0, totalOf(row) - paidNow)),
    status: row.status ?? 'unpaid',
    viaLedger,
  }
}

export function statusFor(paid: number, total: number): 'unpaid' | 'partially_paid' | 'paid' {
  if (paid <= 0) return 'unpaid'
  if (paid >= total - 0.005) return 'paid'
  return 'partially_paid'
}

/** Undo a receipt. Only possible once the ledger exists — the trigger puts the balance back. */
export async function deleteReceipt(receiptId: string): Promise<void> {
  if (!(await ledgerAvailable())) {
    throw new Error('Undo needs the finance migration. Correct the amount in the debit note instead.')
  }
  await sb(`debit_note_payments?id=eq.${enc(receiptId)}`, { method: 'DELETE' })
}
