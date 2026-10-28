/**
 * Reads and writes for the placement tables. Server-side only (service key through @/lib/crm/db).
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import type {
  LogKind, Placement, PlacementBundle, PlacementDispatch, PlacementLine, PlacementLogEntry,
  PlacementQuote, PlacementRound, PlacementTier,
} from './types'
import { domainOf, isOrgDomain, type OpenDispatch } from './match'
import { listProducts } from '@/lib/insurer-products'

const SEL = { prefer: { 'Prefer': 'return=representation' } }

export async function loadBundle(companyId: string): Promise<PlacementBundle> {
  const placements = await sbTry<Placement[]>(`placements?company_id=eq.${companyId}&order=created_at.desc`, [])
  const ids = placements.map(p => p.id)
  const log = await sbTry<PlacementLogEntry[]>(`placement_log?company_id=eq.${companyId}&order=created_at.desc&limit=400`, [])
  if (ids.length === 0) return { placements, lines: [], rounds: [], dispatches: [], quotes: [], tiers: [], log }
  const f = `placement_id=in.(${ids.join(',')})`
  const [lines, rounds, dispatches, quotes, tiers] = await Promise.all([
    sbTry<PlacementLine[]>(`placement_lines?${f}&order=sort.asc,created_at.asc`, []),
    sbTry<PlacementRound[]>(`placement_rounds?${f}&order=round_no.asc`, []),
    sbTry<PlacementDispatch[]>(`placement_dispatches?${f}&order=created_at.asc`, []),
    sbTry<PlacementQuote[]>(`placement_quotes?${f}&order=created_at.asc`, []),
    sbTry<PlacementTier[]>(`placement_tiers?${f}&order=sort.asc,created_at.asc`, []),
  ])
  return { placements, lines, rounds, dispatches: await withProductNames(dispatches), quotes, tiers, log }
}

/**
 * Every placement still in play, across all clients, for the RFQ register: open, with the client
 * or bound and waiting on its debit note. The log is only the unacted client changes the
 * register flags; company names come back keyed by id.
 */
export async function loadOpenBundle(): Promise<{ bundle: PlacementBundle; companyNames: Map<string, string>; doneThisMonth: number }> {
  const placements = await sbTry<Placement[]>('placements?status=in.(open,presented,bound)&order=created_at.desc&limit=500', [])
  const monthStart = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 8) + '01T00:00:00+08:00'
  const done = await sbTry<{ id: string }[]>(`placement_lines?done_at=gte.${enc(monthStart)}&select=id`, [])
  const companyIds = [...new Set(placements.map(p => p.company_id))]
  const companies = companyIds.length ? await sbTry<{ id: string; company_name: string }[]>(`companies?id=in.(${companyIds.join(',')})&select=id,company_name`, []) : []
  const companyNames = new Map(companies.map(c => [c.id, c.company_name]))
  if (placements.length === 0) return { bundle: { placements, lines: [], rounds: [], dispatches: [], quotes: [], tiers: [], log: [] }, companyNames, doneThisMonth: done.length }
  const f = `placement_id=in.(${placements.map(p => p.id).join(',')})`
  const [lines, rounds, dispatches, quotes, tiers, log] = await Promise.all([
    sbTry<PlacementLine[]>(`placement_lines?${f}&order=sort.asc,created_at.asc`, []),
    sbTry<PlacementRound[]>(`placement_rounds?${f}&order=round_no.asc`, []),
    sbTry<PlacementDispatch[]>(`placement_dispatches?${f}&order=created_at.asc`, []),
    sbTry<PlacementQuote[]>(`placement_quotes?${f}&status=neq.superseded&order=created_at.asc`, []),
    sbTry<PlacementTier[]>(`placement_tiers?${f}&order=sort.asc,created_at.asc`, []),
    sbTry<PlacementLogEntry[]>(`placement_log?${f}&kind=eq.change&order=created_at.desc&limit=500`, []),
  ])
  return { bundle: { placements, lines, rounds, dispatches, quotes, tiers, log }, companyNames, doneThisMonth: done.length }
}

/** The insurer's product name on each dispatch that names one, so the grid reads "MSIG · WICA Plus". */
async function withProductNames(ds: PlacementDispatch[]): Promise<PlacementDispatch[]> {
  const ids = [...new Set(ds.map(d => d.insurer_product_id).filter((x): x is string => !!x))]
  if (ids.length === 0) return ds
  const names = new Map((await sbTry<{ id: string; name: string }[]>(`insurer_products?id=in.(${ids.join(',')})&select=id,name`, [])).map(p => [p.id, p.name]))
  return ds.map(d => d.insurer_product_id ? { ...d, insurer_product_name: names.get(d.insurer_product_id) ?? null } : d)
}

export async function loadPlacement(id: string): Promise<PlacementBundle | null> {
  const [p] = await sbTry<Placement[]>(`placements?id=eq.${id}&limit=1`, [])
  if (!p) return null
  const b = await loadBundle(p.company_id)
  const keep = (x: { placement_id: string | null }) => x.placement_id === id
  return {
    placements: [p], lines: b.lines.filter(keep), rounds: b.rounds.filter(keep),
    dispatches: b.dispatches.filter(keep), quotes: b.quotes.filter(keep), tiers: b.tiers.filter(keep), log: b.log.filter(e => keep(e) || e.placement_id == null),
  }
}

/** A read that comes back empty rather than failing. */
export const rows = <T>(path: string): Promise<T[]> => sbTry<T[]>(path, [])

export async function insert<T>(table: string, row: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]> {
  return sb<T[]>(table, { method: 'POST', headers: SEL.prefer, body: JSON.stringify(row) })
}

export async function patch<T>(table: string, filter: string, row: Record<string, unknown>): Promise<T[]> {
  return sb<T[]>(`${table}?${filter}`, { method: 'PATCH', headers: SEL.prefer, body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) })
}

export async function patchNoTs<T>(table: string, filter: string, row: Record<string, unknown>): Promise<T[]> {
  return sb<T[]>(`${table}?${filter}`, { method: 'PATCH', headers: SEL.prefer, body: JSON.stringify(row) })
}

/** One entry in the company memory. Never throws: a failed log line must not fail the work it records. */
export async function log(e: {
  company_id: string; placement_id?: string | null; line_id?: string | null; round_id?: string | null; dispatch_id?: string | null
  kind: LogKind; actor?: string; text: string; thread_id?: string | null; message_id?: string | null; detail?: Record<string, unknown>
}): Promise<PlacementLogEntry | null> {
  try {
    const [row] = await insert<PlacementLogEntry>('placement_log', {
      company_id: e.company_id, placement_id: e.placement_id ?? null, line_id: e.line_id ?? null, round_id: e.round_id ?? null,
      dispatch_id: e.dispatch_id ?? null, kind: e.kind, actor: e.actor ?? 'agent', text: e.text.slice(0, 2000),
      thread_id: e.thread_id ?? null, message_id: e.message_id ?? null, detail: e.detail ?? {},
    })
    return row ?? null
  } catch (err) {
    console.error('[placement] log failed', err instanceof Error ? err.message : err)
    return null
  }
}

/** The dispatch a thread belongs to, by our thread id or by Gmail's. */
export async function dispatchForThread(threadId: string | null, gmailThreadId: string | null): Promise<PlacementDispatch | null> {
  const ors: string[] = []
  if (threadId) ors.push(`thread_id.eq.${threadId}`)
  if (gmailThreadId) ors.push(`gmail_thread_id.eq.${enc(gmailThreadId)}`)
  if (ors.length === 0) return null
  const rows = await sbTry<PlacementDispatch[]>(`placement_dispatches?or=(${ors.join(',')})&order=created_at.desc&limit=1`, [])
  return rows[0] ?? null
}

/** The request whose Message-ID this is, or whose Message-ID a reply answers. */
export async function dispatchesByRfc822(messageId: string): Promise<PlacementDispatch[]> {
  const id = messageId.trim()
  if (!id) return []
  return sbTry<PlacementDispatch[]>(`placement_dispatches?rfc822_message_id=eq.${enc(id)}&order=created_at.desc`, [])
}

/** Requests still waiting on, or answered by, an insurer at this address or domain, with their placement's reference. */
export async function openDispatchesFor(email: string): Promise<(OpenDispatch & { company_id: string })[]> {
  const domain = domainOf(email)
  const who = isOrgDomain(domain) ? `to_email=ilike.*${enc('@' + domain)}` : `to_email=ilike.${enc(email.trim().toLowerCase())}`
  type Row = Pick<PlacementDispatch, 'id' | 'placement_id' | 'line_id' | 'round_id' | 'company_id' | 'to_email' | 'sent_subject' | 'rfc822_message_id'>
    & { placements: { ref: string; status: string } | null; placement_lines: { current_round_id: string | null } | null }
  const rows = await sbTry<Row[]>(`placement_dispatches?${who}&status=in.(sent,acknowledged,info_requested,quoted)&select=id,placement_id,line_id,round_id,company_id,to_email,sent_subject,rfc822_message_id,placements(ref,status),placement_lines(current_round_id)&order=created_at.desc&limit=200`, [])
  return rows.filter(r => r.placements && r.placements.status !== 'closed').map(r => ({
    id: r.id, placement_id: r.placement_id, placement_ref: r.placements!.ref, line_id: r.line_id, company_id: r.company_id,
    to_email: r.to_email, sent_subject: r.sent_subject ?? null, rfc822_message_id: r.rfc822_message_id ?? null,
    current: !r.placement_lines?.current_round_id || r.placement_lines.current_round_id === r.round_id,
  }))
}

export async function dispatchesByIds(ids: string[]): Promise<PlacementDispatch[]> {
  if (ids.length === 0) return []
  return sbTry<PlacementDispatch[]>(`placement_dispatches?id=in.(${ids.join(',')})`, [])
}

/** Open placements named by reference, for a company. */
export async function placementsByRefs(companyId: string, refs: string[]): Promise<Placement[]> {
  if (refs.length === 0) return []
  return sbTry<Placement[]>(`placements?company_id=eq.${companyId}&ref=in.(${refs.map(enc).join(',')})&status=neq.closed`, [])
}

/** The company a contact belongs to, by their email. */
export async function companyForEmail(email: string): Promise<string | null> {
  const rows = await sbTry<{ company_id: string | null }[]>(`contacts?email=ilike.${enc(email.trim().toLowerCase())}&select=company_id&limit=1`, [])
  return rows[0]?.company_id ?? null
}

export type UnmatchedRow = {
  id: string; message_id: string; thread_id: string | null; from_address: string | null; forwarded_by: string | null; subject: string | null
  reason: string; candidate_dispatch_ids: string[]; company_id: string | null; status: 'open' | 'assigned' | 'ignored'
  assigned_dispatch_ids: string[]; resolved_by: string | null; resolved_at: string | null; created_at: string
}
/** A reply the agent could not place, queued for a broker. Once per message. */
export async function queueUnmatched(row: Omit<UnmatchedRow, 'id' | 'status' | 'assigned_dispatch_ids' | 'resolved_by' | 'resolved_at' | 'created_at'>): Promise<void> {
  await sbTry('placement_unmatched?on_conflict=message_id', null, { method: 'POST', headers: { 'Prefer': 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(row) })
}

export async function placementForClientThread(threadId: string): Promise<Placement | null> {
  const rows = await sbTry<Placement[]>(`placements?client_thread_id=eq.${threadId}&status=neq.closed&order=created_at.desc&limit=1`, [])
  return rows[0] ?? null
}

export async function dispatchesForDraft(draftId: string): Promise<PlacementDispatch[]> {
  return sbTry<PlacementDispatch[]>(`placement_dispatches?ai_draft_id=eq.${draftId}`, [])
}

// ── Mail rows the agent reads ──────────────────────────────────────────────────────────────

export type MailMessage = { id: string; thread_id: string; direction: 'inbound' | 'outbound'; from_address: string | null; subject: string | null; body_text: string | null; sent_at: string | null; has_attachments: boolean | null; rfc822_message_id?: string | null; in_reply_to?: string | null }
export type MailAttachment = { id: string; message_id: string; filename: string; mime_type: string | null; parsed_text: string | null }

export async function threadMessages(threadId: string, limit = 30): Promise<MailMessage[]> {
  const rows = await sbTry<MailMessage[]>(`email_messages?thread_id=eq.${threadId}&select=id,thread_id,direction,from_address,subject,body_text,sent_at,has_attachments&order=sent_at.desc&limit=${limit}`, [])
  return rows.reverse()
}

export async function message(id: string): Promise<MailMessage | null> {
  const rows = await sbTry<MailMessage[]>(`email_messages?id=eq.${id}&select=id,thread_id,direction,from_address,subject,body_text,sent_at,has_attachments,rfc822_message_id,in_reply_to&limit=1`, [])
  return rows[0] ?? null
}

/** Waits for the ingest's attachment extraction (it runs alongside) — up to ~90 s, then takes what is there. */
export async function attachmentsFor(messageId: string, expect: boolean, waitMs = 90_000): Promise<MailAttachment[]> {
  const q = `email_attachments?message_id=eq.${messageId}&select=id,message_id,filename,mime_type,parsed_text&order=created_at.asc`
  const started = Date.now()
  for (;;) {
    const rows = await sbTry<MailAttachment[]>(q, [])
    const ready = rows.length > 0 && rows.every(r => r.parsed_text != null)
    if (!expect || ready || Date.now() - started > waitMs) return rows
    await new Promise(r => setTimeout(r, 10_000))
  }
}

export type ThreadRow = { id: string; subject: string | null; gmail_thread_id: string; company_id: string | null; contact_id: string | null }
export async function thread(id: string): Promise<ThreadRow | null> {
  const rows = await sbTry<ThreadRow[]>(`email_threads?id=eq.${id}&select=id,subject,gmail_thread_id,company_id,contact_id&limit=1`, [])
  return rows[0] ?? null
}
export async function threadByGmailId(gmailThreadId: string): Promise<ThreadRow | null> {
  const rows = await sbTry<ThreadRow[]>(`email_threads?gmail_thread_id=eq.${enc(gmailThreadId)}&select=id,subject,gmail_thread_id,company_id,contact_id&limit=1`, [])
  return rows[0] ?? null
}

export type CompanyRow = { id: string; company_name: string; stage: string; domains: string[] | null }
export async function company(id: string): Promise<CompanyRow | null> {
  const rows = await sbTry<CompanyRow[]>(`companies?id=eq.${id}&select=id,company_name,stage,domains&limit=1`, [])
  return rows[0] ?? null
}

/** Opening a placement puts the company at Quoting unless it is already a client in renewal or further along. */
export async function markQuoting(companyId: string): Promise<void> {
  const c = await company(companyId)
  if (!c) return
  if (c.stage === 'lead' || c.stage === 'prospect' || c.stage === 'client' || c.stage === 'lapsed') {
    await sbTry(`companies?id=eq.${companyId}`, null, { method: 'PATCH', body: JSON.stringify({ stage: 'quoting', stage_changed_at: new Date().toISOString() }) })
  }
}

// ── Insurer routing ─────────────────────────────────────────────────────────────────────────

export type InsurerRoute = {
  insurer_name: string; insurer_company_id: string | null; contact_id: string; email: string; name: string | null; product_line: string
  /** The insurer product the request asks about (Insurers page); null for a route from the old contact list. */
  product_id?: string | null; product_name?: string | null; is_default?: boolean
}

/**
 * Everyone on file for the product lines, one row per insurer product and person. A line with
 * products on the Insurers page routes from them alone; a line with none still routes from the
 * old per-line contact list, so nothing stops working before the directory is filled in.
 */
export async function insurerRoutes(productLines: string[]): Promise<InsurerRoute[]> {
  const products = await listProducts({ productLines, activeOnly: true })
  const covered = new Set(products.map(p => p.product_line))
  const fromProducts: InsurerRoute[] = products.flatMap(p => p.contacts.map(c => ({
    insurer_name: p.insurer_name, insurer_company_id: p.insurer_company_id, contact_id: c.contact_id, email: c.email, name: c.name,
    product_line: p.product_line, product_id: p.id, product_name: p.name, is_default: c.is_default,
  })))
  const rest = productLines.filter(l => !covered.has(l))
  return rest.length ? [...fromProducts, ...await legacyRoutes(rest)] : fromProducts
}

async function legacyRoutes(productLines: string[]): Promise<InsurerRoute[]> {
  type Row = { product_line: string; insurers: { name: string } | null; contacts: { id: string; email: string | null; first_name: string | null; last_name: string | null } | null }
  const rows = await sbTry<Row[]>(`insurer_contacts?product_line=in.(${productLines.map(enc).join(',')})&select=product_line,insurers(name),contacts(id,email,first_name,last_name)`, [])
  const companies = await sbTry<{ id: string; company_name: string }[]>(`companies?kind=eq.insurer&select=id,company_name`, [])
  const norm = (s: string) => s.toLowerCase().replace(/\b(insurance|assurance|singapore|pte|ltd|limited|company|co|general|group|the)\b/g, ' ').replace(/[^a-z0-9]+/g, '')
  const seen = new Set<string>()
  return rows.flatMap(r => {
    if (!r.insurers?.name || !r.contacts?.email) return []
    const key = `${r.product_line}|${r.insurers.name}|${r.contacts.id}`
    if (seen.has(key)) return []
    seen.add(key)
    const cid = companies.find(c => norm(c.company_name) === norm(r.insurers!.name))?.id ?? null
    const name = [r.contacts.first_name, r.contacts.last_name].filter(Boolean).join(' ').trim() || null
    return [{ insurer_name: r.insurers.name, insurer_company_id: cid, contact_id: r.contacts.id, email: r.contacts.email.toLowerCase(), name, product_line: r.product_line }]
  })
}

/** A contact row for an email, created if new. The ai_drafts table needs one on every draft. */
export async function contactIdFor(email: string, name?: string | null): Promise<string | null> {
  const e = email.trim().toLowerCase()
  const found = await sbTry<{ id: string }[]>(`contacts?email=ilike.${enc(e)}&select=id&limit=1`, [])
  if (found[0]) return found[0].id
  const [first_name, ...rest] = (name ?? '').trim().split(/\s+/).filter(Boolean)
  const made = await sbTry<{ id: string }[]>('contacts', [], { method: 'POST', headers: SEL.prefer, body: JSON.stringify({ email: e, first_name: first_name || null, last_name: rest.join(' ') || null, source: 'placement' }) })
  return made[0]?.id ?? null
}

export type DraftRow = { id: string; to_email: string | null; subject: string | null; body: string; status: string; thread_id: string | null; contact_id: string; email_type: string | null; created_at: string }
export async function createDraft(d: { contact_id: string; to_email: string; subject: string; body: string; thread_id?: string | null; email_type: string; cc?: string[] }): Promise<DraftRow | null> {
  const rows = await insert<DraftRow>('ai_drafts', {
    contact_id: d.contact_id, thread_id: d.thread_id ?? null, channel: 'email', to_email: d.to_email, subject: d.subject, body: d.body,
    status: 'pending', generated_by: 'placement', email_type: d.email_type, cc: d.cc ?? [],
  })
  return rows[0] ?? null
}
/** One draft with the fields a fan-out needs; null when it does not exist. */
export async function draftById(id: string): Promise<(DraftRow & { cc: string[] | null; generated_by: string | null }) | null> {
  const rows = await sbTry<(DraftRow & { cc: string[] | null; generated_by: string | null })[]>(`ai_drafts?id=eq.${id}&select=id,to_email,subject,body,status,thread_id,contact_id,email_type,created_at,cc,generated_by&limit=1`, [])
  return rows[0] ?? null
}
export async function pendingDrafts(ids: string[]): Promise<DraftRow[]> {
  if (ids.length === 0) return []
  return sbTry<DraftRow[]>(`ai_drafts?id=in.(${ids.join(',')})&select=id,to_email,subject,body,status,thread_id,contact_id,email_type,created_at&order=created_at.asc`, [])
}

/** Dispatches whose chase date has passed and that are still waiting. */
export async function sbDue(now: Date): Promise<PlacementDispatch[]> {
  return sbTry<PlacementDispatch[]>(`placement_dispatches?status=in.(sent,acknowledged)&next_chase_at=lte.${enc(now.toISOString())}&order=next_chase_at.asc&limit=100`, [])
}

export async function sbTryContact(id: string): Promise<{ id: string; email: string | null; name: string | null } | null> {
  const rows = await sbTry<{ id: string; email: string | null; first_name: string | null; last_name: string | null }[]>(`contacts?id=eq.${id}&select=id,email,first_name,last_name&limit=1`, [])
  const c = rows[0]
  return c ? { id: c.id, email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null } : null
}
