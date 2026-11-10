/**
 * GET  /api/threads/:id/bar → the next-actions bar for a thread.
 * POST /api/threads/:id/bar { action: 'snooze', until } | { action: 'no_action' } | { action: 'clear' } | { action: 'chaser' }
 *                            | { action: 'suggest', key } (runs the suggestion's action) | { action: 'dismiss', key }
 * Nothing here sends: a chaser becomes a draft, and a person sends it through /api/email/send.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { draftChaser, dismissSuggestion, loadBar, setHold } from '@/lib/chief/bar'
import { runSuggestion } from '@/lib/chief/suggest'
import { threadVisibleTo, PRIVATE_THREAD } from '@/lib/mail/visibility-server'

export const dynamic = 'force-dynamic'
// A suggestion's action can run the group benefits agent (one long model read).
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Thread id is not valid.' }, { status: 400 })
  try {
    if (!(await threadVisibleTo(id, await currentUserEmail()))) return NextResponse.json(PRIVATE_THREAD, { status: 403 })
    const bar = await loadBar(id)
    if (!bar) return NextResponse.json({ error: 'This thread no longer exists.' }, { status: 404 })
    return NextResponse.json(bar)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const actor = await currentUserEmail()
  if (!actor) return NextResponse.json({ error: 'Sign in to act on this thread.' }, { status: 401 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Thread id is not valid.' }, { status: 400 })
  const b = await req.json().catch(() => null) as { action?: string; until?: string; key?: string } | null
  try {
    if (!(await threadVisibleTo(id, actor))) return NextResponse.json(PRIVATE_THREAD, { status: 403 })
    if (b?.action === 'chaser') return NextResponse.json({ draftId: await draftChaser(id) })
    if (b?.action === 'no_action') { await setHold(id, { noAction: true, by: actor.toLowerCase() }); return NextResponse.json({ ok: true }) }
    if (b?.action === 'clear') { await setHold(id, null); return NextResponse.json({ ok: true }) }
    if (b?.action === 'suggest' && b.key) { const r = await runSuggestion(id, b.key); return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 }) }
    if (b?.action === 'dismiss' && b.key) { await dismissSuggestion(id, b.key, actor.toLowerCase()); return NextResponse.json({ ok: true }) }
    if (b?.action === 'snooze' && b.until && DAY.test(b.until)) { await setHold(id, { until: b.until, by: actor.toLowerCase() }); return NextResponse.json({ ok: true }) }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
