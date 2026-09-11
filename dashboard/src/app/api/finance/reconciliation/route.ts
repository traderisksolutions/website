/**
 * GET /api/finance/reconciliation → every debit note with money still against it, oldest
 * first, with the client name attached and the receipts already recorded.
 *
 * This is the worklist for clearing the backlog: one pass down the page, entering what came
 * in. `?settled=1` includes notes that are already cleared, so a mistake can be found.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { sbTry }                     from '@/lib/crm/db'
import { derivePayment, summarizePayments } from '@/lib/crm/payments'
import { listReceipts, ledgerAvailable }    from '@/lib/crm/receipts'
import type { DebitNoteRow }         from '@/lib/crm/types'

type Row = DebitNoteRow & {
  companies: { company_name: string | null } | null
  policies:  { policy_number: string | null; class_of_insurance: string | null } | null
}

const SELECT = [
  'id,company_id,contact_id,policy_id,debit_note_no,issue_date,payment_due_date,currency',
  'gross_amount,net_amount,paid_amount,paid_direct_amount,status,paid_direct_status',
  'pay_direct_to_insurer,insurer,event_type,drive_folder_url,updated_at',
  'companies(company_name),policies(policy_number,class_of_insurance)',
].join(',')

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const includeSettled = req.nextUrl.searchParams.get('settled') === '1'

    const rows = await sbTry<Row[]>(
      `debit_notes?select=${SELECT}&order=payment_due_date.asc.nullslast,issue_date.asc&limit=500`,
      [],
    )

    const all = rows.map(r => ({
      ...derivePayment({
        ...r,
        policyNumber: r.policies?.policy_number ?? null,
        classOfInsurance: r.policies?.class_of_insurance ?? null,
      }),
      companyName: r.companies?.company_name ?? null,
    }))

    const open = all.filter(n => n.outstanding > 0)
    const settled = all.filter(n => n.outstanding <= 0)
    const notes = includeSettled ? all : open

    const receipts = await listReceipts(notes.map(n => n.id))

    // Billed and collected across everything, so the page can show progress rather than just
    // a large red number.
    const billed = new Map<string, number>()
    const collected = new Map<string, number>()
    for (const n of all) {
      const total = Number(n.net_amount ?? n.gross_amount ?? 0)
      const paid = Number(n.paid_amount ?? 0) + Number(n.paid_direct_amount ?? 0)
      billed.set(n.currency, Math.round(((billed.get(n.currency) ?? 0) + total) * 100) / 100)
      collected.set(n.currency, Math.round(((collected.get(n.currency) ?? 0) + paid) * 100) / 100)
    }

    return NextResponse.json({
      notes: notes.map(n => ({ ...n, receipts: receipts.get(n.id) ?? [] })),
      summary: summarizePayments(open),
      totals: Array.from(billed.entries()).map(([currency, amount]) => ({
        currency,
        billed: amount,
        collected: collected.get(currency) ?? 0,
      })).sort((a, b) => (a.currency === 'SGD' ? -1 : b.currency === 'SGD' ? 1 : a.currency.localeCompare(b.currency))),
      counts: { open: open.length, settled: settled.length, total: all.length },
      ledgerReady: await ledgerAvailable(),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
