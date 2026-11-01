/**
 * Reads for the assistant screens: the Today list, one item for review, a thread, the home map
 * and a company's knowledge log. Server only (service key). Groups come from rules.ts.
 *
 * Writes that belong to the case builder (later, seen) are done here as plain row updates plus a
 * work_item_events row, so the screens are not blocked on it; they can move into
 * src/lib/casework when that module gains them.
 */
import { sb, sbTry, enc, isInternal } from '@/lib/crm/db'
import { groupOf, bridgeOf, laterFor, type TodayGroup, type LaterChoice, type Bridge } from './rules'

type Row = Record<string, any>

export type TodayDraft = {
  id: string; to: string; cc: string | null; subject: string; body: string
  attachments: { filename: string; storage_url?: string | null }[]
  thread_id: string | null; party: string | null; pair_id: string | null; kind: string | null
}
export type TodayItem = {
  id: string; group: TodayGroup; company_id: string | null; client: string; case_type: string; title: string
  status: string; summary: string | null; next_action: string | null; needs_human: string | null
  insurer_name: string | null; policy_number: string | null; deadline: string | null
  waiting_since: string | null; last_activity_at: string | null
  owner_email: string | null; later_until: string | null; later_when: string | null
  draft: TodayDraft | null; paired: TodayDraft[]
}

const DRAFT_COLS = 'id,to_email,cc,subject,body,attachments,thread_id,party,pair_id,status,context_used'
const toDraft = (d: Row): TodayDraft => ({
  id: d.id, to: d.to_email ?? '', cc: d.cc ?? null, subject: d.subject ?? '', body: d.body ?? '',
  attachments: (d.attachments ?? []).map((a: Row) => ({ filename: a.filename, storage_url: a.storage_url ?? null })),
  thread_id: d.thread_id ?? null, party: d.party ?? null, pair_id: d.pair_id ?? null, kind: d.context_used?.kind ?? null,
})

async function openItems(): Promise<Row[]> {
  return sbTry<Row[]>('work_items?closed_at=is.null&select=*,companies(company_name,kind)&order=updated_at.desc&limit=1000', [])
}

async function draftsFor(items: Row[]): Promise<{ primary: Map<string, Row>; pairs: Map<string, Row[]> }> {
  const ids = items.map(r => r.draft_id).filter(Boolean)
  const primary = new Map<string, Row>()
  const pairs = new Map<string, Row[]>()
  if (!ids.length) return { primary, pairs }
  const rows = await sbTry<Row[]>(`ai_drafts?id=in.(${ids.join(',')})&status=in.(pending,draft)&select=${DRAFT_COLS}`, [])
  for (const r of rows) primary.set(r.id, r)
  const pairIds = Array.from(new Set(rows.map(r => r.pair_id).filter(Boolean)))
  if (pairIds.length) {
    const rest = await sbTry<Row[]>(`ai_drafts?pair_id=in.(${pairIds.join(',')})&status=in.(pending,draft)&select=${DRAFT_COLS}`, [])
    for (const r of rest) if (!primary.has(r.id)) pairs.set(r.pair_id, [...(pairs.get(r.pair_id) ?? []), r])
  }
  return { primary, pairs }
}

async function seenMap(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    const rows = await sbTry<Row[]>(`work_item_events?kind=eq.seen&work_item_id=in.(${chunk.join(',')})&select=work_item_id,created_at&order=created_at.desc`, [])
    for (const r of rows) if (!out.has(r.work_item_id)) out.set(r.work_item_id, r.created_at)
  }
  return out
}

function shape(r: Row, group: TodayGroup, d: Row | undefined, paired: Row[]): TodayItem {
  return {
    id: r.id, group, company_id: r.company_id, client: r.companies?.company_name ?? r.client_name ?? 'Unfiled',
    case_type: r.case_type, title: r.title, status: r.status, summary: r.summary, next_action: r.next_action,
    needs_human: r.needs_human, insurer_name: r.insurer_name, policy_number: r.policy_number, deadline: r.deadline,
    waiting_since: r.waiting_since, last_activity_at: r.last_activity_at, owner_email: r.owner_email,
    later_until: r.later_until ?? null, later_when: r.later_when ?? null,
    draft: d ? toDraft(d) : null, paired: paired.map(toDraft),
  }
}

/** Every open item that belongs on Today, in group order; within a group, oldest wait first. */
export async function loadToday(now = new Date()): Promise<TodayItem[]> {
  const rows = await openItems()
  const { primary, pairs } = await draftsFor(rows)
  const seen = await seenMap(rows.map(r => r.id))
  const order: Record<TodayGroup, number> = { send: 0, decide: 1, act: 2, read: 3, later: 4, none: 9 }
  return rows
    .map(r => {
      const d = r.draft_id ? primary.get(r.draft_id) : undefined
      const group = groupOf({ status: r.status, needs_human: r.needs_human, has_draft: !!d, last_activity_at: r.last_activity_at, later_until: r.later_until ?? null, later_when: r.later_when ?? null, seen_at: seen.get(r.id) ?? null }, now)
      return shape(r, group, d, d?.pair_id ? pairs.get(d.pair_id) ?? [] : [])
    })
    .filter(i => i.group !== 'none')
    .sort((a, b) => order[a.group] - order[b.group] || String(a.waiting_since ?? a.last_activity_at ?? '').localeCompare(String(b.waiting_since ?? b.last_activity_at ?? '')))
}

export type ItemDetail = TodayItem & {
  threads: { id: string; subject: string | null; side: string; joined_by: string | null; messages: number }[]
  events: { kind: string; actor: string; at: string; detail: Row }[]
  ledger: { at: string; kind: string; title: string; links: { label: string; url: string }[] }[]
  documents: { id: string; title: string; doc_type: string; drive_url: string | null; received_at: string | null }[]
  contacts: { name: string; email: string; scope: string[] }[]
}

export async function loadItem(id: string, now = new Date()): Promise<ItemDetail | null> {
  const [r] = await sbTry<Row[]>(`work_items?id=eq.${enc(id)}&select=*,companies(company_name,kind),work_item_threads(side,joined_by,email_threads(id,subject,message_count))&limit=1`, [])
  if (!r) return null
  const { primary, pairs } = await draftsFor([r])
  const d = r.draft_id ? primary.get(r.draft_id) : undefined
  const seen = await seenMap([r.id])
  const group = groupOf({ status: r.status, needs_human: r.needs_human, has_draft: !!d, last_activity_at: r.last_activity_at, later_until: r.later_until ?? null, later_when: r.later_when ?? null, seen_at: seen.get(r.id) ?? null }, now)
  const threads = (r.work_item_threads ?? []).filter((t: Row) => t.email_threads?.id).map((t: Row) => ({
    id: t.email_threads.id, subject: t.email_threads.subject ?? null, side: t.side, joined_by: t.joined_by ?? null, messages: t.email_threads.message_count ?? 0,
  }))
  const threadIds = threads.map((t: { id: string }) => t.id)
  const [events, ledger, documents, contacts] = await Promise.all([
    sbTry<Row[]>(`work_item_events?work_item_id=eq.${enc(id)}&select=kind,actor,detail,created_at&order=created_at.desc&limit=40`, []),
    sbTry<Row[]>(`company_ledger?or=(work_item_id.eq.${enc(id)}${threadIds.length ? `,thread_id.in.(${threadIds.join(',')})` : ''})&select=occurred_at,kind,title,links&order=occurred_at.desc&limit=40`, []),
    r.company_id ? sbTry<Row[]>(`policy_documents?company_id=eq.${enc(r.company_id)}&status=eq.filed&select=id,title,filename,doc_type,drive_url,received_at,policy_id&order=received_at.desc.nullslast&limit=40`, []) : Promise.resolve([] as Row[]),
    r.company_id ? sbTry<Row[]>(`company_contacts?company_id=eq.${enc(r.company_id)}&status=eq.active&select=scope,contacts(name,email,first_name,last_name)&limit=30`, []) : Promise.resolve([] as Row[]),
  ])
  // A policy's documents first, then the rest of the client's.
  const docs = documents.sort((a, b) => Number(b.policy_id === r.policy_id) - Number(a.policy_id === r.policy_id))
  return {
    ...shape(r, group, d, d?.pair_id ? pairs.get(d.pair_id) ?? [] : []),
    threads,
    events: events.map(e => ({ kind: e.kind, actor: e.actor, at: e.created_at, detail: e.detail ?? {} })),
    ledger: ledger.map(l => ({ at: l.occurred_at, kind: l.kind, title: l.title, links: l.links ?? [] })),
    documents: docs.slice(0, 20).map(x => ({ id: x.id, title: x.title || x.filename, doc_type: x.doc_type, drive_url: x.drive_url, received_at: x.received_at })),
    contacts: contacts.filter(c => c.contacts?.email).map(c => ({
      name: c.contacts.name || [c.contacts.first_name, c.contacts.last_name].filter(Boolean).join(' ') || c.contacts.email,
      email: c.contacts.email, scope: c.scope ?? [],
    })),
  }
}

export type ThreadView = {
  id: string; subject: string | null
  messages: { at: string | null; from: string | null; to: string[]; direction: string | null; body: string; rebuilt: 'forward' | 'quoted' | null }[]
}

/** One thread, oldest first: the messages TRS holds, and those rebuilt from forwards or quotes. */
export async function loadThread(id: string): Promise<ThreadView | null> {
  const [t] = await sbTry<Row[]>(`email_threads?id=eq.${enc(id)}&select=id,subject&limit=1`, [])
  if (!t) return null
  const [msgs, people, rebuilt] = await Promise.all([
    sbTry<Row[]>(`email_messages?thread_id=eq.${enc(id)}&deleted_at=is.null&select=id,sent_at,from_address,direction,body_text&order=sent_at.asc&limit=60`, []),
    sbTry<Row[]>(`email_participants?thread_id=eq.${enc(id)}&deleted_at=is.null&role=eq.to&select=message_id,email`, []),
    sbTry<Row[]>(`rebuilt_messages?thread_id=eq.${enc(id)}&select=origin,sent_at,from_address,to_addresses,body_text&order=sent_at.asc&limit=60`, []),
  ])
  const trim = (s: string | null) => String(s ?? '').replace(/\r/g, '').split(/\n(?:On .{5,120} wrote:|-{2,}\s*Original Message|From: .{3,200}\nSent: )/)[0].trim().slice(0, 4000)
  const all = [
    ...rebuilt.map(m => ({ at: m.sent_at, from: m.from_address, to: m.to_addresses ?? [], direction: null, body: trim(m.body_text), rebuilt: m.origin as 'forward' | 'quoted' })),
    ...msgs.map(m => ({ at: m.sent_at, from: m.from_address, to: people.filter(p => p.message_id === m.id).map(p => p.email), direction: isInternal(m.from_address) ? 'outbound' : m.direction, body: trim(m.body_text), rebuilt: null })),
  ].sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')))
  return { id: t.id, subject: t.subject, messages: all }
}

export type HomeData = {
  bridges: Record<Exclude<Bridge, 'other'>, { open: number; trs: number; waiting_client: number; waiting_insurer: number; drafts: number }>
  today: number; drafts: number; decisions: number
  clients: { id: string | null; name: string; open: number; trs: number; titles: string[] }[]
  insurers: { name: string; open: number; waiting: number; drafts: number }[]
}

/** The home map: open work per bridge and per side, and who it is for. */
export async function loadHome(now = new Date()): Promise<HomeData> {
  const rows = await openItems()
  const { primary } = await draftsFor(rows)
  const today = await loadToday(now)
  const empty = () => ({ open: 0, trs: 0, waiting_client: 0, waiting_insurer: 0, drafts: 0 })
  const bridges = { rfq: empty(), claims: empty(), endorsements: empty() }
  const clients = new Map<string, HomeData['clients'][number]>()
  const insurers = new Map<string, HomeData['insurers'][number]>()
  for (const r of rows) {
    const b = bridgeOf(r.case_type)
    const hasDraft = !!(r.draft_id && primary.has(r.draft_id))
    const trs = r.status === 'trs_to_act' || r.status === 'stalled'
    if (b !== 'other') {
      const x = bridges[b]
      x.open++; if (trs) x.trs++; if (hasDraft) x.drafts++
      if (r.status === 'waiting_client') x.waiting_client++
      if (r.status === 'waiting_insurer') x.waiting_insurer++
    }
    const kind = r.companies?.kind
    if (!kind || kind === 'client') {
      const key = r.company_id ?? `name:${r.client_name ?? 'Unfiled'}`
      const c: HomeData['clients'][number] = clients.get(key) ?? { id: r.company_id ?? null, name: r.companies?.company_name ?? r.client_name ?? 'Unfiled', open: 0, trs: 0, titles: [] }
      c.open++; if (trs) c.trs++; if (c.titles.length < 3) c.titles.push(r.title)
      clients.set(key, c)
    }
    if (r.insurer_name) {
      const k = String(r.insurer_name).trim()
      const i = insurers.get(k) ?? { name: k, open: 0, waiting: 0, drafts: 0 }
      i.open++; if (r.status === 'waiting_insurer') i.waiting++; if (hasDraft) i.drafts++
      insurers.set(k, i)
    }
  }
  return {
    bridges, today: today.filter(i => i.group !== 'later').length,
    drafts: today.filter(i => i.group === 'send').length,
    decisions: today.filter(i => i.group === 'decide').length,
    clients: Array.from(clients.values()).sort((a, b) => b.trs - a.trs || b.open - a.open),
    insurers: Array.from(insurers.values()).sort((a, b) => b.open - a.open),
  }
}

/** A company's knowledge log, newest first, paged by occurred_at. */
export async function loadKnowledge(companyId: string, before: string | null, limit = 50) {
  const [c] = await sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=id,parent_id&limit=1`, [])
  if (!c) return null
  const rows = await sbTry<Row[]>(
    `company_ledger?company_id=eq.${enc(companyId)}${before ? `&occurred_at=lt.${enc(before)}` : ''}&select=id,occurred_at,kind,title,summary,party,actor,links,thread_id,policy_id,work_item_id&order=occurred_at.desc&limit=${limit}`, [])
  return { entries: rows, next: rows.length === limit ? rows[rows.length - 1].occurred_at : null }
}

// ── Writes ────────────────────────────────────────────────────────────────────────────────────

const event = (id: string, kind: string, actor: string, detail: Row = {}) =>
  sb('work_item_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: id, kind, actor, detail }) })

export async function setLater(id: string, choice: LaterChoice | null, actor: string, now = new Date()) {
  const row = choice ? { ...laterFor(choice, now), later_by: actor } : { later_until: null, later_when: null, later_by: null }
  await sb(`work_items?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...row, updated_at: now.toISOString() }) })
  await event(id, 'later', actor, { choice, until: row.later_until, when: row.later_when })
  return row
}

export const markSeen = (id: string, actor: string) => event(id, 'seen', actor)

/** Edits one draft in place; only drafts not yet sent. */
export async function editDraft(id: string, p: { to: string; cc: string | null; subject: string; body: string }) {
  if (!p.to.trim() || !p.body.trim()) throw new Error('A draft needs a recipient and a message.')
  const [d] = await sb<Row[]>(`ai_drafts?id=eq.${enc(id)}&select=id,status&limit=1`)
  if (!d || !['pending', 'draft'].includes(d.status)) throw new Error('This draft was already sent or discarded.')
  await sb(`ai_drafts?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ to_email: p.to.trim(), cc: p.cc?.trim() || null, subject: p.subject, body: p.body }) })
}

/** Fills the signature with the approver's name and returns the id for /api/email/send. */
export async function prepareDraft(id: string, actor: string): Promise<string> {
  const [d] = await sb<Row[]>(`ai_drafts?id=eq.${enc(id)}&select=id,body,status&limit=1`)
  if (!d || !['pending', 'draft'].includes(d.status)) throw new Error('This draft was already sent or discarded.')
  const [me] = await sbTry<Row[]>(`contacts?email=eq.${enc(actor)}&select=first_name,last_name&limit=1`, [])
  const name = [me?.first_name, me?.last_name].filter(Boolean).join(' ') || actor.split('@')[0]
  await sb(`ai_drafts?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body: String(d.body ?? '').replace(/\{owner_name\}/g, name) }) })
  return d.id
}
