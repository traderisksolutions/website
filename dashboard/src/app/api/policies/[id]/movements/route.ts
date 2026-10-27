/** POST /api/policies/[id]/movements { kind, member_name, relationship?, effective_on?, pax?, detail? } → { movement } */
import { NextRequest, NextResponse } from 'next/server'
import * as store from '@/lib/placement/store'
import { errorResponse, fail, gate, isDate, isText, isUuid, readBody } from '@/lib/placement/api'
import { policyRow, recordMovement } from '@/lib/policies/members'
import { MOVEMENT_KINDS, type MovementKind } from '@/lib/policies/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Policy id is not valid')
  const b = await readBody<{ kind?: unknown; member_name?: unknown; relationship?: unknown; effective_on?: unknown; pax?: unknown; detail?: unknown }>(req)
  if (!b) return fail('Body must be a JSON object')
  if (typeof b.kind !== 'string' || !(MOVEMENT_KINDS as string[]).includes(b.kind)) return fail('kind must be join, leave or change')
  if (!isText(b.member_name)) return fail('member_name is required')
  if (b.effective_on != null && b.effective_on !== '' && !isDate(b.effective_on)) return fail('effective_on must be YYYY-MM-DD')
  if (b.pax != null && (!Number.isInteger(Number(b.pax)) || Number(b.pax) < 1)) return fail('pax must be a whole number of 1 or more')
  try {
    const policy = await policyRow(id)
    if (!policy) return fail('Policy not found', 404)
    if (!policy.company_id) return fail('Policy has no company', 409)
    const movement = await recordMovement(id, policy.company_id, {
      kind: b.kind as MovementKind, member_name: b.member_name, relationship: typeof b.relationship === 'string' ? b.relationship : null,
      effective_on: isDate(b.effective_on) ? b.effective_on : null, pax: b.pax != null ? Number(b.pax) : 1,
      detail: b.detail && typeof b.detail === 'object' && !Array.isArray(b.detail) ? (b.detail as Record<string, unknown>) : {},
    })
    await store.log({ company_id: policy.company_id, kind: 'change', actor, text: `${movement.kind === 'join' ? 'Joiner' : movement.kind === 'leave' ? 'Leaver' : 'Change'} recorded: ${movement.member_name}${movement.effective_on ? ` from ${movement.effective_on}` : ''}`, detail: { policy_id: id, movement_id: movement.id } })
    return NextResponse.json({ movement })
  } catch (e) {
    return errorResponse(e)
  }
}
