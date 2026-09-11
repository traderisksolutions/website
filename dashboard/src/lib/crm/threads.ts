/**
 * Company-scoped view of email threads: every thread that belongs to the company, with the
 * direction of the last message (so "needs reply" is a fact, not a guess), the latest AI
 * summary and next action, and which Nexus cases the thread already sits in.
 */
import { sbTry, inChunks, getCompanyThreadIds } from './db'
import { personName } from './format'
import type { CompanyThread } from './types'

type ThreadRow = {
  id: string; subject: string | null; snippet: string | null; category: string | null; status: string
  message_count: number; last_message_at: string | null; contact_id: string | null
  contacts: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null
}
type MsgRow = { id: string; thread_id: string; direction: 'inbound' | 'outbound'; sent_at: string }
type SummaryRow = { thread_id: string; summary: string | null; next_action: string | null; created_at: string }
type CaseLink = { thread_id: string; case_id: string }

const THREAD_SELECT = 'id,subject,snippet,category,status,message_count,last_message_at,contact_id,contacts(id,first_name,last_name,email)'

export async function listCompanyThreads(companyId: string, threadIds?: string[]): Promise<CompanyThread[]> {
  const ids = threadIds ?? await getCompanyThreadIds(companyId)
  if (ids.length === 0) return []

  const [threads, messages, summaries, caseLinks] = await Promise.all([
    inChunks(ids, 100, c => sbTry<ThreadRow[]>(`email_threads?id=in.(${c.join(',')})&select=${THREAD_SELECT}`, [])),
    inChunks(ids, 100, c => sbTry<MsgRow[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,direction,sent_at&order=sent_at.desc`, [])),
    inChunks(ids, 100, c => sbTry<SummaryRow[]>(`thread_summaries?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,summary,next_action,created_at&order=created_at.desc`, [])),
    inChunks(ids, 100, c => sbTry<CaseLink[]>(`case_threads?thread_id=in.(${c.join(',')})&select=thread_id,case_id`, [])),
  ])

  const lastDir = new Map<string, MsgRow>()
  const lastInbound = new Map<string, MsgRow>()
  const counts = new Map<string, number>()
  for (const m of messages) {
    if (!lastDir.has(m.thread_id)) lastDir.set(m.thread_id, m)
    if (m.direction === 'inbound' && !lastInbound.has(m.thread_id)) lastInbound.set(m.thread_id, m)
    counts.set(m.thread_id, (counts.get(m.thread_id) ?? 0) + 1)
  }
  const latestSummary = new Map<string, SummaryRow>()
  for (const s of summaries) if (!latestSummary.has(s.thread_id)) latestSummary.set(s.thread_id, s)
  const casesByThread = new Map<string, string[]>()
  for (const l of caseLinks) casesByThread.set(l.thread_id, [...(casesByThread.get(l.thread_id) ?? []), l.case_id])

  return threads
    .map((t): CompanyThread => {
      const last = lastDir.get(t.id)
      const sum  = latestSummary.get(t.id)
      return {
        id: t.id, subject: t.subject, snippet: t.snippet, category: t.category, status: t.status,
        // email_threads.message_count is stale (0 everywhere), so count the real rows.
        message_count: counts.get(t.id) ?? 0, last_message_at: t.last_message_at,
        lastDirection: last?.direction ?? null,
        lastInboundMessageId: lastInbound.get(t.id)?.id ?? null,
        needsReply: t.status === 'active' && last?.direction === 'inbound',
        contact: t.contacts ? { id: t.contacts.id, name: personName(t.contacts.first_name, t.contacts.last_name, null) === 'Unknown' ? null : personName(t.contacts.first_name, t.contacts.last_name), email: t.contacts.email } : null,
        summary: sum?.summary ?? null,
        nextAction: sum?.next_action ?? null,
        caseIds: casesByThread.get(t.id) ?? [],
      }
    })
    .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
}
