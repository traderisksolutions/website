/**
 * POST /api/work/:id → one action on one work item: assign, snooze, close, reopen, edit_draft,
 * discard_draft, prepare_send (signs the draft as the person approving and returns its id for
 * /api/email/send) and sent (records the send and what the case now waits on).
 */
import { NextRequest, NextResponse } from 'next/server'
import { act, type WorkAction } from '@/lib/casework/queue'
import { withStaffOrCron } from '@/lib/auth/guard'

const ACTIONS = new Set(['assign', 'snooze', 'close', 'reopen', 'edit_draft', 'discard_draft', 'prepare_send', 'sent'])

export const POST = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }, { user }) => {
  const actor = user?.email.toLowerCase() ?? null
  if (!actor) return NextResponse.json({ error: 'Sign in to act on work items.' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null) as WorkAction | null
  if (!body || !ACTIONS.has(body.action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, ...await act(id, body, actor.toLowerCase()) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
})
