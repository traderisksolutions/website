/**
 * POST /api/placements/on-send { thread_id, recipients: string[] } → what was done
 * Fired by ingest after a TRS email goes out on a thread no placement holds: a request to an
 * insurer, or a reply on a client's request, is recorded (picked up mid-way when it already is).
 * Internal: x-internal-secret = CRON_SECRET, or staff.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { placeOnSend } from '@/lib/placement/auto'
import { errorResponse, fail, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  if (!(secret !== '' && req.headers.get('x-internal-secret') === secret)) {
    const unauthorized = await requireStaffOrCron(req)
    if (unauthorized) return unauthorized
  }
  const b = await readBody<{ thread_id?: unknown; recipients?: unknown }>(req)
  if (!b || !isUuid(b.thread_id)) return fail('thread_id is required')
  const recipients = Array.isArray(b.recipients) ? b.recipients.filter((r): r is string => typeof r === 'string' && r.includes('@')).slice(0, 50) : []
  try {
    return NextResponse.json(await placeOnSend(b.thread_id, recipients))
  } catch (e) {
    return errorResponse(e)
  }
}
