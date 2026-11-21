/**
 * POST /api/placements/lines/[id]/tier-c { contact_ids? } → { dispatches, drafts, unrouted, lives }
 * Asks the employee-benefits insurer contacts on file that have no rate table here (Tier C) to
 * quote this line, with the employee list in the email — every one of them, or only contact_ids.
 * Drafts wait for approval; nothing is sent.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { openTierC } from '@/lib/placement/eb'
import { contactIdsFrom, errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Line id is not valid')
  const b = await readBody<{ contact_ids?: unknown }>(req)
  const contactIds = contactIdsFrom(b?.contact_ids)
  if (contactIds === false) return fail('contact_ids must be a list of contact ids')
  try {
    const r = await openTierC(id, actor, contactIds)
    return NextResponse.json(r, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
