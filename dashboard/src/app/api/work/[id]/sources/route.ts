/**
 * GET  /api/work/:id/sources → the threads a case reads: picked, proposed by rule, recent, older,
 *                              excluded, and what each side said (client bucket, insurer bucket).
 * POST /api/work/:id/sources → one action by a person: { action: 'pick', thread_id, move? },
 *                              'exclude', 'restore' or { action: 'side', thread_id, side, insurer_id? }:
 *                              insurer_id names the insurer on file an insurer-side thread is with.
 *                              Answers the sources as they now stand.
 * A thread in a colleague's mailbox is counted, never shown. A thread held by another case
 * answers 409 with that case until the person confirms the move.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { loadSources, pickThread, excludeThread, restoreThread, setSide } from '@/lib/cases/sources-store'
import { isSide } from '@/lib/cases/sources'

type Ctx = { params: Promise<{ id: string }> }
const ACTIONS = new Set(['pick', 'exclude', 'restore', 'side'])

export async function GET(req: NextRequest, { params }: Ctx) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  try {
    return NextResponse.json(await loadSources(id, who.actor))
  } catch (e) {
    return caseFail(e)
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  const body = await req.json().catch(() => null) as { action?: string; thread_id?: string; move?: boolean; side?: string; insurer_id?: string | null } | null
  if (!body || !ACTIONS.has(body.action ?? '')) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  const threadId = typeof body.thread_id === 'string' ? body.thread_id.trim() : ''
  if (!threadId) return NextResponse.json({ error: 'Name the thread.' }, { status: 400 })
  try {
    let result: Record<string, unknown> = {}
    if (body.action === 'pick') result = await pickThread(id, threadId, who.actor, { move: body.move === true })
    else if (body.action === 'exclude') await excludeThread(id, threadId, who.actor)
    else if (body.action === 'restore') await restoreThread(id, threadId, who.actor)
    else {
      if (!isSide(body.side)) return NextResponse.json({ error: 'Side is client, insurer, internal or other.' }, { status: 400 })
      await setSide(id, threadId, body.side, who.actor, typeof body.insurer_id === 'string' && body.insurer_id ? body.insurer_id : null)
    }
    return NextResponse.json({ ok: true, ...result, sources: await loadSources(id, who.actor) })
  } catch (e) {
    return caseFail(e)
  }
}
