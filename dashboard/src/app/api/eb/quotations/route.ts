/**
 * Employment Benefits quotations kept from /eb (src/lib/gb/eb-proposal-store.ts).
 *
 * POST { snapshot, company_id?, thread_id? } → { id }   keeps the quotation as /eb shows it
 * GET  ?company=<id> → { quotations }                    a company's quotations, newest first
 *
 * A person only; no model is called.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { readSnapshot, proposalModel } from '@/lib/gb/eb-proposal'
import { listForCompany, saveQuotation } from '@/lib/gb/eb-proposal-store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  if (actor === 'system') return fail('Sign in first.', 401)
  const b = await readBody<Record<string, unknown>>(req)
  const s = readSnapshot(b?.snapshot)
  if (!s) return fail('The quotation is incomplete: a company, a start date, at least one insurer and one category are needed.')
  const companyId = isUuid(b?.company_id) ? b.company_id : null
  const threadId = isUuid(b?.thread_id) ? b.thread_id : null
  try {
    const row = await saveQuotation(s, { company_id: companyId, thread_id: threadId }, actor)
    return NextResponse.json({ id: row.id, version: row.version })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const company = req.nextUrl.searchParams.get('company')
  if (!isUuid(company)) return fail('company must be an id')
  try {
    const rows = await listForCompany(company)
    return NextResponse.json({ quotations: rows.map(q => {
      const m = proposalModel(q.snapshot)
      return { id: q.id, version: q.version, created_at: q.created_at, created_by: q.created_by, sent_at: q.sent_at, sent_to: q.sent_to, sent_by: q.sent_by,
        effective_date: q.effective_date, products: m.products, totals: m.totals, lowest: m.lowest, lives: m.lives, period: m.period, thread_id: q.thread_id }
    }) })
  } catch (e) {
    return errorResponse(e)
  }
}
