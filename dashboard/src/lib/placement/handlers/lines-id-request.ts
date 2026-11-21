/**
 * POST /api/placements/lines/[id]/request
 *   { items: [{ key, value, included }], contact_ids: uuid[], subject, body, attachments?: [{ filename, storage_url, mime_type? }] }
 *   → { drafts, dispatches, unrouted }
 * The Policy page's Request: saves the ticked details on the line, then opens a round and writes one
 * draft per insurer contact chosen, using the email the person wrote. No model writes it; nothing is
 * sent from here (the drafts go to review and send, as every request does).
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as store from '@/lib/placement/store'
import { sbTry } from '@/lib/crm/db'
import type { PlacementLine } from '@/lib/placement/types'
import { openRounds } from '@/lib/placement/workflow'
import { specFromItems, type RequestItem } from '@/lib/placement/request'
import { contactIdsFrom, errorResponse, fail, gate, isText, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Not a line id')
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isText(b.subject) || b.subject.length > 300) return fail('Write a subject')
  if (!isText(b.body) || b.body.length > 20_000) return fail('Write the email')
  const contactIds = contactIdsFrom(b.contact_ids)
  if (!contactIds || contactIds.length === 0) return fail('Choose at least one insurer contact')
  if (!Array.isArray(b.items)) return fail('items must be a list')
  const items: RequestItem[] = []
  for (const raw of b.items as unknown[]) {
    const it = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
    if (!it || !isText(it.key) || typeof it.value !== 'string' || typeof it.included !== 'boolean') return fail('Every item needs key, value and included')
    items.push({ key: it.key.slice(0, 60), label: '', hint: '', value: it.value.slice(0, 2000), included: it.included })
  }
  try {
    const [line] = await sbTry<PlacementLine[]>(`placement_lines?id=eq.${id}&select=*`, [])
    if (!line) return fail('Line not found', 404)
    const bundle = await store.loadPlacement(line.placement_id)
    const placement = bundle?.placements[0]
    if (!bundle || !placement) return fail('Placement not found', 404)
    // Only files already on the client's thread can be attached.
    const wanted = Array.isArray(b.attachments) ? (b.attachments as { storage_url?: unknown }[]).map(a => String(a?.storage_url ?? '')).filter(Boolean) : []
    const files = wanted.length && placement.client_thread_id
      ? await sbTry<{ filename: string; mime_type: string | null; storage_url: string }[]>(`email_attachments?thread_id=eq.${placement.client_thread_id}&storage_url=not.is.null&select=filename,mime_type,storage_url&limit=200`, [])
      : []
    const attachments = files.filter(f => wanted.includes(f.storage_url)).map(f => ({ filename: f.filename, mime_type: f.mime_type ?? undefined, storage_url: f.storage_url }))
    if (attachments.length < wanted.length) return fail('An attachment is not on the client thread')
    const spec = specFromItems(line.spec ?? {}, items)
    const asked = bundle.dispatches.some(d => d.line_id === id && d.status !== 'withdrawn')
    const r = await openRounds(placement, [{ line, spec, reason: asked ? 'broker' : 'initial', change_summary: asked ? 'Request revised on the Policy page' : null, contact_ids: contactIds }], actor, {
      presetText: { subject: b.subject.trim(), body: b.body.trim() }, attachments, reuseEmptyRound: true,
    })
    return NextResponse.json({ drafts: r.drafts, dispatches: r.dispatches.length, unrouted: r.unrouted })
  } catch (e) {
    return errorResponse(e)
  }
}
