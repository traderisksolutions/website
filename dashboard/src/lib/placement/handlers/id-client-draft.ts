/**
 * POST /api/placements/[id]/client-draft { quote_ids?: uuid[] } → { draftId }
 *   409 when no insurer has quoted yet or no client contact is set on the placement.
 * Drafts the comparison email to the client into the review queue: every current quote, or only
 * quote_ids when the broker ticked a partial set. Nothing is sent.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as store from '@/lib/placement/store'
import { derivePositions } from '@/lib/placement/position'
import { draftClientSummary } from '@/lib/placement/workflow'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Placement id is not valid')
  try {
    const bundle = await store.loadPlacement(id)
    const placement = bundle?.placements[0]
    if (!bundle || !placement) return fail('Placement not found', 404)
    const quoted = derivePositions(bundle).reduce((n, p) => n + p.quotedCount, 0)
    if (quoted === 0) return fail('No quotes received yet', 409)
    if (!placement.client_contact_id) return fail('No client contact on the placement. Set the client thread first.', 409)

    const b = await readBody<{ quote_ids?: unknown }>(req)
    const ids = b?.quote_ids
    if (ids != null && (!Array.isArray(ids) || !ids.every(isUuid))) return fail('quote_ids must be a list of quote ids')
    if (Array.isArray(ids) && ids.length === 0) return fail('Tick at least one quote to send', 409)
    const r = await draftClientSummary(id, actor, Array.isArray(ids) ? ids as string[] : null)
    if (!r) {
      const contact = await store.sbTryContact(placement.client_contact_id)
      if (!contact?.email) return fail('The client contact on this placement has no email address. Add one on the company, then try again.', 409)
      return fail('The agent could not write the draft. Try again.', 502)
    }
    return NextResponse.json({ draftId: r.draftId }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
