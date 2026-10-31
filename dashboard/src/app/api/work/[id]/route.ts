/**
 * POST /api/work/:id → one action on one work item: assign, snooze, close, reopen, edit_draft,
 * discard_draft, prepare_send (signs the draft as the person approving and returns its id for
 * /api/email/send) and sent (records the send and what the case now waits on).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { act, type WorkAction } from '@/lib/casework/queue'

const ACTIONS = new Set(['assign', 'snooze', 'close', 'reopen', 'edit_draft', 'discard_draft', 'prepare_send', 'sent'])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const actor = await currentUserEmail()
  if (!actor) return NextResponse.json({ error: 'Sign in to act on work items.' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null) as WorkAction | null
  if (!body || !ACTIONS.has(body.action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, ...await act(id, body, actor.toLowerCase()) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
