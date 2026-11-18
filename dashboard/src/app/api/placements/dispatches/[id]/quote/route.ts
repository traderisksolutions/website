/**
 * POST /api/placements/dispatches/[id]/quote { premium, excess?, limit?, valid_until?, note? } → { quote }
 * Record reply: a person enters what an insurer's email quoted. It replaces that insurer's current
 * price on the line's own spec (the earlier one stays as superseded, so the history keeps it), marks
 * the request answered and writes the company log under the person's name.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as store from '@/lib/placement/store'
import { sbTry } from '@/lib/crm/db'
import type { PlacementDispatch, PlacementQuote } from '@/lib/placement/types'
import { manualQuoteFrom } from '@/lib/placement/request'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Not a request id')
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return fail('Body must be a JSON object')
  const r = manualQuoteFrom(b)
  if ('error' in r) return fail(r.error)
  try {
    const [d] = await sbTry<PlacementDispatch[]>(`placement_dispatches?id=eq.${id}&select=*`, [])
    if (!d) return fail('Request not found', 404)
    const q = r.quote
    await store.patchNoTs('placement_quotes', `dispatch_id=eq.${d.id}&status=eq.received&tier_id=is.null`, { status: 'superseded' })
    const [quote] = await store.insert<PlacementQuote>('placement_quotes', {
      placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id, insurer_name: d.insurer_name,
      premium_text: q.premium_text, premium_amount: q.premium_amount, currency: 'SGD', excess_text: q.excess_text, limit_text: q.limit_text,
      validity_text: q.valid_until, valid_until: q.valid_until, key_terms: [], exclusions: [], subjectivities: [], summary: q.note,
      evidence: {}, status: 'received', needs_review: false, extracted_by: `manual:${actor}`, source: 'insurer',
    })
    await store.patch('placement_dispatches', `id=eq.${d.id}`, { status: 'quoted', next_chase_at: null })
    await store.log({ company_id: d.company_id, placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id, kind: 'quote', actor,
      text: `${d.insurer_name} quoted ${q.premium_text}${q.excess_text ? `, excess ${q.excess_text}` : ''}${q.valid_until ? `, valid until ${q.valid_until}` : ''} (entered by hand)`, detail: { manual: true } })
    return NextResponse.json({ quote: quote ?? null })
  } catch (e) {
    return errorResponse(e)
  }
}
