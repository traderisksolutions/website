/**
 * GET /api/renewals/:id → one renewal record: facts, tasks, risk flags, lines held and not held, and
 * the client's other policies (the choices for Close as Renewed). Changes go through
 * PATCH /api/renewals. No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renewalActor, renewalFail } from '@/lib/renewals/http'
import { loadRenewal } from '@/lib/renewals/pipeline-store'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await renewalActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'This renewal is not on the list.' }, { status: 404 })
  try {
    const r = await loadRenewal(id)
    return r ? NextResponse.json(r) : NextResponse.json({ error: 'This renewal is not on the list.' }, { status: 404 })
  } catch (e) {
    return renewalFail(e)
  }
}
