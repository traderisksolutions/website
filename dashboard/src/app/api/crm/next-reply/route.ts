/**
 * POST /api/crm/next-reply  { threadId }
 *
 * The client-relationship agent. Reads the thread, the company record and the company's archive,
 * then says what to do next and drafts the reply with its sources attached.
 *
 * Drafts only. Nothing here sends: /api/email/send refuses every non-human caller, and the
 * attachments returned are proposals for the reviewer to attach.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { nextReply } from '@/lib/agents/crm-agent'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const { threadId } = await req.json().catch(() => ({})) as { threadId?: string }
    if (!threadId) return NextResponse.json({ error: 'threadId is required.' }, { status: 400 })

    const r = await nextReply({ threadId })
    return NextResponse.json({
      situation: r.situation,
      nextAction: r.nextAction,
      openItems: r.openItems,
      draft: r.draft,
      citations: r.citations,
      proposedAttachments: r.attachments,
      provenance: r.provenance,
      model: r.model,
      draftId: r.draftId,
      read: r.read,
      archive: r.archive.map((c, i) => ({
        n: i + 1, source: c.source, fileName: c.file_name, threadId: c.thread_id,
        attachmentId: c.attachment_id, sentAt: c.sent_at, similarity: c.similarity,
        excerpt: (c.content ?? '').slice(0, 400),
      })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    // A missing company or thread is the caller's problem to fix, not a server fault.
    const status = /does not exist|has no company|could not be loaded/.test(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
