/**
 * POST /api/renewals/:id/tasks { kind: '-90'|'-60'|'-30'|'-15', done: boolean } → { kind, done_at }.
 * Ticks or clears one task; a closed renewal's tasks do not change. No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renewalActor, renewalFail } from '@/lib/renewals/http'
import { setTaskDone } from '@/lib/renewals/pipeline-store'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await renewalActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'This renewal is not on the list.' }, { status: 404 })
  const body = await req.json().catch(() => null) as { kind?: unknown; done?: unknown } | null
  try {
    return NextResponse.json(await setTaskDone(id, body?.kind, body?.done, who.actor))
  } catch (e) {
    return renewalFail(e)
  }
}
