/**
 * POST /api/work/:id/edit → edits the case, or a draft's attachments.
 *   { item: { title?, company_id?, policy_id?, case_type?, status?, owner_email?, deadline?, deadline_basis?,
 *             next_action?, insurer_name?, pending_override?, pending_override_reason? } }
 *   { attachments: { draft_id, keep: string[], add: string[] } }   keep = filenames to keep; add = data-room document ids
 * Every change is written to work_item_events as kind 'edit' with the before and after values.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { editItem, setDraftAttachments, type ItemEdit } from '@/lib/today/data'
import { sb, enc } from '@/lib/crm/db'

const ITEM_KEYS = new Set(['title', 'company_id', 'policy_id', 'case_type', 'status', 'owner_email', 'deadline', 'deadline_basis', 'next_action', 'insurer_name', 'pending_override', 'pending_override_reason'])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const actor = await currentUserEmail()
  if (!actor) return NextResponse.json({ error: 'Sign in to edit work items.' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null) as { item?: Record<string, unknown>; attachments?: { draft_id?: string; keep?: unknown; add?: unknown } } | null
  if (!body || (!body.item && !body.attachments)) return NextResponse.json({ error: 'Nothing to edit.' }, { status: 400 })
  try {
    if (body.item) {
      const unknown = Object.keys(body.item).filter(k => !ITEM_KEYS.has(k))
      if (unknown.length) return NextResponse.json({ error: `Unknown field: ${unknown.join(', ')}.` }, { status: 400 })
      const r = await editItem(id, body.item as ItemEdit, actor.toLowerCase())
      return NextResponse.json({ ok: true, ...r })
    }
    const a = body.attachments!
    if (!a.draft_id || typeof a.draft_id !== 'string') return NextResponse.json({ error: 'attachments.draft_id is required.' }, { status: 400 })
    // The draft must belong to this item or its pair, so one case cannot edit another's email.
    const [item] = await sb<{ draft_id: string | null }[]>(`work_items?id=eq.${enc(id)}&select=draft_id&limit=1`)
    if (!item) return NextResponse.json({ error: 'This item no longer exists.' }, { status: 404 })
    const [d] = await sb<{ id: string; work_item_id: string | null; pair_id: string | null }[]>(`ai_drafts?id=eq.${enc(a.draft_id)}&select=id,work_item_id,pair_id&limit=1`)
    const own = d && (d.work_item_id === id || d.id === item.draft_id)
    const paired = d && !own && d.pair_id && item.draft_id && (await sb<{ pair_id: string | null }[]>(`ai_drafts?id=eq.${enc(item.draft_id)}&select=pair_id&limit=1`))[0]?.pair_id === d.pair_id
    if (!d || (!own && !paired)) return NextResponse.json({ error: 'That draft is not on this case.' }, { status: 403 })
    const keep = Array.isArray(a.keep) ? a.keep.filter((x): x is string => typeof x === 'string') : []
    const add = Array.isArray(a.add) ? a.add.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)) : []
    const attachments = await setDraftAttachments(a.draft_id, keep, add)
    await sb('work_item_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: id, kind: 'edit', actor: actor.toLowerCase(), detail: { draft_id: a.draft_id, attachments: attachments.map(x => x.filename) } }) })
    return NextResponse.json({ ok: true, attachments })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
