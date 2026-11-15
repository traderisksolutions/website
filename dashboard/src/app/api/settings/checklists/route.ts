/**
 * GET   /api/settings/checklists → { lists, doc_types, staff } every line's document checklist with its items
 * POST  /api/settings/checklists → { action: 'list', line } starts a list for a line,
 *                                  { action: 'item', line, label, found_by, doc_types, words } adds a document,
 *                                  { action: 'confirm', line } confirms the list as it stands.
 * PATCH /api/settings/checklists → { id, label?, found_by?, doc_types?, words?, active? } edits a document.
 * Any signed-in staff member may edit; an edit returns the list to draft until it is confirmed again.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { addItem, addList, confirmList, editItem, listChecklists } from '@/lib/cases/brief-store'
import { currentStaff } from '@/lib/casework/queue'
import { DOC_TYPES } from '@/lib/documents/taxonomy'

export const dynamic = 'force-dynamic'

async function view() {
  const [lists, staff] = await Promise.all([listChecklists(), currentStaff()])
  return { lists, staff, doc_types: DOC_TYPES.map(t => ({ slug: t.slug, label: t.label })) }
}

export async function GET(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  try {
    return NextResponse.json(await view())
  } catch (e) {
    return caseFail(e)
  }
}

export async function POST(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const line = typeof body?.line === 'string' ? body.line : ''
  try {
    if (!line) return NextResponse.json({ error: 'Choose a line of insurance.' }, { status: 400 })
    if (body?.action === 'list') await addList(line, who.actor)
    else if (body?.action === 'item') await addItem(line, body, who.actor)
    else if (body?.action === 'confirm') await confirmList(line, who.actor)
    else return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    return NextResponse.json({ ok: true, ...(await view()) })
  } catch (e) {
    return caseFail(e)
  }
}

export async function PATCH(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  try {
    if (typeof body?.id !== 'string' || !body.id) return NextResponse.json({ error: 'Name the document.' }, { status: 400 })
    const { id, ...patch } = body
    await editItem(id as string, patch, who.actor)
    return NextResponse.json({ ok: true, ...(await view()) })
  } catch (e) {
    return caseFail(e)
  }
}
