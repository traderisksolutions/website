/**
 * POST /api/work/:id/documents → a person's call on one row of the case's document register.
 *   { kind, status: 'waived' | 'needed' | 'received', note? }
 * Waiving needs a note: the binding gate opens on it, and the reason is kept on the case.
 */
import { NextRequest, NextResponse } from 'next/server'
import { setRegisterStatus } from '@/lib/admin/b/documents/store'
import { DOC_LABEL, type DocKind } from '@/lib/admin/b/documents/gate'
import { withStaffOrCron } from '@/lib/auth/guard'

export const POST = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }, { user }) => {
  const actor = user?.email.toLowerCase() ?? null
  if (!actor) return NextResponse.json({ error: 'Sign in to edit the register.' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null) as { kind?: string; status?: string; note?: string } | null
  const kind = body?.kind as DocKind | undefined
  if (!kind || !(kind in DOC_LABEL)) return NextResponse.json({ error: 'Unknown document kind.' }, { status: 400 })
  if (!body?.status || !['waived', 'needed', 'received'].includes(body.status)) return NextResponse.json({ error: 'status must be waived, needed or received.' }, { status: 400 })
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
  if (body.status === 'waived' && !note) return NextResponse.json({ error: 'Say why it is waived.' }, { status: 400 })
  try {
    await setRegisterStatus(id, kind, body.status as 'waived' | 'needed' | 'received', actor.toLowerCase(), note || null)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not update the register.' }, { status: 500 })
  }
})
