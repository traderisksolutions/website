/** POST /api/policies/[id]/movements/request → { draftId } — one endorsement request for every reported movement. */
import { NextRequest, NextResponse } from 'next/server'
import { sbTry } from '@/lib/crm/db'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'
import { policyRow } from '@/lib/policies/members'
import { requestMovements } from '@/lib/policies/inbound'
import type { PolicyMovement } from '@/lib/policies/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Policy id is not valid')
  try {
    const policy = await policyRow(id)
    if (!policy) return fail('Policy not found', 404)
    const movements = await sbTry<PolicyMovement[]>(`policy_movements?policy_id=eq.${id}&status=eq.reported&sent_draft_id=is.null&order=created_at.asc`, [])
    if (movements.length === 0) return fail('No reported movements waiting for a request', 409)
    const { draftId } = await requestMovements(policy, movements, actor)
    return NextResponse.json({ draftId })
  } catch (e) {
    return errorResponse(e)
  }
}
