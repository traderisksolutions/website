/**
 * Paired drafts (the client update beside an insurer chase) are sent one by one through
 * /api/email/send, like the case's own draft.
 *   PATCH /api/drafts/:id { to, cc, subject, body } → edits an unsent draft.
 *   PATCH /api/drafts/:id { attachments }           → replaces its files ({ filename, mime_type, storage_url }, the shape /api/email/send reads).
 *   POST  /api/drafts/:id { action: 'prepare' }     → signs it as the approver; returns draftId.
 *   POST  /api/drafts/:id { action: 'redo', note? }  → Discard and redo: a new draft from the thread, the old one rejected (one model call, a person's button).
 */
import { NextRequest, NextResponse } from 'next/server'
import { editDraft, prepareDraft } from '@/lib/today/data'
import { redoDraft } from '@/lib/today/ask'
import { attachmentsFrom } from '@/lib/today/desk'
import { setDraftFiles } from '@/lib/today/desk-server'
import { withStaffOrCron } from '@/lib/auth/guard'

type Edit = { to?: string; cc?: string | null; subject?: string; body?: string; attachments?: unknown }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const PATCH = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const b = await req.json().catch(() => null) as Edit | null
  if (!UUID.test(id)) return NextResponse.json({ error: 'A draft id is not valid.' }, { status: 400 })
  if (b && b.attachments !== undefined && b.to === undefined && b.body === undefined) {
    const parsed = attachmentsFrom(b.attachments)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    try { return NextResponse.json({ ok: true, attachments: await setDraftFiles(id, parsed.attachments) }) }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }) }
  }
  if (!b || typeof b.to !== 'string' || typeof b.body !== 'string') return NextResponse.json({ error: 'to and body are required.' }, { status: 400 })
  try {
    await editDraft(id, { to: b.to, cc: b.cc ?? null, subject: String(b.subject ?? ''), body: b.body })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
})

export const POST = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }, { user }) => {
  const actor = user?.email.toLowerCase() ?? null
  if (!actor) return NextResponse.json({ error: 'Sign in to send.' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => null) as { action?: string; note?: unknown } | null
  if (!UUID.test(id)) return NextResponse.json({ error: 'A draft id is not valid.' }, { status: 400 })
  if (b?.action === 'redo') {
    try { return NextResponse.json({ ok: true, ...(await redoDraft(id, actor.toLowerCase(), typeof b.note === 'string' ? b.note : null)) }) }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }) }
  }
  if (b?.action !== 'prepare') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, draftId: await prepareDraft(id, actor.toLowerCase()) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
})
