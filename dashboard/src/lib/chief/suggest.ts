/**
 * Suggestions: what the mail makes possible, offered as one line and one button. The rules are
 * deterministic reads of what arrived; the person says yes, and an existing action runs.
 *
 *   price_census   a client's spreadsheet reads as a member list and no quotation has been priced
 *                  from it → run the group benefits agent on that email (src/lib/gb/intake.ts),
 *                  which prices the Tier A insurers and opens the plan builder.
 *
 * More rules go here as single cases: the shape stays one suggestion, one yes, one result.
 */
import { sbTry, enc } from '@/lib/crm/db'
import { isInternal } from '@/lib/crm/db'
import { runGroupBenefitIntake } from '@/lib/gb/intake'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { censusMembers, isSheetFile } from './census'

type Row = Record<string, any>

export type Suggestion = {
  key: string
  kind: 'price_census'
  title: string
  detail: string
  yes: string
  /** The live copy of the email, and the copy whose attachment was parsed (one email reaching two
   *  mailboxes is stored twice; the duplicate is soft-deleted after its files were read). */
  messageId: string
  textMessageId: string
  attachment: string
  rows: number
  /** Already acted on from this file: where the result is. */
  done: { quotationId: string; members: number } | null
}
export type ThreadSuggestion = Suggestion & { threadId: string; subject: string | null; company: string | null; companyId: string | null; receivedAt: string }
export type SuggestionOutcome = { ok: true; quotationId: string; summary: string } | { ok: false; error: string }

type Att = { thread_id: string; message_id: string; filename: string; mime_type: string | null; size_bytes: number | null; parsed_text: string | null; created_at: string }
const ATT_COLS = 'thread_id,message_id,filename,mime_type,size_bytes,parsed_text,created_at'

const money = (n: number) => `S$${Math.round(n).toLocaleString('en-SG')}`
const bareAddress = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()

/** Live inbound messages among the ids, from outside TRS. */
async function inboundLive(ids: string[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>()
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await sbTry<Row[]>(`email_messages?id=in.(${ids.slice(i, i + 100).join(',')})&deleted_at=is.null&select=id,thread_id,direction,from_address,sent_at`, [])
    for (const m of rows) if (m.direction === 'inbound' && !isInternal(bareAddress(m.from_address))) out.set(m.id, m)
  }
  return out
}

/** Quotations the agent drafted from each message (its notes carry the message tag). */
async function quotationsByMessage(ids: string[]): Promise<Map<string, { id: string; member_count: number }>> {
  const out = new Map<string, { id: string; member_count: number }>()
  for (const id of ids) {
    const [q] = await sbTry<Row[]>(`gb_quotations?notes=like.${enc(`*[message:${id}]*`)}&select=id,member_count,superseded_by&order=created_at.desc&limit=1`, [])
    if (q) out.set(id, { id: q.superseded_by ?? q.id, member_count: Number(q.member_count ?? 0) })
  }
  return out
}

/** The suggestions a set of spreadsheet attachments gives, one per census file. */
async function fromAttachments(atts: Att[], dismissed: Set<string>): Promise<(Suggestion & { threadId: string; receivedAt: string })[]> {
  const sheets = atts.filter(a => isSheetFile(a.filename, a.mime_type))
  if (!sheets.length) return []
  // The parsed text may sit on another copy of the same email: same file name and size.
  const textOf = new Map<string, Att>()
  for (const a of sheets) if ((a.parsed_text ?? '').length > 40 && !textOf.has(`${a.filename}|${a.size_bytes ?? ''}`)) textOf.set(`${a.filename}|${a.size_bytes ?? ''}`, a)
  if (!textOf.size) return []
  const live = await inboundLive(Array.from(new Set(sheets.map(a => a.message_id))))
  const seen = new Set<string>()
  const candidates: (Att & { textMessageId: string; rows: number; company: string | null; insurer: string | null; others: number })[] = []
  for (const a of sheets) {
    if (!live.has(a.message_id)) continue
    const k = `${a.message_id}|${a.filename}`
    if (seen.has(k)) continue
    seen.add(k)
    const text = (a.parsed_text ?? '').length > 40 ? a : textOf.get(`${a.filename}|${a.size_bytes ?? ''}`)
    const sig = censusMembers(text?.parsed_text)
    if (!sig || !text) continue
    candidates.push({ ...a, textMessageId: text.message_id, rows: sig.members.length, company: sig.company, insurer: sig.insurer, others: sig.others.length })
  }
  if (!candidates.length) return []
  const priced = await quotationsByMessage(Array.from(new Set(candidates.flatMap(c => [c.message_id, c.textMessageId]))))
  const out: (Suggestion & { threadId: string; receivedAt: string })[] = []
  for (const c of candidates) {
    const key = `price_census:${c.message_id}:${c.textMessageId}`
    if (dismissed.has(key)) continue
    const q = priced.get(c.message_id) ?? priced.get(c.textMessageId)
    // The agent read this file and found no members: its call, not a nag.
    if (q && q.member_count === 0) continue
    out.push({
      key, kind: 'price_census', messageId: c.message_id, textMessageId: c.textMessageId, attachment: c.filename, rows: c.rows, threadId: c.thread_id, receivedAt: c.created_at,
      title: `Census received: ${c.rows} member${c.rows === 1 ? '' : 's'}${c.others ? ` (+${c.others} other compan${c.others === 1 ? 'y' : 'ies'} in the file)` : ''}`,
      detail: [c.filename, c.company, c.insurer ? `current insurer ${c.insurer}` : null].filter(Boolean).join(' · '),
      yes: 'Price the Tier A insurers',
      done: q ? { quotationId: q.id, members: q.member_count } : null,
    })
  }
  return out
}

/** The suggestions for one thread. */
export async function suggestionsFor(threadId: string, dismissed: readonly string[] = []): Promise<Suggestion[]> {
  const atts = await sbTry<Att[]>(`email_attachments?thread_id=eq.${enc(threadId)}&select=${ATT_COLS}&order=created_at.desc&limit=60`, [])
  return (await fromAttachments(atts, new Set(dismissed))).map(({ threadId: _t, receivedAt: _r, ...s }) => s)
}

/** Suggestions across the viewer's threads for the home list: client threads, newest first. */
export async function recentSuggestions(viewer: string | null, days = 14): Promise<ThreadSuggestion[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const atts = await sbTry<Att[]>(`email_attachments?created_at=gte.${enc(since)}&or=(mime_type.ilike.*spreadsheet*,mime_type.ilike.*ms-excel*,mime_type.ilike.*csv*,filename.ilike.*.xlsx,filename.ilike.*.xls,filename.ilike.*.csv)&select=${ATT_COLS}&order=created_at.desc&limit=200`, [])
  if (!atts.length) return []
  const threadIds = Array.from(new Set(atts.map(a => a.thread_id)))
  const visible = await visibleThreadIds(threadIds, viewer)
  const threads = new Map<string, Row>()
  for (let i = 0; i < threadIds.length; i += 100) {
    for (const t of await sbTry<Row[]>(`email_threads?id=in.(${threadIds.slice(i, i + 100).join(',')})&deleted_at=is.null&select=id,subject,company_id,companies(company_name,kind)`, [])) threads.set(t.id, t)
  }
  const holds = new Map<string, Set<string>>()
  for (let i = 0; i < threadIds.length; i += 100) {
    const keys = threadIds.slice(i, i + 100).map(id => `"thread_bar:${id}"`)
    for (const r of await sbTry<Row[]>(`app_settings?key=in.(${keys.join(',')})&select=key,value`, [])) {
      try { const v = JSON.parse(r.value ?? '{}'); if (Array.isArray(v.dismissed)) holds.set(String(r.key).slice('thread_bar:'.length), new Set(v.dismissed)) } catch { /* no hold */ }
    }
  }
  const kept = atts.filter(a => visible.has(a.thread_id) && threads.has(a.thread_id) && (threads.get(a.thread_id)!.companies?.kind ?? 'client') === 'client')
  const all = await fromAttachments(kept, new Set())
  return all
    .filter(s => !holds.get(s.threadId)?.has(s.key))
    .map(s => {
      const t = threads.get(s.threadId)!
      return { ...s, subject: t.subject ?? null, company: t.companies?.company_name ?? null, companyId: t.company_id ?? null }
    })
    .sort((a, b) => Number(!!a.done) - Number(!!b.done) || b.receivedAt.localeCompare(a.receivedAt))
}

/** Runs the action behind a suggestion. */
export async function runSuggestion(threadId: string, key: string): Promise<SuggestionOutcome> {
  const [kind, messageId, textMessageId] = key.split(':')
  if (kind !== 'price_census' || !messageId) return { ok: false, error: 'Unknown suggestion.' }
  // The agent reads the copy whose files were parsed, so it does not wait on a parse that never comes.
  const r = await runGroupBenefitIntake(threadId, textMessageId || messageId)
  switch (r.status) {
    case 'drafted': {
      const range = r.cheapest != null && r.dearest != null ? ` · ${money(r.cheapest)}–${money(r.dearest)} a year` : ''
      return { ok: true, quotationId: r.quotationId, summary: `Priced at ${r.complete} of ${r.insurers} insurer${r.insurers === 1 ? '' : 's'}${range}` }
    }
    case 'skipped': return r.quotationId ? { ok: true, quotationId: r.quotationId, summary: 'Already priced from this file' } : { ok: false, error: r.reason ?? 'The agent did not run.' }
    case 'joined': return { ok: true, quotationId: r.quotationId, summary: 'Joined the open request' }
    case 'tier_c': return { ok: true, quotationId: r.quotationId, summary: `Company in ${r.country}: Tier C insurers to ask by email` }
    case 'awaiting_census': return { ok: false, error: 'The agent found no members it could read in this file.' }
    case 'not_a_request': return { ok: false, error: 'The agent did not read this email as a benefits request.' }
    case 'failed': return { ok: false, error: r.reason }
    default: return { ok: false, error: 'The agent did not run.' }
  }
}
