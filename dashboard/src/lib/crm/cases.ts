/**
 * Nexus cases that belong to a company. Two sources merged: cases.company_id (direct, once the
 * 20260910 migration has landed) and cases reached through case_threads from the company's own
 * threads (works today, and catches cases created before the column existed).
 */
import { sbTry, inChunks, enc } from './db'
import type { CaseRow } from './types'

type CaseBase = { id: string; name: string; description: string | null; status: string; company_id?: string | null; created_at: string; updated_at: string }
type CaseLink = { case_id: string; thread_id: string }

export async function listCompanyCaseIds(companyId: string, threadIds: string[]): Promise<string[]> {
  const [direct, viaThreads] = await Promise.all([
    sbTry<{ id: string }[]>(`cases?company_id=eq.${enc(companyId)}&select=id`, []),
    threadIds.length ? inChunks(threadIds, 100, c => sbTry<CaseLink[]>(`case_threads?thread_id=in.(${c.join(',')})&select=case_id,thread_id`, [])) : Promise.resolve([] as CaseLink[]),
  ])
  return Array.from(new Set([...direct.map(r => r.id), ...viaThreads.map(r => r.case_id)]))
}

export async function listCompanyCases(companyId: string, threadIds: string[]): Promise<CaseRow[]> {
  const caseIds = await listCompanyCaseIds(companyId, threadIds)
  if (caseIds.length === 0) return []

  const [cases, links] = await Promise.all([
    inChunks(caseIds, 100, c => sbTry<CaseBase[]>(`cases?id=in.(${c.join(',')})&select=*&order=updated_at.desc`, [])),
    inChunks(caseIds, 100, c => sbTry<CaseLink[]>(`case_threads?case_id=in.(${c.join(',')})&select=case_id,thread_id`, [])),
  ])

  const threadsByCase = new Map<string, string[]>()
  for (const l of links) threadsByCase.set(l.case_id, [...(threadsByCase.get(l.case_id) ?? []), l.thread_id])
  const allThreadIds = Array.from(new Set(links.map(l => l.thread_id)))
  const lastByThread = new Map<string, string | null>()
  if (allThreadIds.length) {
    const rows = await inChunks(allThreadIds, 100, c => sbTry<{ id: string; last_message_at: string | null }[]>(`email_threads?id=in.(${c.join(',')})&select=id,last_message_at`, []))
    for (const r of rows) lastByThread.set(r.id, r.last_message_at)
  }

  return cases
    .map((c): CaseRow => {
      const tids = threadsByCase.get(c.id) ?? []
      const last = tids.map(t => lastByThread.get(t) ?? null).filter((x): x is string => !!x).sort().pop() ?? null
      return { id: c.id, name: c.name, description: c.description, status: c.status, company_id: c.company_id ?? null, created_at: c.created_at, updated_at: c.updated_at, thread_count: tids.length, last_activity: last }
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}
