/**
 * POST /api/finance/receipts → record that a debit note was paid.
 *
 * This is the sanctioned way to clear an outstanding balance. Writes a row to the receipts
 * ledger (or, before the migration lands, patches the debit note directly) and returns what
 * the note looks like afterwards.
 */
import { NextRequest, NextResponse } from 'next/server'
import { recordReceipt }             from '@/lib/crm/receipts'
import type { ReceiptChannel }       from '@/lib/crm/receipts'
import { withStaffOrCron } from '@/lib/auth/guard'

const CHANNELS: ReceiptChannel[] = ['trs', 'insurer', 'writeoff']

export const POST = withStaffOrCron(async (req: NextRequest, _ctx, { user }) => {
  try {
    const body = await req.json()
    const debitNoteId = String(body.debitNoteId ?? '')
    if (!debitNoteId) return NextResponse.json({ error: 'Which debit note?' }, { status: 400 })

    const channel = CHANNELS.includes(body.channel) ? (body.channel as ReceiptChannel) : 'trs'

    // A cron caller has no user; the receipt is still valid.
    const recordedBy = user?.email ?? null

    const result = await recordReceipt({
      debitNoteId,
      amount: Number(body.amount),
      receivedOn: body.receivedOn ?? null,
      channel,
      reference: body.reference ?? null,
      note: body.note ?? null,
      recordedBy,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
})
