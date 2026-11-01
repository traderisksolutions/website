/**
 * Paired drafts (the client update beside an insurer chase) are sent one by one through
 * /api/email/send, like the case's own draft.
 *   PATCH /api/drafts/:id { to, cc, subject, body } → edits an unsent draft.
 *   POST  /api/drafts/:id { action: 'prepare' }     → signs it as the approver; returns draftId.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { editDraft, prepareDraft } from '@/lib/today/data'

type Edit = { to?: string; cc?: string | null; subject?: string; body?: string }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  const b = await req.json().catch(() => null) as Edit | null
  if (!b || typeof b.to !== 'string' || typeof b.body !== 'string') return NextResponse.json({ error: 'to and body are required.' }, { status: 400 })
  try {
    await editDraft(id, { to: b.to, cc: b.cc ?? null, subject: String(b.subject ?? ''), body: b.body })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const actor = await currentUserEmail()
  if (!actor) return NextResponse.json({ error: 'Sign in to send.' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => null) as { action?: string } | null
  if (b?.action !== 'prepare') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, draftId: await prepareDraft(id, actor.toLowerCase()) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
