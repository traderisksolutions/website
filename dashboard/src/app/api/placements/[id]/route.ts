/**
 * GET   /api/placements/[id] → { bundle, positions, queue }
 * PATCH /api/placements/[id] { status?, inception_date?, title?, client_thread_id?, notes? } → { ok }
 *   Setting client_thread_id also copies that thread's contact onto the placement. A status
 *   change is logged as a decision by the signed-in user.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import * as store from '@/lib/placement/store'
import { sbTry } from '@/lib/crm/db'
import { derivePositions } from '@/lib/placement/position'
import { reviewQueue } from '@/lib/placement/workflow'
import type { Placement, PlacementStatus } from '@/lib/placement/types'
import { errorResponse, fail, gate, isDate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

const STATUSES: PlacementStatus[] = ['open', 'presented', 'bound', 'closed']
const isStatus = (v: unknown): v is PlacementStatus => typeof v === 'string' && (STATUSES as string[]).includes(v)

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Placement id is not valid')
  try {
    const bundle = await store.loadPlacement(id)
    if (!bundle) return fail('Placement not found', 404)
    const [positions, queue] = [derivePositions(bundle), await reviewQueue(id)]
    return NextResponse.json({ bundle, positions, queue })
  } catch (e) {
    return errorResponse(e)
  }
}

type Body = { status?: unknown; inception_date?: unknown; title?: unknown; client_thread_id?: unknown; notes?: unknown }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Placement id is not valid')
  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')

  const patch: Record<string, unknown> = {}
  if (b.status !== undefined) {
    if (!isStatus(b.status)) return fail(`status must be one of ${STATUSES.join(', ')}`)
    patch.status = b.status
  }
  if (b.inception_date !== undefined) {
    if (b.inception_date !== null && b.inception_date !== '' && !isDate(b.inception_date)) return fail('inception_date must be YYYY-MM-DD')
    patch.inception_date = isDate(b.inception_date) ? b.inception_date : null
  }
  if (b.title !== undefined) {
    if (typeof b.title !== 'string' || !b.title.trim()) return fail('title must be text')
    patch.title = b.title.trim()
  }
  if (b.notes !== undefined) {
    if (b.notes !== null && typeof b.notes !== 'string') return fail('notes must be text')
    patch.notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null
  }
  if (b.client_thread_id !== undefined) {
    if (b.client_thread_id !== null && b.client_thread_id !== '' && !isUuid(b.client_thread_id)) return fail('client_thread_id is not valid')
    patch.client_thread_id = isUuid(b.client_thread_id) ? b.client_thread_id : null
  }
  if (Object.keys(patch).length === 0) return fail('Nothing to change')

  try {
    const [current] = await sbTry<Placement[]>(`placements?id=eq.${id}&limit=1`, [])
    if (!current) return fail('Placement not found', 404)

    if (typeof patch.client_thread_id === 'string') {
      const t = await store.thread(patch.client_thread_id)
      if (!t) return fail('Thread not found', 404)
      patch.client_contact_id = t.contact_id ?? null
    } else if (patch.client_thread_id === null) {
      patch.client_contact_id = null
    }

    await store.patchNoTs('placements', `id=eq.${id}`, { ...patch, updated_at: new Date().toISOString() })

    if (isStatus(patch.status) && patch.status !== current.status) {
      await store.log({ company_id: current.company_id, placement_id: id, kind: 'decision', actor,
        text: `Placement marked ${patch.status} (was ${current.status})`, detail: { from: current.status, to: patch.status } })
      if (patch.status === 'closed' || patch.status === 'bound') {
        await store.patch('placement_lines', `placement_id=eq.${id}&status=not.in.(declined,closed)`, { status: patch.status === 'bound' ? 'bound' : 'closed', next_step: null })
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
