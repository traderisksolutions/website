/**
 * POST /api/placements/inbound { message_id, thread_id, gmail_thread_id?, direction } → { handled, detail }
 * Fired by the email ingest for every newly stored message. Cheap when the thread is not a
 * placement's; otherwise the agent reads the insurer's or the client's reply and files it.
 * Internal: Bearer CRON_SECRET (via requireStaffOrCron) or x-internal-secret = CRON_SECRET.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { handleInbound } from '@/lib/placement/workflow'
import { errorResponse, fail, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Body = { message_id?: unknown; thread_id?: unknown; gmail_thread_id?: unknown; direction?: unknown }

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const internal = secret !== '' && req.headers.get('x-internal-secret') === secret
  if (!internal) {
    const unauthorized = await requireStaffOrCron(req)
    if (unauthorized) return unauthorized
  }

  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isUuid(b.message_id)) return fail('message_id is required')
  if (!isUuid(b.thread_id)) return fail('thread_id is required')
  if (b.direction !== 'inbound' && b.direction !== 'outbound') return fail('direction must be inbound or outbound')
  if (b.gmail_thread_id != null && typeof b.gmail_thread_id !== 'string') return fail('gmail_thread_id must be text')

  try {
    const r = await handleInbound({
      message_id: b.message_id, thread_id: b.thread_id,
      gmail_thread_id: typeof b.gmail_thread_id === 'string' && b.gmail_thread_id.trim() ? b.gmail_thread_id.trim() : null,
      direction: b.direction,
    })
    return NextResponse.json({ handled: r.handled, detail: r.detail ?? null })
  } catch (e) {
    return errorResponse(e)
  }
}
