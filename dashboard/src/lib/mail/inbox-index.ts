/**
 * The reads behind the Inbox pages (src/lib/mail/inbox-list.ts): one row per thread, for every
 * thread, with its mailboxes and who wrote last, and which of them a viewer may see. Kept for 60
 * seconds per server so More and the view pills do not read everything again; Refresh asks for a
 * fresh read. Who wrote last skips auto-replies by subject and sender (bodies are not read here:
 * reading every body takes 20 seconds); the rows on a page carry the full reading.
 */
import { SB_URL, sbHeaders } from '@/lib/sb'
import { fetchAllRows } from '@/lib/postgrest-all'
import { lastRealMessage } from '@/lib/threads/waiting'
import { canSeeThread, isShared, OPERATIONS_MAILBOX } from './visibility'
import type { IndexRow } from './inbox-list'

const TTL = 60_000
const H = () => sbHeaders()

async function get<T>(path: string): Promise<T[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H(), cache: 'no-store', signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`Inbox read failed (${r.status}) ${path.split('?')[0]}`)
  const j = await r.json()
  return Array.isArray(j) ? j : []
}

/** A few requests at a time: one per chunk of ids. */
async function pooled<T>(ids: readonly string[], size: number, fn: (chunk: string[]) => Promise<T[]>, width = 6): Promise<T[]> {
  const chunks = Array.from({ length: Math.ceil(ids.length / size) }, (_, i) => ids.slice(i * size, i * size + size))
  const out: T[][] = []
  let next = 0
  await Promise.all(Array.from({ length: Math.min(width, chunks.length) }, async () => {
    while (next < chunks.length) { const k = next++; out[k] = await fn(chunks[k]) }
  }))
  return out.flat()
}

/** Thread ids on which this address is a sender or a recipient. */
async function threadsWith(ids: readonly string[], email: string): Promise<Set<string>> {
  const rows = await pooled(ids, 100, async c => {
    const [parts, sent] = await Promise.all([
      get<{ thread_id: string }>(`email_participants?thread_id=in.(${c.join(',')})&email=eq.${encodeURIComponent(email)}&select=thread_id`),
      get<{ thread_id: string }>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&from_address=ilike.${encodeURIComponent('*' + email + '*')}&select=thread_id`),
    ])
    return [...parts, ...sent]
  })
  return new Set(rows.map(r => r.thread_id))
}

type Base = { at: number; rows: IndexRow[] }
let base: Base | null = null
let building: Promise<Base> | null = null
const viewers = new Map<string, { at: number; on: Set<string> }>()

async function build(): Promise<Base> {
  type T = { id: string; last_message_at: string; company_id: string | null; companies: { owner_email: string | null } | null }
  type M = { thread_id: string; direction: string; from_address: string | null; subject: string | null; sent_at: string | null }
  const aliases = async () => {
    const out: { thread_id: string; mailbox: string }[] = []
    for (let o = 0; ; o += 1000) {
      const page = await get<{ thread_id: string; mailbox: string }>(`email_thread_aliases?select=thread_id,mailbox&order=thread_id,mailbox&limit=1000&offset=${o}`)
      out.push(...page)
      if (page.length < 1000) return out
    }
  }
  const [threads, alias, msgs] = await Promise.all([
    fetchAllRows<T>(`${SB_URL}/rest/v1/email_threads?deleted_at=is.null&select=id,last_message_at,company_id,companies(owner_email)&order=last_message_at.desc`, H()),
    aliases(),
    fetchAllRows<M & { id: string }>(`${SB_URL}/rest/v1/email_messages?deleted_at=is.null&select=id,thread_id,direction,from_address,subject,sent_at&order=sent_at.asc`, H()),
  ])
  const boxes = new Map<string, string[]>()
  for (const a of alias) { const l = boxes.get(a.thread_id) ?? []; if (!l.includes(a.mailbox)) l.push(a.mailbox); boxes.set(a.thread_id, l) }
  // operations@ on the email holds a copy too (its reads recorded no alias before 10 Nov 2026).
  const privateIds = Array.from(boxes.entries()).filter(([, m]) => !m.includes(OPERATIONS_MAILBOX)).map(([id]) => id)
  for (const id of await threadsWith(privateIds, OPERATIONS_MAILBOX)) boxes.get(id)?.push(OPERATIONS_MAILBOX)
  const byThread = new Map<string, M[]>()
  for (const m of msgs) { const l = byThread.get(m.thread_id); if (l) l.push(m); else byThread.set(m.thread_id, [m]) }
  const rows: IndexRow[] = threads.map(t => {
    const last = lastRealMessage(byThread.get(t.id) ?? [])?.direction
    return {
      id: t.id, at: t.last_message_at, companyId: t.company_id ?? null, owner: t.companies?.owner_email ?? null,
      mailboxes: boxes.get(t.id) ?? [], last: last === 'inbound' || last === 'outbound' ? last : null,
    }
  })
  return { at: Date.now(), rows }
}

/** Every thread's row. `fresh` reads again (Refresh, or after filing). */
export async function inboxIndex(fresh = false): Promise<IndexRow[]> {
  if (!fresh && base && Date.now() - base.at < TTL) return base.rows
  if (!building) building = build().then(b => { base = b; viewers.clear(); return b }).finally(() => { building = null })
  return (await building).rows
}

/** The rows this viewer may see (src/lib/mail/visibility.ts). viewer null = a cron call: every row. */
export async function visibleRows(rows: IndexRow[], viewer: string | null | undefined, fresh = false): Promise<IndexRow[]> {
  if (viewer == null) return rows
  const v = viewer.toLowerCase()
  const maybe = rows.filter(r => !canSeeThread(v, r.mailboxes)).map(r => r.id)
  let cached = viewers.get(v)
  if (fresh || !cached || Date.now() - cached.at > TTL) {
    cached = { at: Date.now(), on: maybe.length ? await threadsWith(maybe, v) : new Set() }
    viewers.set(v, cached)
  }
  const on = cached.on
  return rows.filter(r => isShared(r.mailboxes) || canSeeThread(v, r.mailboxes, on.has(r.id) ? [v] : []))
}

/** Drops the kept rows, so the next read sees a filing just made. */
export function forgetInboxIndex() { base = null; viewers.clear() }
