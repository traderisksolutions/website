/**
 * Company-scoped view of email threads: every thread that belongs to the company, with the
 * direction of the last message (so "needs reply" is a fact, not a guess), who it waits on, the
 * latest AI summary and next action, and which Nexus cases the thread already sits in.
 *
 * Privacy (INB-002): a list read for a person passes `viewer`, and a colleague's private thread is
 * dropped and only counted (`hidden`). A cron or the server's own reads pass no viewer.
 */
import { sbTry, inChunks, enc, getCompanyThreadIds, sbAll } from './db'
import { personName } from '@/lib/format'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { waitingOn } from './waiting-on'
import type { CompanyThread } from './types'

type ThreadRow = {
  id: string; subject: string | null; display_subject: string | null; snippet: string | null; category: string | null; status: string
  message_count: number; last_message_at: string | null; contact_id: string | null
  contacts: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null
}
type MsgRow = { id: string; thread_id: string; direction: 'inbound' | 'outbound'; sent_at: string; from_address: string | null; subject: string | null }
type SummaryRow = { thread_id: string; summary: string | null; next_action: string | null; created_at: string }
type CaseLink = { thread_id: string; case_id: string }

const THREAD_SELECT = 'id,subject,display_subject,snippet,category,status,message_count,last_message_at,contact_id,contacts(id,first_name,last_name,email)'

/** The rows a person may see, and how many they may not. Pure. */
export function splitVisible<T extends { id: string }>(rows: readonly T[], visible: ReadonlySet<string>): { shown: T[]; hidden: number } {
  const shown = rows.filter(r => visible.has(r.id))
  return { shown, hidden: rows.length - shown.length }
}

/**
 * Threads filed under an insurer or partner that name this client (thread_insurers.client_company_id),
 * thread id → the insurer it sits under. Threads already filed under the client are left out.
 */
export async function insurerThreadsFor(companyId: string, exclude: ReadonlySet<string> = new Set()): Promise<Map<string, { id: string; name: string }>> {
  const links = await sbTry<{ thread_id: string; insurer_company_id: string | null }[]>(`thread_insurers?client_company_id=eq.${enc(companyId)}&select=thread_id,insurer_company_id&limit=1000`, [])
  const keep = links.filter(l => !exclude.has(l.thread_id))
  const insurerIds = Array.from(new Set(keep.map(l => l.insurer_company_id).filter((x): x is string => !!x)))
  const names = new Map<string, string>()
  if (insurerIds.length) {
    const rows = await inChunks(insurerIds, 100, c => sbAll<{ id: string; company_name: string | null }>(`companies?id=in.(${c.join(',')})&select=id,company_name`))
    for (const r of rows) names.set(r.id, r.company_name ?? 'Insurer')
  }
  const out = new Map<string, { id: string; name: string }>()
  for (const l of keep) if (!out.has(l.thread_id)) out.set(l.thread_id, { id: l.insurer_company_id ?? '', name: (l.insurer_company_id && names.get(l.insurer_company_id)) || 'Insurer' })
  return out
}

export async function listCompanyThreads(companyId: string, threadIds?: string[], opts: { via?: ReadonlyMap<string, { id: string; name: string }> } = {}): Promise<CompanyThread[]> {
  const via = opts.via ?? new Map<string, { id: string; name: string }>()
  const ids = Array.from(new Set([...(threadIds ?? await getCompanyThreadIds(companyId)), ...via.keys()]))
  if (ids.length === 0) return []

  const [threads, messages, summaries, caseLinks] = await Promise.all([
    inChunks(ids, 100, c => sbAll<ThreadRow>(`email_threads?id=in.(${c.join(',')})&deleted_at=is.null&select=${THREAD_SELECT}`)),
    inChunks(ids, 100, c => sbAll<MsgRow>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,direction,sent_at,from_address,subject&order=sent_at.desc`)),
    inChunks(ids, 100, c => sbAll<SummaryRow>(`thread_summaries?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,summary,next_action,created_at&order=created_at.desc`)),
    inChunks(ids, 100, c => sbAll<CaseLink>(`case_threads?thread_id=in.(${c.join(',')})&select=thread_id,case_id`)),
  ])

  const lastDir = new Map<string, MsgRow>()
  const lastInbound = new Map<string, MsgRow>()
  const counts = new Map<string, number>()
  const byThread = new Map<string, MsgRow[]>()
  for (const m of messages) {
    if (!lastDir.has(m.thread_id)) lastDir.set(m.thread_id, m)
    if (m.direction === 'inbound' && !lastInbound.has(m.thread_id)) lastInbound.set(m.thread_id, m)
    counts.set(m.thread_id, (counts.get(m.thread_id) ?? 0) + 1)
    byThread.set(m.thread_id, [...(byThread.get(m.thread_id) ?? []), m])
  }
  const latestSummary = new Map<string, SummaryRow>()
  for (const s of summaries) if (!latestSummary.has(s.thread_id)) latestSummary.set(s.thread_id, s)
  const casesByThread = new Map<string, string[]>()
  for (const l of caseLinks) casesByThread.set(l.thread_id, [...(casesByThread.get(l.thread_id) ?? []), l.case_id])

  return threads
    .map((t): CompanyThread => {
      const last = lastDir.get(t.id)
      const sum  = latestSummary.get(t.id)
      const v = via.get(t.id) ?? null
      return {
        id: t.id, subject: t.subject, display_subject: t.display_subject ?? null, snippet: t.snippet, category: t.category, status: t.status,
        // email_threads.message_count is stale (0 everywhere), so count the real rows.
        message_count: counts.get(t.id) ?? 0, last_message_at: t.last_message_at,
        lastDirection: last?.direction ?? null,
        lastInboundMessageId: lastInbound.get(t.id)?.id ?? null,
        needsReply: t.status === 'active' && last?.direction === 'inbound',
        contact: t.contacts ? { id: t.contacts.id, name: personName(t.contacts.first_name, t.contacts.last_name, null) === 'Unknown' ? null : personName(t.contacts.first_name, t.contacts.last_name), email: t.contacts.email } : null,
        summary: sum?.summary ?? null,
        nextAction: sum?.next_action ?? null,
        caseIds: casesByThread.get(t.id) ?? [],
        via: v,
        waitingOn: waitingOn([...(byThread.get(t.id) ?? [])].reverse(), !!v, t.status),
      }
    })
    .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
}

/**
 * The company's threads as one person may see them: those filed under the company plus, with
 * `insurers`, the insurer threads that name it (marked `via`). A colleague's private thread is
 * counted in `hidden`, never returned. `ownIds`: the visible thread ids filed under the company
 * itself (no `via`), for reads that must apply the same rule (the overview, the people).
 */
export async function listVisibleCompanyThreads(companyId: string, viewer: string | null, opts: { insurers?: boolean; threadIds?: string[] } = {}): Promise<{ threads: CompanyThread[]; hidden: number; ownIds: string[] }> {
  const own = opts.threadIds ?? await getCompanyThreadIds(companyId)
  const via = opts.insurers ? await insurerThreadsFor(companyId, new Set(own)) : new Map<string, { id: string; name: string }>()
  const all = Array.from(new Set([...own, ...via.keys()]))
  if (all.length === 0) return { threads: [], hidden: 0, ownIds: [] }
  const visible = await visibleThreadIds(all, viewer)
  const ids = all.filter(id => visible.has(id))
  const hidden = all.length - ids.length
  const keepVia = new Map(Array.from(via.entries()).filter(([id]) => visible.has(id)))
  const ownIds = ids.filter(id => !keepVia.has(id))
  if (ids.length === 0) return { threads: [], hidden, ownIds }
  const threads = await listCompanyThreads(companyId, ownIds, { via: keepVia })
  return { threads, hidden, ownIds }
}

/** Who each thread waits on, read from its messages (oldest first). `viaInsurer` = filed under an insurer. */
export async function waitingByThread(ids: readonly string[], viaInsurer: ReadonlySet<string>): Promise<Map<string, ReturnType<typeof waitingOn>>> {
  const out = new Map<string, ReturnType<typeof waitingOn>>()
  if (!ids.length) return out
  const [rows, msgs] = await Promise.all([
    inChunks([...ids], 100, c => sbAll<{ id: string; status: string | null }>(`email_threads?id=in.(${c.join(',')})&select=id,status`)),
    inChunks([...ids], 50, c => sbAll<MsgRow>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,direction,sent_at,from_address,subject&order=sent_at.asc&limit=5000`)),
  ])
  const byThread = new Map<string, MsgRow[]>()
  for (const m of msgs) byThread.set(m.thread_id, [...(byThread.get(m.thread_id) ?? []), m])
  for (const r of rows) out.set(r.id, waitingOn(byThread.get(r.id) ?? [], viaInsurer.has(r.id), r.status))
  return out
}
