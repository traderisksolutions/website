/**
 * Today (19 Nov 2026): the threads a person put on their list, grouped by client, with the unsent
 * drafts on those threads split into To client and To insurer. A person clears the list by editing
 * and sending; nothing joins the list unless a person adds it. Pure; the reads are in desk-server.ts.
 */
import type { ReadPlan } from '@/lib/chief/read'

export type DeskSide = 'client' | 'insurer'

export type DeskThread = {
  threadId: string; subject: string; side: DeskSide; companyId: string | null; owner: string
  lastAt: string | null; lastFrom: string | null; lastInbound: boolean; messages: number; addedAt: string
}
export type DeskAttachment = { filename: string; mime_type?: string; storage_url: string }
export type DeskDraft = {
  id: string; side: DeskSide; threadId: string | null; anchorThreadId: string | null
  to: string; person: string | null; cc: string; subject: string; body: string; label: string
  attachments: DeskAttachment[]; removed: string[]; workItemId: string | null; createdAt: string
}
export type DeskRow = {
  key: string; owner: string; companyId: string | null; companyName: string
  threads: DeskThread[]; drafts: DeskDraft[]; read: ReadPlan | null; lastAt: string | null
}

/** Whom an address belongs to: an insurer when its domain is an insurer's, else the client. */
export function sideOfAddress(email: string | null | undefined, insurerDomains: ReadonlySet<string>): DeskSide {
  const domain = String(email ?? '').trim().toLowerCase().split('@')[1] ?? ''
  if (!domain) return 'client'
  for (const d of insurerDomains) if (domain === d || domain.endsWith(`.${d}`)) return 'insurer'
  return 'client'
}

/** One row per owner and client. A thread with no client stands alone. */
export function rowKey(owner: string, companyId: string | null, threadId: string): string {
  return companyId ? `${owner}|${companyId}` : `${owner}|thread:${threadId}`
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

/** Threads and drafts into rows. A draft belongs to the row holding its thread or its anchor thread. */
export function groupRows(
  threads: readonly DeskThread[], drafts: readonly DeskDraft[],
  names: ReadonlyMap<string, string>, reads: ReadonlyMap<string, ReadPlan>,
): DeskRow[] {
  const rows = new Map<string, DeskRow>()
  const rowOfThread = new Map<string, DeskRow[]>()
  for (const t of threads) {
    const key = rowKey(t.owner, t.companyId, t.threadId)
    let row = rows.get(key)
    if (!row) {
      row = { key, owner: t.owner, companyId: t.companyId, companyName: (t.companyId && names.get(t.companyId)) || t.subject || 'No client', threads: [], drafts: [], read: reads.get(key) ?? null, lastAt: null }
      rows.set(key, row)
    }
    row.threads.push(t)
    row.lastAt = later(row.lastAt, t.lastAt)
    rowOfThread.set(t.threadId, [...(rowOfThread.get(t.threadId) ?? []), row])
  }
  for (const d of drafts) {
    // On Everyone, two people can hold the same thread: the draft shows on each of their rows.
    const owners = rowOfThread.get(d.threadId ?? '') ?? rowOfThread.get(d.anchorThreadId ?? '') ?? []
    for (const row of owners) if (!row.drafts.some(x => x.id === d.id)) row.drafts.push(d)
  }
  for (const r of rows.values()) {
    r.threads.sort((a, b) => String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? '')))
    r.drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  return sortRows([...rows.values()])
}

/** Most drafts to send first; then the client who wrote last waits longest; then latest activity. */
export function sortRows(rows: DeskRow[]): DeskRow[] {
  const waiting = (r: DeskRow) => r.threads.some(t => t.lastInbound)
  return [...rows].sort((a, b) =>
    b.drafts.length - a.drafts.length
    || Number(waiting(b)) - Number(waiting(a))
    || String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? '')))
}

/** By email: every unsent draft across the rows once, oldest first, each with its client. */
export function emailList(rows: readonly DeskRow[]): (DeskDraft & { rowKey: string; companyName: string })[] {
  const seen = new Set<string>()
  const out: (DeskDraft & { rowKey: string; companyName: string })[] = []
  for (const r of rows) for (const d of r.drafts) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    out.push({ ...d, rowKey: r.key, companyName: r.companyName })
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** The app_settings key a row's read is kept under. */
export const readKey = (key: string) => `today_read:${key}`

export type AddItem = { threadId: string; side: DeskSide; companyId: string | null }

/** An add request made safe: known sides, uuids, one entry per thread. Returns an error in words. */
export function addItemsFrom(body: unknown): { items: AddItem[] } | { error: string } {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const list = (body as { threads?: unknown })?.threads
  if (!Array.isArray(list) || !list.length) return { error: 'Pick at least one thread.' }
  if (list.length > 50) return { error: 'Add at most 50 threads at a time.' }
  const items = new Map<string, AddItem>()
  for (const raw of list as Record<string, unknown>[]) {
    const threadId = String(raw?.threadId ?? '')
    if (!UUID.test(threadId)) return { error: 'A thread id is not valid.' }
    if (raw.side !== 'client' && raw.side !== 'insurer') return { error: 'Say for each thread whether it is with the client or an insurer.' }
    const companyId = raw.companyId == null || raw.companyId === '' ? null : String(raw.companyId)
    if (companyId && !UUID.test(companyId)) return { error: 'A client id is not valid.' }
    items.set(threadId, { threadId, side: raw.side, companyId })
  }
  return { items: [...items.values()] }
}
