/**
 * The two rules every AI agent in this system obeys.
 *
 *   1. Agents draft. They never send.
 *   2. A fact taken from elsewhere is attached and cited, never quoted bare.
 *
 * Both are enforced here rather than left to each call site. The send path already required a
 * signed-in human, but nothing said so, nothing tested it, and the protection survived only
 * because /api/nexus/rfq/chase happens to forward the caller's cookie — so an automated caller
 * arrived without one and was refused by accident rather than by design. That is too fragile a
 * place to rest "an AI cannot email a client".
 */
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export class AgentMayNotSend extends Error {
  constructor(what = 'an AI agent') { super(`${what} may draft but never send`) }
}

/** Markers that identify a machine caller rather than a person at a keyboard. */
const MACHINE_MARKERS = ['x-cron-secret', 'x-agent', 'x-internal-secret']

export interface HumanCheck { ok: boolean; userId?: string; email?: string; reason?: string }

/**
 * Passes only for a request carrying a real staff session. A cron bearer, a service key or an
 * internal agent header is refused however valid it is elsewhere in the system: those credentials
 * authorise background work, and sending mail to a client is not background work.
 */
export async function requireHumanSender(req: NextRequest): Promise<HumanCheck> {
  const auth = req.headers.get('authorization') ?? ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
    return { ok: false, reason: 'cron credentials cannot send mail' }
  }
  for (const h of MACHINE_MARKERS) {
    if (req.headers.get(h)) return { ok: false, reason: `${h} identifies a machine caller` }
  }
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user?.email) return { ok: false, reason: 'no signed-in user' }
    return { ok: true, userId: user.id, email: user.email }
  } catch {
    return { ok: false, reason: 'session could not be read' }
  }
}

// ── Attach and cite ──────────────────────────────────────────────────────────────────────────

export interface Citation {
  n:            number
  source:       'message' | 'attachment'
  fileName:     string | null
  threadId:     string | null
  attachmentId: string | null
  sentAt:       string | null
}

export interface ProposedAttachment {
  attachmentId: string
  fileName:     string
  reason:       string
}

/**
 * Turns retrieved passages into the two things a reviewer needs: the files to attach, and a
 * line saying where each came from.
 *
 * A value such as an NRIC is never written into the body. A wrong one reads exactly like a right
 * one until somebody opens the file, so the file is attached and the reviewer checks it. Only
 * attachments are offered; a passage from an ordinary email is cited but has nothing to attach.
 */
export function buildCitations(chunks: {
  source: 'message' | 'attachment'
  file_name: string | null
  thread_id: string | null
  attachment_id: string | null
  sent_at: string | null
}[]): { citations: Citation[]; attachments: ProposedAttachment[] } {
  const citations: Citation[] = []
  const attachments: ProposedAttachment[] = []
  const seen = new Set<string>()

  chunks.forEach((c, i) => {
    citations.push({
      n: i + 1,
      source: c.source,
      fileName: c.file_name,
      threadId: c.thread_id,
      attachmentId: c.attachment_id,
      sentAt: c.sent_at,
    })
    if (c.source === 'attachment' && c.attachment_id && !seen.has(c.attachment_id)) {
      seen.add(c.attachment_id)
      attachments.push({
        attachmentId: c.attachment_id,
        fileName: c.file_name ?? 'document.pdf',
        reason: `cited as [${i + 1}]`,
      })
    }
  })
  return { citations, attachments }
}

/** The provenance block shown to the reviewer above the draft. Never sent to the client. */
export function renderProvenance(citations: Citation[]): string {
  if (citations.length === 0) return 'Drafted from this thread only. Nothing was drawn from elsewhere.'
  const lines = citations.map(c => {
    const what = c.source === 'attachment' ? `attachment "${c.fileName ?? 'file'}"` : 'an earlier email'
    const when = c.sentAt ? ` (${c.sentAt.slice(0, 10)})` : ''
    return `  [${c.n}] ${what}${when}`
  })
  return `Drawn from ${citations.length} place${citations.length === 1 ? '' : 's'} in this company's correspondence:\n${lines.join('\n')}`
}

/** Instruction appended to every agent prompt, so the model cites rather than asserts. */
export const CITE_INSTRUCTION = `
You are drafting a reply for a human to review and send. You are never sending it yourself.

When you use a fact from the supplied context, mark it with its number, like [2]. If the fact is
an identifier, a figure or a date taken from an attachment, do not write the value into the reply.
Say that the document is attached and cite it. A wrong identifier typed into an email is
indistinguishable from a right one until somebody opens the file.

If the context does not contain what was asked for, say so plainly. Do not infer it.`.trim()
