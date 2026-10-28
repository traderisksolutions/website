/**
 * POST /api/placements/unmatched/[id] { dispatch_ids: uuid[] } | { ignore: true } → { handled, detail }
 * A broker places a queued reply: the agent reads it against those requests and files every
 * price in it, exactly as if it had arrived on the request's thread. ignore closes it unread.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveUnmatched } from '@/lib/placement/workflow'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Body = { dispatch_ids?: unknown; ignore?: unknown }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Id is not valid')
  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  const ignore = b.ignore === true
  if (!ignore && (!Array.isArray(b.dispatch_ids) || b.dispatch_ids.length === 0 || !b.dispatch_ids.every(isUuid))) return fail('dispatch_ids must list at least one request, or send ignore: true')
  try {
    const r = await resolveUnmatched(id, ignore ? null : [...new Set(b.dispatch_ids as string[])], actor)
    return NextResponse.json({ handled: r.handled, detail: r.detail ?? null })
  } catch (e) {
    return errorResponse(e)
  }
}
