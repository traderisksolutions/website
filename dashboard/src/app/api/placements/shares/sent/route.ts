/**
 * POST /api/placements/shares/sent { draft_id, gmail_thread_id?, gmail_message_id?, rfc822_message_id?, from_email?, subject? } → { share }
 * Called by the review screen right after /api/email/send succeeds for a comparison to the client:
 * keeps the share as sent (who, from which mailbox) and moves the request to waiting on the client.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { markShareSent } from '@/lib/placement/workflow'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Body = { draft_id?: unknown; gmail_thread_id?: unknown; gmail_message_id?: unknown; rfc822_message_id?: unknown; from_email?: unknown; subject?: unknown }
const optText = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isUuid(b.draft_id)) return fail('draft_id is required')
  try {
    const share = await markShareSent(b.draft_id, {
      gmailThreadId: optText(b.gmail_thread_id), gmailMessageId: optText(b.gmail_message_id),
      rfc822MessageId: optText(b.rfc822_message_id), fromEmail: optText(b.from_email), subject: optText(b.subject), actor,
    })
    // The email has already gone; a missing record is reported, never an error the sender sees.
    return NextResponse.json({ share, linked: !!share })
  } catch (e) {
    return errorResponse(e)
  }
}
