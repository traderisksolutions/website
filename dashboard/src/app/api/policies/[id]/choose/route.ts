/**
 * POST /api/policies/[id]/choose { quote_id } → { ok }
 * The client went with this quote: the policy is bound to it, the other quotes on the line
 * stand down, open asks are withdrawn, and an employment-benefits policy gets its member list.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { choosePolicyQuote } from '@/lib/policies/spine'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Policy id is not valid')
  const b = await readBody<{ quote_id?: unknown }>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isUuid(b.quote_id)) return fail('quote_id is required')
  try {
    await choosePolicyQuote(id, b.quote_id, actor)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
