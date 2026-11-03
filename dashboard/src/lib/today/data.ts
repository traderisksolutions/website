/**
 * Reads for the assistant screens: the Today list, one item for review, a thread, the home map
 * and a company's knowledge log. Server only (service key). Groups come from rules.ts.
 *
 * Writes that belong to the case builder (later, seen) are done here as plain row updates plus a
 * work_item_events row, so the screens are not blocked on it; they can move into
 * src/lib/casework when that module gains them.
 */
import { fillVoice } from '@/lib/admin/b/voice'
import { contactIdFor } from '@/lib/admin/b/contact-id'
import { listRegister, type RegisterRow } from '@/lib/admin/b/documents/store'
import { sb, sbTry, enc, isInternal } from '@/lib/crm/db'
import { groupOf, bridgeOf, laterFor, type TodayGroup, type LaterChoice, type Bridge } from './rules'
import { pendingOf, sideOf, homeBridgeOf, cardOrder, LEVEL_RANK, type Pending, type PendingLevel, type Side, type HomeBridge, type PolicyLite } from './pending'

type Row = Record<string, any>

export type TodayDraft = {
  id: string; to: string; cc: string | null; subject: string; body: string
  attachments: { filename: string; storage_url?: string | null; mime_type?: string | null }[]
  thread_id: string | null; party: string | null; pair_id: string | null; kind: string | null
}
export type PendingView = Pending & { override: { level: PendingLevel; reason: string | null; by: string | null } | null }
export type TodayItem = {
  id: string; group: TodayGroup; company_id: string | null; client: string; case_type: string; title: string
  status: string; summary: string | null; next_action: string | null; needs_human: string | null
  insurer_name: string | null; policy_number: string | null; deadline: string | null
  waiting_since: string | null; last_activity_at: string | null
  owner_email: string | null; later_until: string | null; later_when: string | null
  draft: TodayDraft | null; paired: TodayDraft[]
  pending: PendingView; side: Side; bridge: HomeBridge; policy_id: string | null
  /** Quote cases: the nine-stage position (src/lib/cases/stage.ts), how the work reached TRS, and the renewal flow. */
  stage: string | null; start_point: string | null; renewal_flow: string | null
}

const DRAFT_COLS = 'id,to_email,cc,subject,body,attachments,thread_id,party,pair_id,status,context_used'
const toDraft = (d: Row): TodayDraft => ({
  id: d.id, to: d.to_email ?? '', cc: d.cc ?? null, subject: d.subject ?? '', body: d.body ?? '',
  attachments: (d.attachments ?? []).map((a: Row) => ({ filename: a.filename, storage_url: a.storage_url ?? null, mime_type: a.mime_type ?? null })),
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

function pendingFor(r: Row, hasDraft: boolean, policies: PolicyLite[], now: Date): PendingView {
  const override = r.pending_override ? { level: r.pending_override as PendingLevel, reason: r.pending_override_reason ?? null, by: r.pending_override_by ?? null } : null
  const p = pendingOf({
    case_type: r.case_type, status: r.status, title: r.title, summary: r.summary, next_action: r.next_action, needs_human: r.needs_human,
    deadline: r.deadline, waiting_since: r.waiting_since, last_activity_at: r.last_activity_at, has_draft: hasDraft,
    override: override ? { level: override.level, reason: override.reason } : null, policies,
  }, now)
  return { ...p, override }
}

/** The client's policies, by company, for the lapsed-cover rule. */
async function policiesByCompany(rows: Row[]): Promise<Map<string, PolicyLite[]>> {
  const ids = Array.from(new Set(rows.map(r => r.company_id).filter(Boolean))) as string[]
  const out = new Map<string, PolicyLite[]>()
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60)
    const ps = await sbTry<Row[]>(`policies?company_id=in.(${chunk.join(',')})&select=company_id,class_of_insurance,product_line,end_date,lifecycle`, [])
    for (const p of ps) out.set(p.company_id, [...(out.get(p.company_id) ?? []), { class: p.class_of_insurance ?? p.product_line ?? null, end_date: p.end_date ?? null, lifecycle: p.lifecycle ?? null }])
  }
  return out
}

function shape(r: Row, group: TodayGroup, d: Row | undefined, paired: Row[], policies: PolicyLite[] = [], now = new Date()): TodayItem {
  return {
    pending: pendingFor(r, !!d && !r.needs_human, policies, now), side: sideOf(r.status), bridge: homeBridgeOf(r.case_type), policy_id: r.policy_id ?? null,
    id: r.id, group, company_id: r.company_id, client: r.companies?.company_name ?? r.client_name ?? 'Unfiled',
    case_type: r.case_type, title: r.title, status: r.status, summary: r.summary, next_action: r.next_action,
    needs_human: r.needs_human, insurer_name: r.insurer_name, policy_number: r.policy_number, deadline: r.deadline,
    waiting_since: r.waiting_since, last_activity_at: r.last_activity_at, owner_email: r.owner_email,
    later_until: r.later_until ?? null, later_when: r.later_when ?? null,
    stage: r.stage ?? null, start_point: r.start_point ?? null, renewal_flow: r.renewal_flow ?? null,
    draft: d ? toDraft(d) : null, paired: paired.map(toDraft),
  }
}

/** Every open item that belongs on Today, in group order; within a group, oldest wait first. */
export async function loadToday(now = new Date()): Promise<TodayItem[]> {
  const rows = await openItems()
  const { primary, pairs } = await draftsFor(rows)
  const seen = await seenMap(rows.map(r => r.id))
  const pols = await policiesByCompany(rows)
  const order: Record<TodayGroup, number> = { send: 0, decide: 1, act: 2, read: 3, later: 4, none: 9 }
  const items = rows
    .map(r => {
      const d = r.draft_id ? primary.get(r.draft_id) : undefined
      const group = groupOf({ status: r.status, needs_human: r.needs_human, has_draft: !!d, last_activity_at: r.last_activity_at, later_until: r.later_until ?? null, later_when: r.later_when ?? null, seen_at: seen.get(r.id) ?? null }, now)
      return shape(r, group, d, d?.pair_id ? pairs.get(d.pair_id) ?? [] : [], pols.get(r.company_id) ?? [], now)
    })
  void storePending(rows, items, now)
  return items
    .filter(i => i.group !== 'none')
    .sort((a, b) => order[a.group] - order[b.group] || String(a.waiting_since ?? a.last_activity_at ?? '').localeCompare(String(b.waiting_since ?? b.last_activity_at ?? '')))
}

export type ItemDetail = TodayItem & {
  threads: { id: string; subject: string | null; side: string; joined_by: string | null; messages: number }[]
  events: { kind: string; actor: string; at: string; detail: Row }[]
  ledger: { at: string; kind: string; title: string; links: { label: string; url: string }[] }[]
  documents: { id: string; title: string; doc_type: string; drive_url: string | null; received_at: string | null }[]
  contacts: { name: string; email: string; scope: string[] }[]
  /** The document register: what the matter needs before binding, and what has arrived. */
  register: RegisterRow[]
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
  const [events, ledger, documents, contacts, register] = await Promise.all([
    sbTry<Row[]>(`work_item_events?work_item_id=eq.${enc(id)}&select=kind,actor,detail,created_at&order=created_at.desc&limit=40`, []),
    sbTry<Row[]>(`company_ledger?or=(work_item_id.eq.${enc(id)}${threadIds.length ? `,thread_id.in.(${threadIds.join(',')})` : ''})&select=occurred_at,kind,title,links&order=occurred_at.desc&limit=40`, []),
    r.company_id ? sbTry<Row[]>(`policy_documents?company_id=eq.${enc(r.company_id)}&status=eq.filed&select=id,title,filename,doc_type,drive_url,received_at,policy_id&order=received_at.desc.nullslast&limit=40`, []) : Promise.resolve([] as Row[]),
    r.company_id ? sbTry<Row[]>(`company_contacts?company_id=eq.${enc(r.company_id)}&status=eq.active&select=scope,contacts(name,email,first_name,last_name)&limit=30`, []) : Promise.resolve([] as Row[]),
    listRegister(id),
  ])
  // A policy's documents first, then the rest of the client's.
  const docs = documents.sort((a, b) => Number(b.policy_id === r.policy_id) - Number(a.policy_id === r.policy_id))
  const pols = r.company_id ? (await policiesByCompany([r])).get(r.company_id) ?? [] : []
  return {
    ...shape(r, group, d, d?.pair_id ? pairs.get(d.pair_id) ?? [] : [], pols, now),
    threads,
    events: events.map(e => ({ kind: e.kind, actor: e.actor, at: e.created_at, detail: e.detail ?? {} })),
    ledger: ledger.map(l => ({ at: l.occurred_at, kind: l.kind, title: l.title, links: l.links ?? [] })),
    documents: docs.slice(0, 20).map(x => ({ id: x.id, title: x.title || x.filename, doc_type: x.doc_type, drive_url: x.drive_url, received_at: x.received_at })),
    contacts: contacts.filter(c => c.contacts?.email).map(c => ({
      name: c.contacts.name || [c.contacts.first_name, c.contacts.last_name].filter(Boolean).join(' ') || c.contacts.email,
      email: c.contacts.email, scope: c.scope ?? [],
    })),
    register,
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
export type NextStep = { id: string; title: string; case_type: string; status: string; next_action: string | null; owner_email: string | null; deadline: string | null; needs_human: string | null; has_draft: boolean; waiting_since: string | null }

export async function loadKnowledge(companyId: string, before: string | null, limit = 50) {
  const [c] = await sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=id,parent_id&limit=1`, [])
  if (!c) return null
  const rows = await sbTry<Row[]>(
    `company_ledger?company_id=eq.${enc(companyId)}${before ? `&occurred_at=lt.${enc(before)}` : ''}&select=id,occurred_at,kind,title,summary,party,actor,links,thread_id,policy_id,work_item_id&order=occurred_at.desc&limit=${limit}`, [])
  // The coordinator's view of this client: every open case, what happens next, who does it, by when.
  const next_steps: NextStep[] = before ? [] : (await sbTry<Row[]>(`work_items?company_id=eq.${enc(companyId)}&closed_at=is.null&select=id,title,case_type,status,next_action,owner_email,deadline,needs_human,draft_id,waiting_since&order=deadline.asc.nullslast,waiting_since.asc.nullslast&limit=40`, []))
    .map(w => ({ id: w.id, title: w.title, case_type: w.case_type, status: w.status, next_action: w.next_action ?? null, owner_email: w.owner_email ?? null, deadline: w.deadline ?? null, needs_human: w.needs_human ?? null, has_draft: !!w.draft_id, waiting_since: w.waiting_since ?? null }))
  return { entries: rows, next: rows.length === limit ? rows[rows.length - 1].occurred_at : null, next_steps }
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

/**
 * The send route (/api/email/send, not to be changed) addresses a draft by its contact. A draft
 * written by an agent to an address with no contact row gets one here, for its first recipient,
 * before it is sent. Shared by both prepare steps (Today's Send and the paired draft).
 */
export async function ensureDraftContact(id: string): Promise<void> {
  const [d] = await sb<Row[]>(`ai_drafts?id=eq.${enc(id)}&select=id,contact_id,to_email,work_item_id&limit=1`)
  if (!d || d.contact_id) return
  const to = String(d.to_email ?? '').split(/[,;]/).map(x => x.trim()).find(x => x.includes('@'))
  if (!to) throw new Error('This draft has no recipient. Add one in the To field and send again.')
  const [w] = d.work_item_id ? await sbTry<Row[]>(`work_items?id=eq.${enc(d.work_item_id)}&select=company_id&limit=1`, []) : []
  const contactId = await contactIdFor(to, w?.company_id ?? null)
  if (!contactId) throw new Error(`Could not record ${to} as a contact, so the draft cannot be sent yet.`)
  await sb(`ai_drafts?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ contact_id: contactId }) })
}

/** Fills the signature with the approver's name and returns the id for /api/email/send. */
export async function prepareDraft(id: string, actor: string): Promise<string> {
  const [d] = await sb<Row[]>(`ai_drafts?id=eq.${enc(id)}&select=id,body,status,thread_id&limit=1`)
  if (!d || !['pending', 'draft'].includes(d.status)) throw new Error('This draft was already sent or discarded.')
  await ensureDraftContact(id)
  // The approver's own voice: greeting word, close, name, phone (src/lib/admin/b/voice.ts).
  await sb(`ai_drafts?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body: await fillVoice(String(d.body ?? ''), actor, d.thread_id) }) })
  return d.id
}

// ── Pending, the home canvas, and edits ───────────────────────────────────────────────────────

/** Until 20261103_pending.sql is applied the columns are absent; one failure stops the writes for this process. */
let pendingColumnsMissing = false

/** Writes the computed level back onto rows whose stored value differs. Fire-and-forget. */
async function storePending(rows: Row[], items: TodayItem[], now: Date): Promise<number> {
  if (pendingColumnsMissing) return 0
  const by = new Map(items.map(i => [i.id, i]))
  let n = 0
  for (const r of rows) {
    const i = by.get(r.id); if (!i) continue
    const p = i.pending
    if (r.pending_level === p.level && (r.pending_reason ?? null) === p.reason && (r.pending_since ?? null) === p.since && (r.pending_due ?? null) === p.due) continue
    try {
      await sb(`work_items?id=eq.${enc(r.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pending_level: p.level, pending_reason: p.reason, pending_since: p.since, pending_due: p.due, pending_computed_at: now.toISOString() }) })
      n++
    } catch (e) {
      // The stored copy is a cache; the next load recomputes. A missing column means the migration is not applied yet.
      if (/pending_level|column/i.test(String(e))) { pendingColumnsMissing = true; return n }
    }
  }
  return n
}

/** Recomputes every open item's pending level and stores it. For crons. */
export async function recomputePending(now = new Date()): Promise<{ items: number; updated: number; red: number; amber: number }> {
  const rows = await openItems()
  const { primary } = await draftsFor(rows)
  const pols = await policiesByCompany(rows)
  const items = rows.map(r => { const d = r.draft_id ? primary.get(r.draft_id) : undefined; return shape(r, 'none', d, [], pols.get(r.company_id) ?? [], now) })
  const updated = await storePending(rows, items, now)
  return { items: items.length, updated, red: items.filter(i => i.pending.level === 'red').length, amber: items.filter(i => i.pending.level === 'amber').length }
}

export type HomeCard = {
  id: string; level: PendingLevel; name: string; line: string; days: number; due: string | null
  action: 'send' | 'forward' | 'decide' | 'read' | 'open'; company_id: string | null; thread_id: string | null; owner_email: string | null
}
export type HomeBridgeData = {
  key: HomeBridge; open: number; trs: number; drafts: number; red: number; waiting_client: number; waiting_insurer: number
  client: HomeCard[]; insurer: HomeCard[]; centre: HomeCard[]
  more_client: number; more_insurer: number; more_centre: number
}
export type HomeCanvas = { bridges: HomeBridgeData[]; open: number; drafts: number; decisions: number; red: number; clients: number; insurers: number }

const SIDE_CARDS = 3

/** The home canvas: per bridge, the cards on each side (most urgent first) and the counts. */
export async function loadHomeCanvas(now = new Date()): Promise<HomeCanvas> {
  const items = (await loadToday(now)).filter(i => i.group !== 'later')
  // Today keeps only items that need a person; the canvas shows every open item that waits on a side.
  const rows = await openItems()
  const { primary } = await draftsFor(rows)
  const pols = await policiesByCompany(rows)
  const seenIds = new Set(items.map(i => i.id))
  const all: TodayItem[] = [...items, ...rows.filter(r => !seenIds.has(r.id) && !r.later_until).map(r => { const d = r.draft_id ? primary.get(r.draft_id) : undefined; return shape(r, 'none', d, [], pols.get(r.company_id) ?? [], now) })]
  const threadOf = new Map<string, string>()
  for (const r of rows) { const t = (r.work_item_threads ?? [])[0]?.thread_id; if (t) threadOf.set(r.id, t) }
  const dayCount = (i: TodayItem) => i.pending.since ? Math.max(0, Math.floor((now.getTime() - Date.parse(i.pending.since)) / 86_400_000)) : 0
  const card = (i: TodayItem): HomeCard => ({
    id: i.id, level: i.pending.level, days: dayCount(i), due: i.pending.due, company_id: i.company_id, thread_id: threadOf.get(i.id) ?? null, owner_email: i.owner_email,
    name: i.side === 'insurer' && i.insurer_name ? `${i.insurer_name} · ${i.client}` : i.client,
    line: i.pending.level === 'red' || i.pending.level === 'amber' ? `${i.title} · ${i.pending.reason.toLowerCase()}` : i.title,
    action: i.group === 'decide' ? 'decide' : i.draft?.kind === 'forward_to_insurer' ? 'forward' : i.draft ? 'send' : i.group === 'read' ? 'read' : 'open',
  })
  // Two reads of the same mail can open twin items; the canvas shows one card per client and title, the most urgent.
  const twins = new Map<string, TodayItem>()
  for (const i of all.sort((a, b) => LEVEL_RANK[a.pending.level] - LEVEL_RANK[b.pending.level])) {
    const k = `${i.company_id ?? i.client}|${i.title.trim().toLowerCase()}`
    if (!twins.has(k)) twins.set(k, i)
  }
  const shown = Array.from(twins.values())
  const bridges: HomeBridgeData[] = (['rfq', 'claims', 'endorsements'] as HomeBridge[]).map(key => {
    const mine = shown.filter(i => i.bridge === key)
    const side = (s: Side) => mine.filter(i => i.side === s).map(card).sort(cardOrder)
    const client = side('client'), insurer = side('insurer')
    // The centre carries what TRS itself owes: a draft or forward ready, or a red or amber case TRS must act on.
    const centre = mine.filter(i => i.side === 'trs' && (i.draft || i.pending.level === 'red' || i.pending.level === 'amber')).map(card).sort(cardOrder)
    return {
      key, open: mine.length, trs: mine.filter(i => i.side === 'trs').length, drafts: mine.filter(i => !!i.draft && !i.needs_human).length,
      red: mine.filter(i => i.pending.level === 'red').length,
      waiting_client: client.length, waiting_insurer: insurer.length,
      client: client.slice(0, SIDE_CARDS), insurer: insurer.slice(0, SIDE_CARDS), centre: centre.slice(0, SIDE_CARDS),
      more_client: Math.max(0, client.length - SIDE_CARDS), more_insurer: Math.max(0, insurer.length - SIDE_CARDS), more_centre: Math.max(0, centre.length - SIDE_CARDS),
    }
  })
  return {
    bridges, open: all.length, drafts: items.filter(i => i.group === 'send').length, decisions: items.filter(i => i.group === 'decide').length,
    red: shown.filter(i => i.pending.level === 'red').length,
    clients: new Set(all.filter(i => i.company_id).map(i => i.company_id)).size,
    insurers: new Set(all.map(i => i.insurer_name?.trim()).filter(Boolean)).size,
  }
}

export const CASE_TYPES = ['claim', 'renewal', 'new_quote', 'endorsement', 'member_movement', 'premium_billing', 'documents', 'enquiry', 'other'] as const
export const STATUSES = ['trs_to_act', 'waiting_client', 'waiting_insurer', 'stalled', 'done'] as const

export type ItemEdit = {
  title?: string; company_id?: string | null; policy_id?: string | null; case_type?: string; status?: string
  owner_email?: string | null; deadline?: string | null; deadline_basis?: string | null; next_action?: string | null
  insurer_name?: string | null; pending_override?: PendingLevel | null; pending_override_reason?: string | null
}

/** Edits the case itself. Every changed field is written and logged; unknown fields are refused. */
export async function editItem(id: string, e: ItemEdit, actor: string): Promise<{ changes: Record<string, { from: unknown; to: unknown }> }> {
  const [cur] = await sb<Row[]>(`work_items?id=eq.${enc(id)}&select=*&limit=1`)
  if (!cur) throw new Error('This item no longer exists.')
  const patch: Row = {}
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  const set = (k: string, v: unknown) => { if ((cur[k] ?? null) !== (v ?? null)) { patch[k] = v; changes[k] = { from: cur[k] ?? null, to: v ?? null } } }
  if (e.title !== undefined) { const t = e.title.trim(); if (!t) throw new Error('A case needs a title.'); set('title', t.slice(0, 200)) }
  if (e.case_type !== undefined) { if (!(CASE_TYPES as readonly string[]).includes(e.case_type)) throw new Error('Unknown case type.'); set('case_type', e.case_type) }
  if (e.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(e.status)) throw new Error('Unknown status.')
    set('status', e.status)
    if (e.status === 'done') { set('closed_at', new Date().toISOString()); set('closed_by', actor) }
    else if (cur.closed_at) { set('closed_at', null); set('closed_by', null) }
    if ((e.status === 'waiting_client' || e.status === 'waiting_insurer') && (!cur.waiting_since || cur.status !== e.status)) set('waiting_since', new Date().toISOString().slice(0, 10))
  }
  if (e.company_id !== undefined) {
    if (e.company_id) {
      const [c] = await sbTry<Row[]>(`companies?id=eq.${enc(e.company_id)}&select=id,company_name,kind&limit=1`, [])
      if (!c) throw new Error('That client is not on file.')
      if (c.kind && c.kind !== 'client') throw new Error(`${c.company_name} is ${c.kind === 'insurer' ? 'an insurer' : `a ${c.kind}`}, not a client.`)
      set('company_id', c.id); set('client_name', c.company_name)
    } else { set('company_id', null) }
  }
  if (e.policy_id !== undefined) {
    if (e.policy_id) {
      const [p] = await sbTry<Row[]>(`policies?id=eq.${enc(e.policy_id)}&select=id,company_id,policy_number,insurer&limit=1`, [])
      if (!p) throw new Error('That policy is not on file.')
      const company = patch.company_id ?? cur.company_id
      if (company && p.company_id !== company) throw new Error('That policy belongs to another client.')
      set('policy_id', p.id); set('policy_number', p.policy_number ?? null); if (!e.insurer_name && p.insurer) set('insurer_name', p.insurer)
    } else { set('policy_id', null) }
  }
  if (e.owner_email !== undefined) {
    const owner = e.owner_email?.trim().toLowerCase() || null
    if (owner) {
      const [staff] = await sbTry<Row[]>(`contacts?email=eq.${enc(owner)}&is_employee=eq.true&select=email&limit=1`, [])
      const [left] = await sbTry<Row[]>(`staff_departures?email=eq.${enc(owner)}&select=email&limit=1`, [])
      if (!staff || left) throw new Error(`${owner} is not current TRS staff.`)
    }
    set('owner_email', owner)
  }
  if (e.deadline !== undefined) { if (e.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(e.deadline)) throw new Error('The deadline needs a date.'); set('deadline', e.deadline || null) }
  if (e.deadline_basis !== undefined) set('deadline_basis', e.deadline_basis?.trim() || null)
  if (e.next_action !== undefined) set('next_action', e.next_action?.trim() || null)
  if (e.insurer_name !== undefined) set('insurer_name', e.insurer_name?.trim() || null)
  if (e.pending_override !== undefined) {
    if (e.pending_override && !(e.pending_override in LEVEL_RANK)) throw new Error('Unknown level.')
    set('pending_override', e.pending_override || null)
    set('pending_override_reason', e.pending_override ? (e.pending_override_reason?.trim() || null) : null)
    set('pending_override_by', e.pending_override ? actor : null)
  }
  if (!Object.keys(patch).length) return { changes }
  patch.updated_at = new Date().toISOString()
  await sb(`work_items?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
  await event(id, 'edit', actor, { changes })
  return { changes }
}

/** Options for the case editor: current staff, the client's policies, and a client search. */
export async function editOptions(opts: { company_id?: string | null; q?: string | null }) {
  const [staffRows, gone] = await Promise.all([
    sbTry<Row[]>('contacts?is_employee=eq.true&select=email,first_name,last_name&order=first_name.asc', []),
    sbTry<Row[]>('staff_departures?select=email', []),
  ])
  const left = new Set(gone.map(g => String(g.email).toLowerCase()))
  const staff = staffRows.map(r => ({ email: String(r.email).toLowerCase(), name: [r.first_name, r.last_name].filter(Boolean).join(' ') || String(r.email) }))
    .filter(r => !left.has(r.email) && !/^(operations|developer|road-plus|manager\.mis)@/.test(r.email))
  const policies = opts.company_id
    ? (await sbTry<Row[]>(`policies?company_id=eq.${enc(opts.company_id)}&select=id,insurer,class_of_insurance,product_line,policy_number,end_date,lifecycle&order=end_date.desc.nullslast&limit=40`, []))
        .map(p => ({ id: p.id, label: [p.class_of_insurance ?? p.product_line, p.insurer, p.policy_number, p.end_date ? `to ${p.end_date}` : null].filter(Boolean).join(' · ') }))
    : []
  const q = opts.q?.trim()
  const companies = q && q.length >= 2
    ? (await sbTry<Row[]>(`companies?kind=eq.client&company_name=ilike.*${enc(q)}*&select=id,company_name&order=company_name.asc&limit=12`, [])).map(c => ({ id: c.id, name: c.company_name }))
    : []
  return { staff, policies, companies }
}

/** Replaces a draft's attachment list: files already on the draft to keep, plus data-room documents by id. */
export async function setDraftAttachments(draftId: string, keep: string[], addDocumentIds: string[]): Promise<TodayDraft['attachments']> {
  const [d] = await sb<Row[]>(`ai_drafts?id=eq.${enc(draftId)}&select=id,status,attachments&limit=1`)
  if (!d || !['pending', 'draft'].includes(d.status)) throw new Error('This draft was already sent or discarded.')
  const current: Row[] = (d.attachments ?? []).filter((a: Row) => keep.includes(a.filename))
  if (addDocumentIds.length) {
    const docs = await sbTry<Row[]>(`policy_documents?id=in.(${addDocumentIds.map(enc).join(',')})&select=id,filename,title,mime_type,drive_file_id,storage_url`, [])
    for (const doc of docs) {
      const ref = doc.drive_file_id ? `drivefile:${doc.drive_file_id}` : doc.storage_url
      if (!ref) throw new Error(`${doc.title || doc.filename} has no file to attach.`)
      if (!current.some(a => a.filename === doc.filename)) current.push({ filename: doc.filename, mime_type: doc.mime_type ?? null, storage_url: ref, document_id: doc.id })
    }
  }
  if (current.length > 10) throw new Error('At most 10 attachments on one email.')
  await sb(`ai_drafts?id=eq.${enc(draftId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ attachments: current }) })
  return current.map(a => ({ filename: a.filename, storage_url: a.storage_url ?? null, mime_type: a.mime_type ?? null }))
}
