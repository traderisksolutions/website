/**
 * POST /api/placements/quotes/[id]/pick → { draftId, bound }
 * The client chose this quote (told a broker, or the agent missed it in their email). Drafts the
 * confirmation to that insurer for a person to send; sending it binds the policy. A rate-table
 * price is bound at once (bound: true).
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { recordPick } from '@/lib/placement/workflow'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Quote id is not valid')
  try {
    return NextResponse.json(await recordPick(id, actor))
  } catch (e) {
    return errorResponse(e)
  }
}
