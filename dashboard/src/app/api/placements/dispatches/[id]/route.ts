/**
 * PATCH /api/placements/dispatches/[id] { status: 'declined' | 'withdrawn' | 'sent' } → { ok }
 * Manual override by the broker, logged under their name: an insurer who declined by phone,
 * a request withdrawn, or a request sent outside the review screen.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as store from '@/lib/placement/store'
import { sbTry } from '@/lib/crm/db'
import { nextChaseAt } from '@/lib/placement/position'
import type { DispatchStatus, LogKind, PlacementDispatch } from '@/lib/placement/types'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

const ALLOWED = ['declined', 'withdrawn', 'sent'] as const
type Override = typeof ALLOWED[number]
const isOverride = (v: unknown): v is Override => typeof v === 'string' && (ALLOWED as readonly string[]).includes(v)

const LOG_KIND: Record<Override, LogKind> = { declined: 'declined', withdrawn: 'decision', sent: 'sent' }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Dispatch id is not valid')
  const b = await readBody<{ status?: unknown }>(req)
  if (!b || !isOverride(b.status)) return fail(`status must be one of ${ALLOWED.join(', ')}`)

  try {
    const [d] = await sbTry<PlacementDispatch[]>(`placement_dispatches?id=eq.${id}&limit=1`, [])
    if (!d) return fail('Dispatch not found', 404)
    if (d.status === b.status) return NextResponse.json({ ok: true })

    const at = new Date()
    const patch: Record<string, unknown> = { status: b.status satisfies DispatchStatus }
    if (b.status === 'sent') {
      patch.sent_at = d.sent_at ?? at.toISOString()
      patch.last_outbound_at = at.toISOString()
      patch.next_chase_at = nextChaseAt(at, d.chase_count).toISOString()
    } else {
      patch.next_chase_at = null
    }
    await store.patch('placement_dispatches', `id=eq.${id}`, patch)

    const text = b.status === 'declined' ? `${d.insurer_name} marked declined`
      : b.status === 'withdrawn' ? `Request to ${d.insurer_name} withdrawn`
      : `Request to ${d.insurer_name} marked sent`
    await store.log({ company_id: d.company_id, placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id,
      kind: LOG_KIND[b.status], actor, text, thread_id: d.thread_id, detail: { manual: true, from: d.status, to: b.status } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
