/**
 * POST /api/ask  { question, companyId?, threadIds?, kind? }
 *
 * The Ask AI agent. Answers from the live web, and from one company's own correspondence when a
 * company is named. Always returns its sources; says plainly when it has none.
 *
 * Read-only: it answers, it never writes to a thread and never sends anything.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { ask } from '@/lib/agents/ask-ai'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const body = await req.json().catch(() => ({})) as {
      question?: string; companyId?: string | null; threadIds?: string[] | null
      threadId?: string | null; kind?: string
    }
    const question = (body.question ?? '').trim()
    if (!question) return NextResponse.json({ error: 'Ask a question.' }, { status: 400 })
    if (question.length > 4000) return NextResponse.json({ error: 'That question is too long — trim it to 4000 characters.' }, { status: 400 })

    const r = await ask({
      question,
      // A threadId scopes the answer to that one conversation and its attachments. A companyId
      // widens it to the whole client archive. The thread-side button sends the former; the
      // standalone page sends the latter.
      threadId:  body.threadId ?? null,
      companyId: body.companyId ?? null,
      threadIds: Array.isArray(body.threadIds) && body.threadIds.length ? body.threadIds : null,
      feature: body.kind === 'clause' ? 'ask_ai_clause' : 'ask_ai_grounded',
    })

    return NextResponse.json({
      answer:   r.answer,
      sources:  r.sources,
      queries:  r.queries,
      grounded: r.grounded,
      warning:  r.warning,
      model:    r.model,
      // The archive passages are returned so the reader can open what was quoted, exactly as the
      // drafter does. Content is included because a citation nobody can read is not a citation.
      archive: r.archive.map((c, i) => ({
        n: i + 1,
        source: c.source,
        fileName: c.file_name,
        threadId: c.thread_id,
        attachmentId: c.attachment_id,
        sentAt: c.sent_at,
        similarity: c.similarity,
        excerpt: (c.content ?? '').slice(0, 400),
      })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
