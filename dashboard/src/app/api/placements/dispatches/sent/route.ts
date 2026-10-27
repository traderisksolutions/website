/**
 * POST /api/placements/dispatches/sent { draft_id, gmail_thread_id, gmail_message_id } → { dispatches }
 * Called by the review screen right after /api/email/send succeeds for a PLACEMENT_REQUEST draft:
 * links the Gmail thread to every dispatch on that draft and starts the chase clock.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { markSent } from '@/lib/placement/workflow'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

type Body = { draft_id?: unknown; gmail_thread_id?: unknown; gmail_message_id?: unknown }
const optText = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isUuid(b.draft_id)) return fail('draft_id is required')
  if (b.gmail_thread_id != null && typeof b.gmail_thread_id !== 'string') return fail('gmail_thread_id must be text')
  if (b.gmail_message_id != null && typeof b.gmail_message_id !== 'string') return fail('gmail_message_id must be text')

  try {
    const dispatches = await markSent(b.draft_id, { gmailThreadId: optText(b.gmail_thread_id), gmailMessageId: optText(b.gmail_message_id), actor })
    if (dispatches.length === 0) return fail('No dispatch is linked to that draft', 404)
    return NextResponse.json({ dispatches })
  } catch (e) {
    return errorResponse(e)
  }
}
