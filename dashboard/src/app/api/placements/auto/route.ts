/**
 * POST /api/placements/auto { thread_id } → { status, placement_id?, lines?, dispatched? }
 * Fired by the email classifier when a client thread asks for quotes. The agent reads the thread,
 * opens the placement and drafts one request per line for the broker to approve. Nothing is sent.
 *   201 created · 200 exists (an open placement already has this client; placement_id says which) · 404 not_found
 *   200 with a skipped status when the thread has no client company or no confident line.
 * Internal: Bearer CRON_SECRET (via requireStaffOrCron) or x-internal-secret = CRON_SECRET.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { autoPlaceFromThread } from '@/lib/placement/auto'
import { errorResponse, fail, isUuid, readBody } from '@/lib/placement/api'
import { sbTry, enc } from '@/lib/crm/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const internal = secret !== '' && req.headers.get('x-internal-secret') === secret
  if (!internal) {
    const unauthorized = await requireStaffOrCron(req)
    if (unauthorized) return unauthorized
  }

  const b = await readBody<{ thread_id?: unknown }>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isUuid(b.thread_id)) return fail('thread_id is required')

  try {
    const r = await autoPlaceFromThread(b.thread_id)
    const status = r.status === 'created' || r.status === 'adopted' ? 201 : r.status === 'not_found' ? 404 : 200
    if (r.status === 'exists') {
      // The open placement may hang off another thread of the same client: say which, so the bar can open it.
      const [p] = await sbTry<{ client_thread_id: string | null }[]>(`placements?id=eq.${enc(r.placement_id)}&select=client_thread_id&limit=1`, [])
      return NextResponse.json({ ...r, client_thread_id: p?.client_thread_id ?? null }, { status })
    }
    return NextResponse.json(r, { status })
  } catch (e) {
    return errorResponse(e)
  }
}
