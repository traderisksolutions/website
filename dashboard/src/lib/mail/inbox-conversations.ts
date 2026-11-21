/**
 * The Inbox list and the older thread lists, read on the server: one entry per email thread, as the
 * viewer may see it (src/lib/mail/visibility.ts). GET /api/engagement/conversations answers with it,
 * and the Inbox page (src/app/engagement/page.tsx) reads its first screen with it, so the first paint
 * and every later read agree.
 *
 * `sp` takes the route's query: ?paged=1 (the Inbox: one page of 100 out of every thread the viewer
 * may see, with the view's total, the counts and the personal mailboxes) &view= &mailbox= &q= &body=
 * &offset= &include= &fresh=; without paged, the newest 200 (People, Today › Add email threads,
 * Policies) with &people= &conversations=. `viewer` is the signed-in person's email; null (a cron
 * call) sees every thread.
 */
import { conversationsOf, type Conversation, type ConvMessage } from '@/lib/mail/conversations'
import { fetchAllRows } from '@/lib/postgrest-all'
import { lastRealMessage } from '@/lib/threads/waiting'
import { chaseDueOn } from '@/lib/admin/b/cadence'
import { mailboxesByThread, ownersOf, visibleThreadIds } from '@/lib/mail/visibility-server'
import { SB_URL } from '@/lib/sb'
import { personalMailboxes, seesAllMail } from '@/lib/mail/visibility'
import { inboxIndex, visibleRows } from '@/lib/mail/inbox-index'
import { inboxPage, parseView, type InboxCounts } from '@/lib/mail/inbox-list'
import type { Lead } from '@/components/engagement/types'

/** A page of the Inbox: the view's total, the counts per view, the next offset and the personal mailboxes. */
export type InboxPageMeta = { total: number; counts: InboxCounts; nextOffset: number | null; offset: number; mailboxes: string[] }
/** `page` is set for ?paged=1 (the route answers { rows, ...page }); else the route answers the rows. */
export type InboxConversations = { rows: Lead[]; page: InboxPageMeta | null }

const TRS_DOMAIN = 'trade-risksol.com'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isInternal  = (e: string) => e.toLowerCase().endsWith(`@${TRS_DOMAIN}`)
const isAutomated = (e: string) => {
  const l = e.toLowerCase()
  return l.includes('noreply') || l.includes('no-reply') || l.includes('donotreply') ||
         l.includes('mailer-daemon') || l.includes('postmaster') || l.endsWith('@google.com')
}

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
  }
}

/**
 * The status of each thread from its last messages, skipping auto-replies and forwards inside TRS.
 * Bodies and recipients are read only for the newest few messages of each thread.
 */
async function readStatus(
  msgs: { id: string; thread_id: string; from_address: string | null; direction: string; subject: string | null; sent_at: string | null }[],
  threads: { id: string; companies?: { kind?: string | null } | null }[],
  lastDirection: Map<string, 'inbound' | 'outbound'>,
  chaseDue: Map<string, string>,
) {
  const byThread = new Map<string, typeof msgs>()
  for (const m of msgs) { const l = byThread.get(m.thread_id); if (l) l.push(m); else byThread.set(m.thread_id, [m]) }
  const recent = Array.from(byThread.values()).flatMap(l => l.slice(-4))
  const ids = recent.map(m => m.id)
  const bodies = new Map<string, string | null>()
  const to = new Map<string, string[]>()
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200).join(',')
    const [b, p] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/email_messages?id=in.(${part})&select=id,body_text`, { headers: sbHeaders(), cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch(`${SB_URL}/rest/v1/email_participants?message_id=in.(${part})&role=in.(to,cc)&select=message_id,email`, { headers: sbHeaders(), cache: 'no-store' }).then(r => r.ok ? r.json() : []),
    ])
    for (const x of b as { id: string; body_text: string | null }[]) bodies.set(x.id, (x.body_text ?? '').slice(0, 500))
    for (const x of p as { message_id: string; email: string }[]) { const l = to.get(x.message_id); if (l) l.push(x.email); else to.set(x.message_id, [x.email]) }
  }
  const insurer = new Set(threads.filter(t => t.companies?.kind === 'insurer').map(t => t.id))
  for (const [threadId, list] of byThread) {
    const tail = list.slice(-4).map(m => ({ ...m, body_text: bodies.get(m.id) ?? null, to: to.get(m.id) ?? [], cc: [] as string[] }))
    const last = lastRealMessage(tail) ?? tail.at(-1)
    if (last?.direction !== 'inbound' && last?.direction !== 'outbound') continue
    lastDirection.set(threadId, last.direction)
    if (last.direction === 'outbound' && last.sent_at) chaseDue.set(threadId, chaseDueOn(last.sent_at, insurer.has(threadId) ? 'insurer' : 'client'))
  }
}

export async function inboxConversations(sp: URLSearchParams, viewer: string | null): Promise<InboxConversations> {
  // ?paged=1 is the Inbox (20 Nov 2026): one page of 100, newest first, out of every thread the
  // viewer may see, with the view's total, the count per view and the personal mailboxes for the
  // pill. &view= &mailbox= &q= &offset= narrow it; &fresh=1 reads the index again. Without it the
  // answer is the old array of the newest 200 (People, Today › Add email threads, Policies).
  const paged = sp.get('paged') === '1'
  type CampaignCtx = { campaign_id: string; campaign_name: string; product_type: string; step_replied_to: number | null } | null
  type ThreadRow = {
    id: string; subject: string | null; display_subject: string | null; snippet: string | null; last_message_at: string; contact_id: string | null; campaign_context: CampaignCtx; category: string | null
    company_id: string | null; companies: { id: string; name: string; owner_email?: string | null; kind?: string | null } | null
  }
  const COLS = 'id,subject,display_subject,snippet,last_message_at,contact_id,campaign_context,category,company_id,companies(id,name:company_name,owner_email,kind)'
  let threads: ThreadRow[] = []
  if (!paged) {
    // 1. The newest 200 threads by last activity
    const threadRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?select=${COLS}&deleted_at=is.null&order=last_message_at.desc&limit=200`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    threads = threadRes.ok ? await threadRes.json() : []
    if (!Array.isArray(threads)) return { rows: [], page: null }
  }

  // A deep link (/engagement?lead=<thread id>) can point at a thread older than the newest 200.
  // ?include=<thread id> adds that one thread so the page can open it.
  const include = sp.get('include')
  if (!paged && include && UUID.test(include) && !threads.some(t => t.id === include)) {
    const one = await fetch(
      `${SB_URL}/rest/v1/email_threads?id=eq.${include}&select=${COLS}&deleted_at=is.null&limit=1`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const rows: ThreadRow[] = one.ok ? await one.json() : []
    if (Array.isArray(rows) && rows[0]) threads.push(rows[0])
  }
  // ?q=<words> answers only the threads that match, from all of them, not the newest 200: every
  // word in the thread's subject, title, snippet or company, or in an email inside it (subject,
  // sender) or the address or name of anyone on it (as written on the email, or the contact's
  // name). Each carries `match`, the email that matched, so "Chubb" finds a thread titled
  // "Awfa — travel insurance". &body=1 also reads the text of every email (a scan of all bodies,
  // a few seconds; Today › Add email threads asks for it, the Inbox does not).
  const q = (sp.get('q') ?? '').replace(/[^\p{L}\p{N}\s&@.\-']/gu, ' ').trim().slice(0, 80)
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length >= 2)
  const matchBy = new Map<string, string>()
  const bodyOf = new Map<string, string>()
  if (words.length) {
    const pat = encodeURIComponent(`*${[...words].sort((x, y) => y.length - x.length)[0]}*`)
    const cols = COLS
    const get = async <T,>(path: string): Promise<T[]> => {
      const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders(), cache: 'no-store' })
      const j = r.ok ? await r.json() : []
      return Array.isArray(j) ? j : []
    }
    const deep = sp.get('body') === '1'
    type Contact = { id: string; email: string | null; first_name: string | null; last_name: string | null }
    const [byThread, byMessage, byPerson, byCompany, byContact, byBody] = await Promise.all([
      get<ThreadRow>(`email_threads?or=(subject.ilike.${pat},display_subject.ilike.${pat},snippet.ilike.${pat})&select=${cols}&deleted_at=is.null&order=last_message_at.desc&limit=100`),
      get<{ thread_id: string; subject: string | null; from_address: string | null }>(`email_messages?or=(subject.ilike.${pat},from_address.ilike.${pat})&deleted_at=is.null&select=thread_id,subject,from_address&order=sent_at.desc&limit=300`),
      get<{ thread_id: string; email: string; name: string | null }>(`email_participants?or=(email.ilike.${pat},name.ilike.${pat})&select=thread_id,email,name&limit=400`),
      get<{ id: string }>(`companies?company_name=ilike.${pat}&select=id&limit=20`),
      get<Contact>(`contacts?or=(first_name.ilike.${pat},last_name.ilike.${pat})&select=id,email,first_name,last_name&limit=60`),
      // Bodies have no text index: no ordering, so the scan stops at the 200th match.
      deep ? get<{ thread_id: string; from_address: string | null; body_text: string | null }>(`email_messages?body_text=ilike.${pat}&deleted_at=is.null&select=thread_id,from_address,body_text&limit=200`) : Promise.resolve([]),
    ])
    // A contact found by name: the threads they are on (as a participant, or the thread's contact).
    const contactName = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(' ')
    const named = byContact.filter(c => c.email)
    const [contactParts, contactThreads] = named.length || byContact.length ? await Promise.all([
      named.length ? get<{ thread_id: string; email: string }>(`email_participants?email=in.(${named.map(c => `"${encodeURIComponent(String(c.email).toLowerCase())}"`).join(',')})&select=thread_id,email&limit=400`) : Promise.resolve([]),
      get<{ id: string; contact_id: string }>(`email_threads?contact_id=in.(${byContact.map(c => c.id).join(',')})&deleted_at=is.null&select=id,contact_id&limit=200`),
    ]) : [[], []]
    // Every matching email's text per thread, to test the other words against.
    const said = new Map<string, string[]>()
    const sayOn = (id: string | null | undefined, line: string) => { if (id && line) said.set(id, [...(said.get(id) ?? []), line]) }
    for (const m of byMessage) sayOn(m.thread_id, [m.from_address, m.subject].filter(Boolean).join(' · '))
    for (const p of byPerson) sayOn(p.thread_id, p.name ? `${p.name} <${p.email}>` : p.email)
    const contactByEmail = new Map(named.map(c => [String(c.email).toLowerCase(), c]))
    for (const p of contactParts) { const c = contactByEmail.get(String(p.email).toLowerCase()); if (c) sayOn(p.thread_id, `${contactName(c)} <${p.email}>`) }
    const contactById = new Map(byContact.map(c => [c.id, c]))
    for (const t of contactThreads) { const c = contactById.get(t.contact_id); if (c) sayOn(t.id, `${contactName(c)}${c.email ? ` <${c.email}>` : ''}`) }
    // A body match: the words are tested against the whole email; the line shown is the passage around the first word.
    for (const m of byBody) {
      const text = String(m.body_text ?? '').replace(/\s+/g, ' ')
      const at = text.toLowerCase().indexOf(words[0])
      const passage = `${at > 40 ? '…' : ''}${text.slice(Math.max(0, at - 40), Math.max(0, at - 40) + 140).trim()}…`
      sayOn(m.thread_id, `${m.from_address ?? ''} · ${passage}`)
      bodyOf.set(m.thread_id, `${bodyOf.get(m.thread_id) ?? ''} ${text.slice(0, 20_000)}`)
    }
    const hits = new Map(byThread.map(r => [r.id, r]))
    const have = new Map(threads.map(t => [t.id, t]))
    const want = [...said.keys()].filter(id => !hits.has(id) && UUID.test(id))
    for (const id of want) if (have.has(id)) hits.set(id, have.get(id)!)
    const fetchIds = want.filter(id => !hits.has(id)).slice(0, 300)
    for (let i = 0; i < fetchIds.length; i += 50) for (const r of await get<ThreadRow>(`email_threads?id=in.(${fetchIds.slice(i, i + 50).join(',')})&select=${cols}&deleted_at=is.null`)) hits.set(r.id, r)
    if (byCompany.length) for (const r of await get<ThreadRow>(`email_threads?company_id=in.(${byCompany.map(c => c.id).join(',')})&select=${cols}&deleted_at=is.null&order=last_message_at.desc&limit=100`)) if (!hits.has(r.id)) hits.set(r.id, r)
    threads = [...hits.values()].filter(t => {
      const text = [t.subject, t.display_subject, t.snippet, t.companies?.name, ...(said.get(t.id) ?? []), bodyOf.get(t.id)].filter(Boolean).join(' ').toLowerCase()
      return words.every(w => text.includes(w))
    }).sort((x, y) => String(y.last_message_at).localeCompare(String(x.last_message_at)))
    // The deep search can match hundreds of threads (a name in every signature): the newest 200 are
    // read. The Inbox pages through them instead.
    if (deep && !paged) threads = threads.slice(0, 200)
    for (const t of threads) {
      const lines = said.get(t.id) ?? []
      const best = lines.find(l => words.every(w => l.toLowerCase().includes(w))) ?? lines.find(l => l.toLowerCase().includes(words[0])) ?? lines[0]
      if (best) matchBy.set(t.id, best)
    }
  }
  // Each person sees only their own mail and the team's; only the developer account sees every mailbox
  // (Jarod, 20 Nov 2026, replacing the earlier "every thread listed for everyone").
  let openIds: Set<string> | null = null
  let page: InboxPageMeta | null = null
  if (paged) {
    const fresh = sp.get('fresh') === '1'
    // Every row is paged and counted; the rows the viewer may open (visibility.ts) mark the rest private.
    const all = await inboxIndex(fresh)
    const open = await visibleRows(all, viewer, fresh)
    openIds = new Set(open.map(r => r.id))
    const rows = seesAllMail(viewer) ? all : open
    const offset = Math.max(0, Number(sp.get('offset') ?? 0) || 0)
    const p = inboxPage(rows, { view: parseView(sp.get('view')), mailbox: (sp.get('mailbox') ?? (seesAllMail(viewer) ? 'all' : 'operations')).toLowerCase(), matched: words.length ? new Set(threads.map(t => t.id)) : null, offset })
    // A deep link to a thread beyond this page: added to the first page.
    const ids = [...p.ids]
    if (offset === 0 && include && UUID.test(include) && !ids.includes(include) && rows.some(r => r.id === include)) ids.push(include)
    const have = new Map(threads.map(t => [t.id, t]))
    const want = ids.filter(id => !have.has(id))
    const batches = []
    for (let i = 0; i < want.length; i += 50) batches.push(want.slice(i, i + 50))
    // The batches read together, not one after another (21 Nov 2026: the Inbox waited on each).
    for (const got of await Promise.all(batches.map(async part => {
      const r = await fetch(`${SB_URL}/rest/v1/email_threads?id=in.(${part.join(',')})&select=${COLS}&deleted_at=is.null`, { headers: sbHeaders(), cache: 'no-store' })
      if (!r.ok) throw new Error(`Thread read failed (${r.status})`)
      return await r.json() as ThreadRow[]
    }))) for (const t of got) have.set(t.id, t)
    threads = ids.flatMap(id => have.get(id) ?? [])
    page = { total: p.total, counts: p.counts, nextOffset: p.nextOffset, offset, mailboxes: seesAllMail(viewer) ? personalMailboxes(rows) : [] }
  }
  // Everyone at TRS sees every thread in the list (Jarod, 20 Nov 2026); a thread read only from a
  // colleague's own mailbox is marked with its owner and opens only for those it is visible to.
  // Its email text (snippet, the matched passage) is withheld from the others.
  const ok = openIds ?? await visibleThreadIds(threads.map(t => t.id), viewer)
  const answer = (rows: Lead[]): InboxConversations => ({ rows, page })
  if (threads.length === 0) return answer([])

  // Owners, mailboxes, contacts, insurer links and the messages each need only the thread list,
  // so they are read together (21 Nov 2026: read one after another they were most of the Inbox's
  // first-screen time).
  // 2. Batch-fetch contacts for linked threads
  const contactIds = Array.from(new Set(threads.filter(t => t.contact_id).map(t => t.contact_id!)))
  type ContactRow = { id: string; first_name: string | null; last_name: string | null; email: string | null }
  const contactMap = new Map<string, ContactRow>()
  // A thread linked to an insurer or partner is about a client: thread_insurers names it where known.
  const clientOf = new Map<string, string>()
  const namedOf = new Map<string, string>()
  const counterpartyIds = threads.filter(t => t.companies?.kind === 'insurer' || t.companies?.kind === 'partner').map(t => t.id)

  // 3. For all threads, look up sender email from email_messages as fallback
  //    — includes both inbound AND outbound because forwarded emails are stored as outbound
  const allThreadIds = threads.map(t => t.id)
  const threadSenderMap = new Map<string, string>() // thread_id -> best external email
  const lastDirection = new Map<string, 'inbound' | 'outbound'>() // thread_id -> direction of the last real message
  const chaseDue = new Map<string, string>() // thread_id -> the day a chaser is due, when TRS wrote last
  let threadMsgs: ConvMessage[] = []
  const readMessages = async () => {
    // Prefer inbound messages first (direct client email). Every row: the API stops at 1,000,
    // which left the newest messages of the list unread and their status wrong.
    const msgs = await fetchAllRows<{ id: string; thread_id: string; from_address: string | null; direction: string; subject: string | null; sent_at: string | null }>(
      `${SB_URL}/rest/v1/email_messages?thread_id=in.(${allThreadIds.join(',')})&deleted_at=is.null&select=id,thread_id,from_address,direction,subject,sent_at&order=sent_at.asc`,
      sbHeaders(),
    ).catch(() => [])
    await readStatus(msgs, threads, lastDirection, chaseDue)
    if (Array.isArray(msgs)) threadMsgs = msgs
    // First pass: inbound messages
    for (const m of (Array.isArray(msgs) ? msgs : [])) {
      if (m.direction === 'inbound' && !threadSenderMap.has(m.thread_id) &&
          m.from_address && !isInternal(m.from_address) && !isAutomated(m.from_address)) {
        threadSenderMap.set(m.thread_id, m.from_address)
      }
    }
    // Second pass: external participants from email_participants
    const unresolved = allThreadIds.filter(id => !threadSenderMap.has(id))
    if (unresolved.length > 0) {
      const partRes = await fetch(
        `${SB_URL}/rest/v1/email_participants?thread_id=in.(${unresolved.join(',')})&select=thread_id,email&order=thread_id.asc`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const parts: { thread_id: string; email: string | null }[] = partRes.ok ? await partRes.json() : []
      for (const p of (Array.isArray(parts) ? parts : [])) {
        if (!threadSenderMap.has(p.thread_id) && p.email &&
            !isInternal(p.email) && !isAutomated(p.email)) {
          threadSenderMap.set(p.thread_id, p.email)
        }
      }
    }
  }
  const [owners, boxes, cRes, tiRes] = await Promise.all([
    ownersOf(threads.filter(t => !ok.has(t.id)).map(t => t.id)),
    mailboxesByThread(allThreadIds),
    contactIds.length > 0 ? fetch(`${SB_URL}/rest/v1/contacts?id=in.(${contactIds.join(',')})&select=id,first_name,last_name,email`, { headers: sbHeaders(), cache: 'no-store' }) : null,
    counterpartyIds.length > 0 ? fetch(`${SB_URL}/rest/v1/thread_insurers?thread_id=in.(${counterpartyIds.join(',')})&select=thread_id,client_company_id,reason&order=last_message_at.desc.nullslast`, { headers: sbHeaders(), cache: 'no-store' }) : null,
    readMessages(),
  ])
  if (cRes) {
    const rows: ContactRow[] = cRes.ok ? await cRes.json() : []
    for (const c of (Array.isArray(rows) ? rows : [])) contactMap.set(c.id, c)
  }
  if (tiRes) {
    const rows: { thread_id: string; client_company_id: string | null; reason: string | null }[] = tiRes.ok ? await tiRes.json() : []
    for (const r of (Array.isArray(rows) ? rows : [])) {
      if (r.client_company_id && !clientOf.has(r.thread_id)) clientOf.set(r.thread_id, r.client_company_id)
      else if (!r.client_company_id && r.reason?.startsWith('named: ') && !namedOf.has(r.thread_id)) namedOf.set(r.thread_id, r.reason.slice('named: '.length))
    }
  }

  // 3b. ?people=1: everyone on each thread, by name where the email or a contact gives one
  //     (Today › Add email threads shows them on each row). Outside TRS first.
  const people = new Map<string, { name: string | null; email: string }[]>()
  if (sp.get('people') === '1' && allThreadIds.length) {
    const parts: { thread_id: string; email: string | null; name: string | null }[] = []
    for (let i = 0; i < allThreadIds.length; i += 100) {
      const r = await fetch(`${SB_URL}/rest/v1/email_participants?thread_id=in.(${allThreadIds.slice(i, i + 100).join(',')})&select=thread_id,email,name&limit=5000`, { headers: sbHeaders(), cache: 'no-store' })
      const j = r.ok ? await r.json() : []
      if (Array.isArray(j)) parts.push(...j)
    }
    const emails = Array.from(new Set(parts.map(p => String(p.email ?? '').toLowerCase()).filter(e => e.includes('@'))))
    const known = new Map<string, string>()
    for (let i = 0; i < emails.length; i += 100) {
      const r = await fetch(`${SB_URL}/rest/v1/contacts?email=in.(${emails.slice(i, i + 100).map(e => `"${encodeURIComponent(e)}"`).join(',')})&select=email,first_name,last_name`, { headers: sbHeaders(), cache: 'no-store' })
      const j = r.ok ? await r.json() : []
      for (const c of (Array.isArray(j) ? j : []) as ContactRow[]) { const n = [c.first_name, c.last_name].filter(Boolean).join(' ').trim(); if (c.email && n) known.set(c.email.toLowerCase(), n) }
    }
    for (const p of parts) {
      const email = String(p.email ?? '').trim().toLowerCase()
      if (!email.includes('@') || isAutomated(email)) continue
      const list = people.get(p.thread_id) ?? []
      const name = (p.name ?? '').replace(/["']/g, '').trim() || known.get(email) || null
      const cur = list.find(x => x.email === email)
      if (!cur) list.push({ name, email }); else if (!cur.name && name) cur.name = name
      people.set(p.thread_id, list)
    }

    for (const list of people.values()) list.sort((a, b) => Number(isInternal(a.email)) - Number(isInternal(b.email)))
  }

  // 3c. ?conversations=1: a thread that holds more than one conversation (a client's and an
  //     insurer's filed together) lists each, with its side (src/lib/mail/conversations.ts).
  let convs = new Map<string, Conversation[]>()
  if (sp.get('conversations') === '1' && threadMsgs.length) {
    const insurers = await fetch(`${SB_URL}/rest/v1/companies?kind=eq.insurer&select=company_name,domains`, { headers: sbHeaders(), cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => [])
    const insurerByDomain = new Map<string, string>()
    for (const c of (Array.isArray(insurers) ? insurers : []) as { company_name: string; domains: string[] | null }[]) for (const d of c.domains ?? []) insurerByDomain.set(d.toLowerCase(), c.company_name)
    const insurerOf = (d: string) => { for (const [k, v] of insurerByDomain) if (d === k || d.endsWith(`.${k}`)) return v; return null }
    const nameBy = new Map<string, string>()
    for (const list of people.values()) for (const p of list) if (p.name) nameBy.set(p.email, p.name)
    convs = conversationsOf(threadMsgs, insurerOf, isInternal, e => nameBy.get(e) ?? null)
  }

  // 4. Shape one entry per thread
  const result = threads.flatMap(t => {
    const contact = t.contact_id ? contactMap.get(t.contact_id) : null

    // Resolve email: contact record → message/participant lookup → snippet → null
    let email: string | null = null
    const contactEmail = contact?.email ?? null
    if (contactEmail && !isInternal(contactEmail) && !isAutomated(contactEmail)) {
      email = contactEmail
    }
    if (!email) email = threadSenderMap.get(t.id) ?? null

    // Snippet fallback: covers cases where snippet starts with "From: Name <email>"
    if (!email && t.snippet) {
      const m = t.snippet.match(/[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/i)
      const candidate = m?.[0] ?? null
      if (candidate && !isInternal(candidate) && !isAutomated(candidate)) {
        email = candidate
      }
    }

    // Skip only threads that are provably internal-only (spam/system/TRS-internal loops)
    if (email && (isInternal(email) || isAutomated(email))) return []
    // Skip threads with no subject and no snippet (empty/ghost records)
    if (!email && !t.subject && !t.snippet) return []

    // No external contact (internal-only thread, e.g. TRS forward / ops↔ops):
    // read as "Trade Risk Solutions" rather than an ugly dash.
    const internalOnly = !email && !contact?.first_name && !contact?.last_name
    return [{
      id:               t.id,
      thread_id:        t.id,
      created_at:       t.last_message_at,
      source:           'email' as const,
      subject:          t.subject,
      display_subject:  t.display_subject ?? null,
      snippet:          ok.has(t.id) ? t.snippet : null,
      match:            ok.has(t.id) ? matchBy.get(t.id) ?? null : null,
      private:          ok.has(t.id) ? undefined : { owner: owners.get(t.id) ?? null },
      participants:     people.get(t.id)?.slice(0, 40) ?? undefined,
      conversations:    convs.get(t.id),
      first_name:       contact?.first_name ?? (internalOnly ? 'Trade Risk Solutions' : null),
      last_name:        contact?.last_name  ?? null,
      email,
      phone:            null,
      company:          null,
      department:       null,
      contact_type:     null,
      topic:            null,
      details:          null,
      message:          null,
      page_url:         null,
      status:           'contacted',
      campaign_context: t.campaign_context ?? null,
      category:         t.category ?? null,
      companyId:        t.company_id ?? null,
      companyName:      t.companies?.name ?? null,
      companyOwner:     t.companies?.owner_email ?? null,
      companyKind:      t.companies?.kind ?? null,
      clientCompanyId:  clientOf.get(t.id) ?? null,
      clientNamed:      clientOf.has(t.id) ? null : namedOf.get(t.id) ?? null,
      mailboxes:        boxes.get(t.id) ?? [],
      lastDirection:    lastDirection.get(t.id) ?? null,
      chaseDue:         chaseDue.get(t.id) ?? null,
    }]
  })

  return answer(result)
}
