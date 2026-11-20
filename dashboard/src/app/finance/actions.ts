'use server'
/**
 * Finance (21 Nov 2026): the reconciliation, and money received against a debit note. They
 * replace /api/finance/reconciliation, /api/finance/receipts and /api/finance/receipts/[id].
 */
import { staffAction } from '@/lib/auth/action'
import { recordReceipt, deleteReceipt, type ReceiptChannel } from '@/lib/crm/receipts'
import { reconciliation as readReconciliation } from '@/lib/debit-notes/server'

const CHANNELS: ReceiptChannel[] = ['trs', 'insurer', 'writeoff']

/** Open debit notes with what is owed (`settled` adds the paid ones), receipts and totals. */
export async function reconciliation(settled = false) {
  return staffAction('reconciliation', async () => readReconciliation(settled))
}

export type Receipt = { debitNoteId?: string; amount?: number | string; receivedOn?: string | null; channel?: string; reference?: string | null; note?: string | null }

export async function recordPayment(b: Receipt) {
  return staffAction('record payment', async user => {
    const debitNoteId = String(b.debitNoteId ?? '')
    if (!debitNoteId) throw new Error('Which debit note?')
    const channel = CHANNELS.includes(b.channel as ReceiptChannel) ? (b.channel as ReceiptChannel) : 'trs'
    return recordReceipt({ debitNoteId, amount: Number(b.amount), receivedOn: b.receivedOn ?? null, channel, reference: b.reference ?? null, note: b.note ?? null, recordedBy: user.email })
  })
}

export async function removeReceipt(id: string) {
  return staffAction('remove receipt', async () => { await deleteReceipt(id); return { ok: true as const } })
}
