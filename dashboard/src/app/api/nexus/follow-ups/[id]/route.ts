/**
 * PATCH /api/nexus/follow-ups/[id]  { status: 'done' | 'dismissed' | 'open' } | { snooze_days: 1–30 }
 * Marks a row done (or dismissed, or reopens it), or snoozes it: the row leaves every view until
 * the snooze ends. Returns { row }.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sb } from '@/lib/crm/db'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Invalid id')
  const body = await readBody<{ status?: unknown; snooze_days?: unknown }>(req)
  if (!body) return fail('Body must be a JSON object')
  const now = new Date()
  let patch: Record<string, unknown>
  if (body.snooze_days !== undefined) {
    const days = Number(body.snooze_days)
    if (!Number.isInteger(days) || days < 1 || days > 30) return fail('snooze_days must be a whole number from 1 to 30')
    patch = { status: 'snoozed', snoozed_until: new Date(now.getTime() + days * 86_400_000).toISOString() }
  } else if (body.status === 'done' || body.status === 'dismissed') {
    patch = { status: body.status, closed_at: now.toISOString(), closed_by: actor, snoozed_until: null }
  } else if (body.status === 'open') {
    patch = { status: 'open', closed_at: null, closed_by: null, closed_by_message_id: null, snoozed_until: null }
  } else {
    return fail("Send status 'done', 'dismissed' or 'open', or snooze_days")
  }
  try {
    const rows = await sb<unknown[]>(`follow_ups?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (rows.length === 0) return fail('Follow-up not found', 404)
    return NextResponse.json({ row: rows[0] })
  } catch (e) {
    return errorResponse(e)
  }
}
