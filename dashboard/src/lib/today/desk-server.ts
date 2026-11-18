/**
 * Today's reads and writes: the list of threads each person added (today_threads), the unsent drafts
 * on those threads, and the saved Read per row. Grouping and sorting are pure in desk.ts.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { oneRecipient } from '@/lib/email/recipients'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import type { ReadPlan } from '@/lib/chief/read'
import { groupRows, readKey, sideOfAddress, type AddItem, type DeskDraft, type DeskRow, type DeskThread } from './desk'

type Row = Record<string, any>

const inList = (ids: readonly string[]) => `(${ids.map(i => `"${i}"`).join(',')})`
const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()
const nameOf = (c: Row | undefined) => c ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null : null
const isTrs = (a: string) => /@trade-risksol\.com$/i.test(a)

const LABEL: Record<string, string> = {
  gb_client_options: 'Employment benefits pricing', CASE_WORK: 'Prepared email', CONVERSATION: 'Reply',
  RENEWAL: 'Renewal email', POLICY_MOVEMENT: 'Movement email', NEXUS: 'Email',
}

export async function insurerDomains(): Promise<Set<string>> {
  const rows = await sbTry<Row[]>('companies?kind=eq.insurer&select=domains', [])
  return new Set(rows.flatMap(r => (r.domains ?? []) as string[]).map(d => String(d).toLowerCase()).filter(Boolean))
}

/** The rows on Today for one person, or for everyone. Threads the viewer may not see are left out. */
export async function loadDesk(viewer: string, who: string): Promise<{ rows: DeskRow[]; owners: string[] }> {
  const all = await sbTry<Row[]>('today_threads?removed_at=is.null&select=owner_email,thread_id,company_id,side,added_at&order=added_at.desc&limit=2000', [])
  const owners = Array.from(new Set(all.map(r => String(r.owner_email)))).sort()
  const mine = who === 'all' ? all : all.filter(r => r.owner_email === who)
  if (!mine.length) return { rows: [], owners }
  const visible = await visibleThreadIds(Array.from(new Set(mine.map(r => r.thread_id as string))), viewer)
  const listed = mine.filter(r => visible.has(r.thread_id))
  const ids = Array.from(new Set(listed.map(r => r.thread_id as string)))
  if (!ids.length) return { rows: [], owners }

  const [threads, msgs, domains] = await Promise.all([
    sbTry<Row[]>(`email_threads?id=in.${inList(ids)}&select=id,subject,display_subject,company_id,last_message_at`, []),
    sbTry<Row[]>(`email_messages?thread_id=in.${inList(ids)}&deleted_at=is.null&select=thread_id,direction,from_address,sent_at&order=sent_at.desc&limit=5000`, []),
    insurerDomains(),
  ])
  const threadBy = new Map(threads.map(t => [t.id as string, t]))
  const msgsBy = new Map<string, Row[]>()
  for (const m of msgs) msgsBy.set(m.thread_id, [...(msgsBy.get(m.thread_id) ?? []), m])

  const deskThreads: DeskThread[] = listed.map(r => {
    const t = threadBy.get(r.thread_id) ?? {}
    const ms = msgsBy.get(r.thread_id) ?? []
    const last = ms[0]
    return {
      threadId: r.thread_id, subject: t.display_subject || t.subject || '(no subject)', side: r.side, owner: r.owner_email,
      companyId: r.company_id ?? t.company_id ?? null, lastAt: last?.sent_at ?? t.last_message_at ?? null,
      lastFrom: last ? bare(last.from_address) : null, lastInbound: last?.direction === 'inbound' && !isTrs(bare(last.from_address)),
      messages: ms.length, addedAt: r.added_at,
    }
  })

  // Unsent drafts written on a thread, or anchored to one (a new email to an insurer has no thread yet).
  // Requests to insurers from a placement stay with the placement, where their dispatch is recorded.
  const raw = await sbTry<Row[]>(`ai_drafts?or=(thread_id.in.${inList(ids)},context_used->>thread_id.in.${inList(ids)})&status=in.(pending,draft)&deleted_at=is.null&or=(email_type.is.null,email_type.neq.PLACEMENT_REQUEST)&select=id,thread_id,to_email,cc,subject,body,email_type,attachments,work_item_id,context_used,created_at&order=created_at.asc&limit=500`, [])
  const fallbackTo = new Map(deskThreads.map(t => [t.threadId, t.lastInbound ? t.lastFrom : null]))
  const shaped = raw.map(d => {
    const ctx = (d.context_used ?? {}) as Row
    const anchor = (ctx.thread_id as string | undefined) ?? null
    const r = oneRecipient(d.to_email || fallbackTo.get(d.thread_id ?? anchor ?? '') || null, d.cc)
    return { d, r, ctx, anchor }
  })
  const emails = Array.from(new Set(shaped.map(x => x.r.to).filter(Boolean)))
  const people = emails.length ? await sbTry<Row[]>(`contacts?email=in.${inList(emails)}&select=email,first_name,last_name&limit=500`, []) : []
  const personBy = new Map(people.map(c => [String(c.email).toLowerCase(), nameOf(c)]))
  const drafts: DeskDraft[] = shaped.map(({ d, r, ctx, anchor }) => ({
    id: d.id, side: sideOfAddress(r.to, domains), threadId: d.thread_id ?? null, anchorThreadId: anchor,
    to: r.to, person: personBy.get(r.to) ?? null, cc: r.cc.join(', '), subject: d.subject ?? '', body: d.body ?? '',
    label: ctx.kind === 'bar_chaser' ? 'Chaser' : ctx.kind === 'read_step' ? String(ctx.title ?? 'Next step') : LABEL[d.email_type as string] ?? 'Email',
    attachments: Array.isArray(d.attachments) ? d.attachments.filter((a: Row) => a?.storage_url) : [],
    removed: [...r.removed, ...((ctx.removed_recipients as string[] | undefined) ?? [])],
    workItemId: d.work_item_id ?? null, createdAt: d.created_at,
  }))

  const companyIds = Array.from(new Set(deskThreads.map(t => t.companyId).filter((x): x is string => !!x)))
  const companies = companyIds.length ? await sbTry<Row[]>(`companies?id=in.${inList(companyIds)}&select=id,company_name`, []) : []
  const names = new Map(companies.map(c => [c.id as string, c.company_name as string]))

  const rows0 = groupRows(deskThreads, [], names, new Map())
  const keys = rows0.map(r => readKey(r.key))
  const saved = keys.length ? await sbTry<Row[]>(`app_settings?key=in.${inList(keys)}&select=key,value`, []) : []
  const reads = new Map<string, ReadPlan>()
  for (const s of saved) { try { reads.set(String(s.key).slice('today_read:'.length), JSON.parse(s.value)) } catch { /* a bad entry reads as none */ } }
  return { rows: groupRows(deskThreads, drafts, names, reads), owners }
}

/** Puts threads on a person's Today. Adding a removed thread again brings it back. */
export async function addThreads(owner: string, items: readonly AddItem[]): Promise<number> {
  const now = new Date().toISOString()
  await sb('today_threads?on_conflict=owner_email,thread_id', {
    method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify(items.map(i => ({ owner_email: owner, thread_id: i.threadId, company_id: i.companyId, side: i.side, added_at: now, removed_at: null }))),
  })
  return items.length
}

/** Takes threads off a person's Today. The threads and their drafts stay where they are. */
export async function removeThreads(owner: string, threadIds: readonly string[]): Promise<void> {
  if (!threadIds.length) return
  await sb(`today_threads?owner_email=eq.${enc(owner)}&thread_id=in.${inList(threadIds)}&removed_at=is.null`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ removed_at: new Date().toISOString() }),
  })
}

/** The threads of one row, for the Read: the person's own list, client by client. */
export async function rowThreads(owner: string, companyId: string | null, threadIds: readonly string[]): Promise<Row[]> {
  const q = companyId ? `company_id=eq.${enc(companyId)}` : `thread_id=in.${inList(threadIds)}`
  return sbTry<Row[]>(`today_threads?owner_email=eq.${enc(owner)}&${q}&removed_at=is.null&select=thread_id,side,company_id`, [])
}
