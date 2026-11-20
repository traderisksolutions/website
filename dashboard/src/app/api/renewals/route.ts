/**
 * Renewals (docs/renewals.md).
 *
 * PATCH { id, stage? , owner?, outcome?: 'renewed'|'lost', renewed_policy_id?, loss_reason?, loss_note? } → { id, stage }.
 *       Renewed needs the new policy linked; Lost needs a reason (Other also a note). A closed record does not change.
 *
 * No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renewalActor, renewalFail } from '@/lib/renewals/http'
import { changeRenewal, renewalTablesReady } from '@/lib/renewals/store'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const who = await renewalActor(req)
  if ('refused' in who) return who.refused
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (typeof body?.id !== 'string') return NextResponse.json({ error: 'Choose the renewal.' }, { status: 400 })
  try {
    if (!(await renewalTablesReady())) return NextResponse.json({ tables: false, error: 'Renewals are not set up yet.' }, { status: 409 })
    const { id, ...change } = body
    return NextResponse.json(await changeRenewal(id as string, change))
  } catch (e) {
    return renewalFail(e)
  }
}
