/**
 * GET  /api/work/:id/memory → what the case knows: notes by section with their source, where it
 *                             stands (last touch, next step, open questions, hand-over), and how
 *                             many emails each agent has not read.
 * POST /api/work/:id/memory → { action: 'note', section, text, message_id? } a person's note,
 *                             { action: 'reject' | 'restore', note_id } on one note.
 * Words quoted from a colleague's private thread are withheld.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { loadCaseState, addPersonNote, setNoteStatus } from '@/lib/cases/memory-store'
import { isSection, SECTIONS, SECTION_NAME } from '@/lib/cases/memory'

type Ctx = { params: Promise<{ id: string }> }

async function view(id: string, viewer: string) {
  const s = await loadCaseState(id, { viewer })
  return {
    item: s.item,
    threads: s.threads,
    sections: SECTIONS.map(section => ({ section, name: SECTION_NAME[section], notes: s.notes.filter(n => n.section === section && n.status === 'current') })),
    set_aside: s.notes.filter(n => n.status !== 'current'),
    resume: s.resume,
    emails: s.messages.map(m => ({ id: m.id, thread_id: m.thread_id, sent_at: m.sent_at, from: m.from_address, subject: m.subject, direction: m.direction })),
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  try {
    return NextResponse.json(await view(id, who.actor))
  } catch (e) {
    return caseFail(e)
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  const body = await req.json().catch(() => null) as { action?: string; section?: unknown; text?: unknown; message_id?: unknown; note_id?: unknown } | null
  try {
    if (body?.action === 'note') {
      if (!isSection(body.section)) return NextResponse.json({ error: 'Choose a section for the note.' }, { status: 400 })
      if (typeof body.text !== 'string' || !body.text.trim()) return NextResponse.json({ error: 'Write the note.' }, { status: 400 })
      const note = await addPersonNote(id, who.actor, { section: body.section, text: body.text, message_id: typeof body.message_id === 'string' ? body.message_id : undefined })
      return NextResponse.json({ ok: true, note, memory: await view(id, who.actor) })
    }
    if (body?.action === 'reject' || body?.action === 'restore') {
      if (typeof body.note_id !== 'string' || !body.note_id) return NextResponse.json({ error: 'Name the note.' }, { status: 400 })
      await setNoteStatus(id, body.note_id, who.actor, body.action === 'reject' ? 'rejected' : 'current')
      return NextResponse.json({ ok: true, memory: await view(id, who.actor) })
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) {
    return caseFail(e)
  }
}
