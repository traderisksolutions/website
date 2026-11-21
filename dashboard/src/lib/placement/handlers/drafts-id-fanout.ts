/**
 * POST /api/placements/drafts/[id]/fanout { subject, body } → { clones: [{ draft_id, dispatch_id, to_email, insurer_name }] }
 * A placement request draft is shared by every dispatch of its line. The review screen posts the
 * reviewed text here first; each clone is then approved, sent and marked sent on its own.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { fanoutDraft } from '@/lib/placement/workflow'
import { errorResponse, fail, gate, isText, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

type Body = { subject?: unknown; body?: unknown }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Draft id is not valid')
  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isText(b.subject)) return fail('subject is required')
  if (!isText(b.body)) return fail('body is required')

  try {
    const { clones } = await fanoutDraft(id, { subject: b.subject, body: b.body }, actor)
    return NextResponse.json({ clones })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/not pending|cannot be fanned out|No dispatch is waiting/i.test(msg)) return fail(msg, 409)
    return errorResponse(e)
  }
}
