/** POST /api/policies/[id]/transactions { kind, note_no?, issued_on?, pax?, amount, currency?, description?, period_start?, period_end?, member_names? } → { transaction } */
import { NextRequest, NextResponse } from 'next/server'
import * as store from '@/lib/placement/store'
import { errorResponse, fail, gate, isDate, isUuid, readBody } from '@/lib/placement/api'
import { openMovements, policyRow } from '@/lib/policies/members'
import { matchMovement, noteMovements, recordTransaction } from '@/lib/policies/transactions'
import { TRANSACTION_KINDS, type TransactionKind } from '@/lib/policies/types'

export const dynamic = 'force-dynamic'

type Body = { kind?: unknown; note_no?: unknown; issued_on?: unknown; pax?: unknown; amount?: unknown; currency?: unknown; description?: unknown; period_start?: unknown; period_end?: unknown; member_names?: unknown }
const optText = (v: unknown) => typeof v === 'string' ? v : null
const optDate = (v: unknown, name: string): string | null | Error => v == null || v === '' ? null : isDate(v) ? v : new Error(`${name} must be YYYY-MM-DD`)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Policy id is not valid')
  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  if (typeof b.kind !== 'string' || !(TRANSACTION_KINDS as string[]).includes(b.kind)) return fail('kind must be debit or credit')
  const amount = Number(b.amount)
  if (!Number.isFinite(amount) || amount <= 0) return fail('amount must be a positive number')
  if (b.pax != null && b.pax !== '' && (!Number.isInteger(Number(b.pax)) || Number(b.pax) < 0)) return fail('pax must be a whole number')
  const dates = { issued_on: optDate(b.issued_on, 'issued_on'), period_start: optDate(b.period_start, 'period_start'), period_end: optDate(b.period_end, 'period_end') }
  for (const d of Object.values(dates)) if (d instanceof Error) return fail(d.message)
  try {
    const policy = await policyRow(id)
    if (!policy) return fail('Policy not found', 404)
    if (!policy.company_id) return fail('Policy has no company', 409)
    const { transaction, duplicate } = await recordTransaction(id, policy.company_id, {
      kind: b.kind as TransactionKind, note_no: optText(b.note_no), issued_on: dates.issued_on as string | null,
      pax: b.pax != null && b.pax !== '' ? Number(b.pax) : null, amount, currency: optText(b.currency), description: optText(b.description),
      period_start: dates.period_start as string | null, period_end: dates.period_end as string | null, insurer: policy.insurer,
      member_names: Array.isArray(b.member_names) ? b.member_names.filter((s): s is string => typeof s === 'string') : [],
    })
    if (duplicate) return NextResponse.json({ transaction, duplicate: true })
    const matched = matchMovement(transaction, await openMovements(id))
    await noteMovements(transaction.id, matched)
    await store.log({ company_id: policy.company_id, kind: 'info', actor, text: `${policy.insurer ?? 'Insurer'} ${transaction.kind} note${transaction.note_no ? ` ${transaction.note_no}` : ''} recorded: ${transaction.currency} ${transaction.amount.toLocaleString('en-SG')}${matched.length ? ` for ${matched.map(m => m.member_name).join(', ')}` : ''}`,
      detail: { policy_id: id, transaction_id: transaction.id, movement_ids: matched.map(m => m.id) } })
    return NextResponse.json({ transaction, matched: matched.length })
  } catch (e) {
    return errorResponse(e)
  }
}
