/**
 * The email search index (thread_search, docs/search.md): build a thread's row, refresh one thread
 * after ingest, and search. Every read here is bounded: one thread's rows to refresh, two indexed
 * lookups to search. When the table is not there yet (the migration is not applied) refresh does
 * nothing and search answers null, and the caller uses the old search.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { ownWords } from '@/lib/admin/b/relay/intent'
import { mailboxesByThread, ownersOf } from '@/lib/mail/visibility-server'
import { inboxLabel, ringFence } from '@/lib/mail/ring-fence'
import { isNoise } from '@/lib/documents/taxonomy'
import { conversationsOf, type ConvMessage } from '@/lib/mail/conversations'
import { insurerNames } from '@/lib/today/desk-server'
import {
  fileHits, hasEvery, listable, parsePeople, peopleHits, peopleText, searchTerms, viaOf,
  type CompanyHit, type IndexRow, type Person, type SearchAnswer, type ThreadHit,
} from './query'

type Row = Record<string, any>
const inList = (ids: readonly string[]) => `(${ids.map(i => `"${i}"`).join(',')})`
const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()
const nameIn = (a: string | null | undefined) => (String(a ?? '').includes('<') ? String(a).split('<')[0].replace(/["']/g, '').trim() : '') || null

export const BODY_CAP = 4_000
const MESSAGES_PER_THREAD = 12

// ── Is the table there ───────────────────────────────────────────────────────────────────────────

let ready: { ok: boolean; at: number } | null = null
/** Whether thread_search exists. Asked at most once every five minutes per server. */
export async function indexReady(): Promise<boolean> {
  if (ready && Date.now() - ready.at < 300_000) return ready.ok
  try { await sb('thread_search?select=thread_id&limit=1'); ready = { ok: true, at: Date.now() } }
  catch (e) { ready = { ok: !/42P01|does not exist|404/.test(String(e)), at: Date.now() } }
  return ready.ok
}

// ── Build rows ───────────────────────────────────────────────────────────────────────────────────

export type SearchRow = {
  thread_id: string; company_id: string | null; mailboxes: string[]; subject: string; people: string
  attachments: string; body: string; last_message_at: string | null; updated_at: string
}

/**
 * The index rows of a batch of threads (at most 100): six reads per batch, not per thread.
 * Deleted threads come back in `gone`.
 */
export async function buildRows(threadIds: readonly string[]): Promise<{ rows: SearchRow[]; gone: string[] }> {
  const ids = Array.from(new Set(threadIds)).slice(0, 100)
  if (!ids.length) return { rows: [], gone: [] }
  const [threads, msgs, parts, files, boxes] = await Promise.all([
    sb<Row[]>(`email_threads?id=in.${inList(ids)}&select=id,subject,display_subject,company_id,last_message_at,deleted_at`),
    sb<Row[]>(`email_messages?thread_id=in.${inList(ids)}&deleted_at=is.null&select=thread_id,from_address,subject,body_text,sent_at&order=sent_at.desc&limit=${ids.length * MESSAGES_PER_THREAD}`),
    sb<Row[]>(`email_participants?thread_id=in.${inList(ids)}&select=thread_id,email,name&limit=${ids.length * 80}`),
    sb<Row[]>(`email_attachments?thread_id=in.${inList(ids)}&select=thread_id,filename,mime_type&limit=${ids.length * 60}`),
    mailboxesByThread(ids),
  ])
  const emails = Array.from(new Set([...parts.map(p => bare(p.email)), ...msgs.map(m => bare(m.from_address))].filter(e => e.includes('@'))))
  const contacts: Row[] = []
  for (let i = 0; i < emails.length; i += 100) contacts.push(...await sbTry<Row[]>(`contacts?email=in.${inList(emails.slice(i, i + 100).map(enc))}&select=email,first_name,last_name`, []))
  const known = new Map(contacts.map(c => [String(c.email).toLowerCase(), [c.first_name, c.last_name].filter(Boolean).join(' ').trim()]))
  const now = new Date().toISOString()
  const live = new Map(threads.filter(t => !t.deleted_at).map(t => [t.id as string, t]))
  const rows: SearchRow[] = []
  for (const id of ids) {
    const t = live.get(id)
    if (!t) continue
    const people: Person[] = []
    const add = (email: string, name: string | null) => {
      if (!email.includes('@')) return
      const n = (name ?? '').trim() || known.get(email) || null
      const cur = people.find(p => p.email === email)
      if (!cur) people.push({ name: n, email }); else if (!cur.name && n) cur.name = n
    }
    const mine = msgs.filter(m => m.thread_id === id)
    for (const m of mine) add(bare(m.from_address), nameIn(m.from_address))
    for (const p of parts.filter(p => p.thread_id === id)) add(bare(p.email), (p.name ?? '').replace(/["']/g, '').trim() || null)
    const names = Array.from(new Set(files.filter(f => f.thread_id === id && !isNoise(String(f.filename ?? ''), f.mime_type)).map(f => String(f.filename).trim()).filter(Boolean)))
    let body = ''
    for (const m of mine.slice(0, MESSAGES_PER_THREAD)) {
      if (body.length >= BODY_CAP) break
      const text = [m.subject, ownWords(m.body_text)].filter(Boolean).join('\n').replace(/\s+/g, ' ').trim()
      body = `${body}${body ? '\n' : ''}${text}`.slice(0, BODY_CAP)
    }
    rows.push({
      thread_id: id, company_id: t.company_id ?? null, mailboxes: boxes.get(id) ?? [],
      subject: String(t.display_subject || t.subject || '').slice(0, 500), people: peopleText(people).slice(0, 8_000),
      attachments: names.join('\n').slice(0, 8_000), body, last_message_at: t.last_message_at ?? mine[0]?.sent_at ?? null, updated_at: now,
    })
  }
  return { rows, gone: ids.filter(id => !live.has(id)) }
}

/** Writes built rows and removes the rows of deleted threads. */
export async function writeRows(rows: readonly SearchRow[], gone: readonly string[] = []): Promise<void> {
  if (rows.length) await sb('thread_search?on_conflict=thread_id', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify(rows) })
  if (gone.length) await sb(`thread_search?thread_id=in.${inList(gone)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}

/** One thread's row, refreshed after ingest stored a message on it. Nothing when the table is not there. */
export async function refreshThreadSearch(threadId: string): Promise<'stored' | 'removed' | 'skipped'> {
  if (!/^[0-9a-f-]{36}$/i.test(threadId) || !(await indexReady())) return 'skipped'
  const { rows, gone } = await buildRows([threadId])
  await writeRows(rows, gone)
  return rows.length ? 'stored' : 'removed'
}

// ── Search ───────────────────────────────────────────────────────────────────────────────────────

const COLS = 'thread_id,company_id,mailboxes,subject,people,attachments,last_message_at'

/**
 * Searches every connected inbox and Operations. Threads the viewer may not open are listed when
 * the words are in their subject, people or file names (the ring-fence: everyone sees that a
 * thread exists), never for the text of their mail. Null when the index is not there.
 */
export async function searchThreads(q: string, viewer: string | null, opts: { limit?: number; openOnly?: boolean } = {}): Promise<SearchAnswer | null> {
  if (!(await indexReady())) return null
  const terms = searchTerms(q)
  const empty: SearchAnswer = { index: true, threads: [], people: [], companies: [], files: [] }
  if (!terms.words.length) return empty
  const limit = Math.min(200, opts.limit ?? 40)
  const [byText, byName, companies] = await Promise.all([
    terms.tsquery ? sbTry<IndexRow[]>(`thread_search?doc=fts(simple).${enc(terms.tsquery)}&select=${COLS}&order=last_message_at.desc.nullslast&limit=${limit + 40}`, []) : Promise.resolve([] as IndexRow[]),
    terms.trigram ? sbTry<IndexRow[]>(`thread_search?names=ilike.${enc(`*${terms.trigram}*`)}&select=${COLS}&order=last_message_at.desc.nullslast&limit=${limit + 40}`, []) : Promise.resolve([] as IndexRow[]),
    terms.trigram ? sbTry<Row[]>(`companies?company_name=ilike.${enc(`*${terms.trigram}*`)}&select=id,company_name,kind&limit=12`, []) : Promise.resolve([] as Row[]),
  ])
  const rows = new Map<string, IndexRow>()
  for (const r of byText) rows.set(r.thread_id, r)
  for (const r of byName) if (!rows.has(r.thread_id) && hasEvery([r.subject, r.people, r.attachments].join(' '), terms.words)) rows.set(r.thread_id, r)

  const shaped = [...rows.values()].map(r => {
    const people = parsePeople(r.people)
    const boxes = r.mailboxes ?? []
    const fence = ringFence(viewer, boxes, people.map(p => p.email))
    const canOpen = fence.open
    const owner: string | null = fence.open ? null : fence.name
    return { r, people, boxes, canOpen, owner }
  }).filter(x => listable(x.r, terms.words, x.canOpen) && (!opts.openOnly || x.canOpen))
    .sort((a, b) => String(b.r.last_message_at ?? '').localeCompare(String(a.r.last_message_at ?? ''))).slice(0, limit)

  // Owners by name from app_users (visibility-server.ts ownersOf), the first name shown.
  const owners = await ownersOf(shaped.filter(x => !x.canOpen).map(x => x.r.thread_id)).catch(() => new Map<string, string>())
  for (const x of shaped) if (!x.canOpen && owners.get(x.r.thread_id)) x.owner = owners.get(x.r.thread_id)!.split(/[\s,]+/)[0]
  const companyIds = Array.from(new Set(shaped.map(x => x.r.company_id).filter((x): x is string => !!x)))
  const named = companyIds.length ? await sbTry<Row[]>(`companies?id=in.${inList(companyIds)}&select=id,company_name,kind`, []) : []
  const co = new Map(named.map(c => [c.id as string, c]))
  const threads: ThreadHit[] = shaped.map(({ r, people, boxes, canOpen, owner }) => ({
    threadId: r.thread_id, subject: r.subject || '(no subject)', companyId: r.company_id, companyName: co.get(r.company_id ?? '')?.company_name ?? null,
    companyKind: co.get(r.company_id ?? '')?.kind ?? null, people, lastAt: r.last_message_at, mailboxes: boxes, inbox: inboxLabel(boxes),
    canOpen, owner, via: viaOf(r, terms.words),
  }))
  // The conversations inside joined threads (a client's and an insurer's filed together): one read for the hits.
  if (threads.length) {
    const [msgs, insurers] = await Promise.all([
      sbTry<ConvMessage[]>(`email_messages?thread_id=in.${inList(threads.map(t => t.threadId))}&deleted_at=is.null&select=thread_id,subject,from_address,direction,sent_at&limit=${threads.length * 40}`, []),
      insurerNames().catch(() => new Map<string, string>()),
    ])
    const insurerOf = (d: string) => { for (const [dom, n] of insurers) if (d === dom || d.endsWith(`.${dom}`)) return n || dom; return null }
    const names = new Map(threads.flatMap(t => t.people.filter(p => p.name).map(p => [p.email, p.name!] as const)))
    const convs = conversationsOf(msgs, insurerOf, e => /@trade-risksol\.com$/i.test(e), e => names.get(e) ?? null)
    for (const t of threads) { const c = convs.get(t.threadId); if (c) t.conversations = c }
  }
  const companyHits: CompanyHit[] = companies.filter(c => hasEvery(String(c.company_name ?? ''), terms.words)).slice(0, 6).map(c => ({ id: c.id, name: c.company_name, kind: c.kind ?? null }))
  const files = fileHits(shaped.map(x => ({ thread_id: x.r.thread_id, attachments: x.r.attachments, subject: x.r.subject || '(no subject)', lastAt: x.r.last_message_at, canOpen: x.canOpen, owner: x.owner })), terms.words)
  // The attachment ids of the files found, for a direct link: one read for at most eight threads.
  const fileThreads = Array.from(new Set(files.filter(f => f.canOpen).map(f => f.threadId)))
  if (fileThreads.length) {
    const atts = await sbTry<Row[]>(`email_attachments?thread_id=in.${inList(fileThreads)}&select=id,thread_id,filename&limit=400`, [])
    for (const f of files) f.attachmentId = f.canOpen ? atts.find(a => a.thread_id === f.threadId && String(a.filename).trim() === f.filename)?.id ?? null : null
  }
  return { index: true, threads, people: peopleHits(threads, terms.words), companies: companyHits, files }
}
