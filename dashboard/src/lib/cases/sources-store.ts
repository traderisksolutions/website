/**
 * The reads and writes behind case sources (sources.ts), thread labels (labels.ts) and the
 * relevance groups of a client's threads (relevance.ts). No model is called here.
 *
 *   loadSources(caseId, viewer)        picked threads, proposals, excluded threads and the two buckets
 *   pickThread / excludeThread / restoreThread / setSide   a person's choices, each written to the case's events;
 *                                      setSide also takes the insurer a person names for the thread
 *   setLabel(threadId, label, actor)   a person's label; the rule's label is kept beside it
 *   labelThreadsByRule(threadIds)      the rule's label, at ingest and in the backfill; never over a person's
 *   companyRelevance(companyId, viewer) Active, Back burner and Member movements for one client
 *
 * A thread in a colleague's mailbox is counted, never shown: no subject, no text (mail/visibility.ts).
 * A person's pick is a work_item_threads row with joined_by = 'person'; the case worker never moves it.
 */
import { sb, sbTry, enc, inChunks, sbAll } from '@/lib/crm/db'
import { directory } from '@/lib/admin/k/deposit'
import { partyOf } from '@/lib/admin/k/shape'
import { displayName } from '@/lib/insurers'
import { visibleThreadIds, threadVisibleTo, PRIVATE_THREAD } from '@/lib/mail/visibility-server'
import { insurerThreadsFor, waitingByThread } from '@/lib/crm/threads'
import type { WaitingOn } from '@/lib/crm/waiting-on'
import { ownText } from '@/lib/followups/rules'
import { labelOf, isLabel, type Label, type LabelMessage } from './labels'
import { relevanceOf, renewalSeason, RELEVANCE, type Relevance, type Season } from './relevance'
import { buildBuckets, proposeThreads, sideOfThread, isSide, type Bucket, type Candidate, type Proposal, type Said, type Side, type SourceMessage } from './sources'

type Row = Record<string, any>

/** An error a route answers with its own status: 403 private thread, 404 gone, 409 held by another case. */
export class CaseError extends Error {
  constructor(message: string, public status = 400, public extra: Record<string, unknown> = {}) { super(message) }
}

export const PERSON = 'person'
const THREAD_COLS = 'id,subject,display_subject,company_id,last_message_at,label,label_by'
const todayIso = () => new Date().toISOString().slice(0, 10)
const quiet = { Prefer: 'return=minimal' }
const event = (id: string, kind: string, actor: string, detail: Row = {}) =>
  sb('work_item_events', { method: 'POST', headers: quiet, body: JSON.stringify({ work_item_id: id, kind, actor, detail }) })

const subjectOf = (t: Row): string | null => t.display_subject ?? t.subject ?? null
/** The stored label, or the rule's reading of the subject for a thread labelled by nobody yet. */
const labelFor = (t: Row): Label => (isLabel(t.label) ? t.label : labelOf({ subject: t.subject }).label)

export async function caseRow(workItemId: string): Promise<Row> {
  const [item] = await sb<Row[]>(`work_items?id=eq.${enc(workItemId)}&select=id,title,case_type,company_id,client_name,policy_number,next_action,status,owner_email,closed_at&limit=1`)
  if (!item) throw new CaseError('This case no longer exists.', 404)
  return item
}

const threadsById = (ids: string[]) =>
  inChunks(Array.from(new Set(ids)), 80, c => sbAll<Row>(`email_threads?id=in.(${c.join(',')})&deleted_at=is.null&select=${THREAD_COLS}`))

/** A client's threads: filed under it, or filed under an insurer or partner and naming it. */
async function clientThreads(companyId: string): Promise<{ rows: Row[]; named: Set<string> }> {
  const [own, links] = await Promise.all([
    sbTry<Row[]>(`email_threads?company_id=eq.${enc(companyId)}&deleted_at=is.null&select=${THREAD_COLS}&order=last_message_at.desc.nullslast&limit=500`, []),
    sbTry<Row[]>(`thread_insurers?client_company_id=eq.${enc(companyId)}&select=thread_id&limit=1000`, []),
  ])
  const have = new Set(own.map(t => t.id as string))
  const named = new Set(links.map(l => l.thread_id as string).filter(id => !have.has(id)))
  return { rows: [...own, ...await threadsById(Array.from(named))], named }
}

/** Every message on these threads with its recipients and file names, oldest first. */
export async function caseMessages(threadIds: readonly string[]): Promise<SourceMessage[]> {
  const ids = Array.from(new Set(threadIds))
  if (!ids.length) return []
  const [messages, people, files] = await Promise.all([
    inChunks(ids, 10, c => sbTry<Row[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,direction,from_address,subject,body_text,sent_at&order=sent_at.asc&limit=1000`, [])),
    inChunks(ids, 10, c => sbTry<Row[]>(`email_participants?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=message_id,email,role&limit=1000`, [])),
    inChunks(ids, 10, c => sbTry<Row[]>(`email_attachments?thread_id=in.(${c.join(',')})&select=message_id,filename&limit=1000`, [])),
  ])
  const to = new Map<string, string[]>(), cc = new Map<string, string[]>(), names = new Map<string, string[]>()
  // The sender is on from_address; only the people written to are recipients.
  for (const p of people) if (p.email && p.role !== 'from') { const m = p.role === 'to' ? to : cc; m.set(p.message_id, [...(m.get(p.message_id) ?? []), p.email]) }
  for (const f of files) if (f.filename) names.set(f.message_id, [...(names.get(f.message_id) ?? []), f.filename])
  return messages
    .map(m => ({ id: m.id, thread_id: m.thread_id, direction: m.direction, from_address: m.from_address, subject: m.subject, body_text: m.body_text, sent_at: m.sent_at, to: to.get(m.id) ?? [], cc: cc.get(m.id) ?? [], files: names.get(m.id) ?? [] }))
    .sort((a, b) => String(a.sent_at ?? '').localeCompare(String(b.sent_at ?? '')))
}

/** The insurer a person named for a thread of the case, by thread: the company's id. */
async function namedInsurers(workItemId: string): Promise<Map<string, string>> {
  const rows = await sbTry<Row[]>(`work_item_threads?work_item_id=eq.${enc(workItemId)}&insurer_company_id=not.is.null&select=thread_id,insurer_company_id`, [])
  return new Map(rows.map(r => [r.thread_id as string, r.insurer_company_id as string]))
}

/** The threads a case is built from: what is linked to it, less what a person took off. */
export async function caseThreadIds(workItemId: string): Promise<{ ids: string[]; sides: Map<string, Side>; insurers: Map<string, string> }> {
  const [links, excluded, named] = await Promise.all([
    sbTry<Row[]>(`work_item_threads?work_item_id=eq.${enc(workItemId)}&select=thread_id,side`, []),
    sbTry<Row[]>(`work_item_thread_excluded?work_item_id=eq.${enc(workItemId)}&select=thread_id`, []),
    namedInsurers(workItemId),
  ])
  const off = new Set(excluded.map(e => e.thread_id as string))
  const on = links.filter(l => !off.has(l.thread_id))
  return {
    ids: on.map(l => l.thread_id as string), sides: new Map(on.map(l => [l.thread_id as string, isSide(l.side) ? l.side : 'other'])),
    insurers: new Map(on.filter(l => l.side === 'insurer' && named.has(l.thread_id)).map(l => [l.thread_id as string, named.get(l.thread_id)!])),
  }
}

export type PickedThread = { id: string; subject: string | null; last_message_at: string | null; label: Label; label_by: string | null; side: Side; /** The insurer a person named for the thread. */ insurer: { id: string; name: string } | null; joined_by: string | null; picked_by: string | null; messages: number }
export type ExcludedThread = { id: string; subject: string | null; last_message_at: string | null; label: Label; excluded_by: string; excluded_at: string }
export type CaseSources = {
  item: { id: string; title: string | null; case_type: string; company_id: string | null; client_name: string | null; policy_number: string | null; closed_at: string | null }
  picked: PickedThread[]
  /** The insurers and administrators on file, for naming a thread's insurer. */
  insurers: { id: string; name: string }[]
  /** Threads on the case that sit in a colleague's mailbox: counted, not shown. */
  hidden: number
  proposed: Proposal[]; recent: Candidate[]; older: Candidate[]
  excluded: ExcludedThread[]
  buckets: Record<Bucket, Said[]>
}

/**
 * How close each candidate is to the threads the viewer sees on the case (`thread_vectors`, made on
 * a CPU by scripts/embed-threads.mts). Empty when the case has no thread yet or nothing is embedded:
 * the offer then keeps its newest-first order.
 */
async function similarityTo(reference: string[], candidates: string[]): Promise<Map<string, number>> {
  if (!reference.length || !candidates.length) return new Map()
  const rows = await sbTry<Row[]>('rpc/thread_similarity', [], { method: 'POST', body: JSON.stringify({ p_reference: reference, p_candidates: candidates }) })
  return new Map(rows.filter(r => typeof r.similarity === 'number').map(r => [r.thread_id as string, r.similarity as number]))
}

/** The insurers and administrators on file, by the name staff know them by. */
export function insurersOnFile(dir: { byId: Map<string, Row> }): { id: string; name: string }[] {
  return [...dir.byId.values()].filter(c => (c.kind === 'insurer' || c.kind === 'tpa') && c.company_name)
    .map(c => ({ id: String(c.id), name: displayName(String(c.company_name)) })).sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadSources(workItemId: string, viewer: string | null, today = todayIso()): Promise<CaseSources> {
  const item = await caseRow(workItemId)
  const dir = await directory()
  const [links, excludedRows, client, named] = await Promise.all([
    sb<Row[]>(`work_item_threads?work_item_id=eq.${enc(workItemId)}&select=thread_id,side,joined_by,joined_evidence`),
    sb<Row[]>(`work_item_thread_excluded?work_item_id=eq.${enc(workItemId)}&select=thread_id,excluded_by,created_at`),
    item.company_id ? clientThreads(item.company_id) : Promise.resolve({ rows: [] as Row[], named: new Set<string>() }),
    namedInsurers(workItemId),
  ])
  const insurers = insurersOnFile(dir)
  const insurerName = new Map(insurers.map(i => [i.id, i.name]))
  const byId = new Map<string, Row>(client.rows.map(t => [t.id as string, t]))
  const extra = [...links, ...excludedRows].map(r => r.thread_id as string).filter(id => !byId.has(id))
  for (const t of await threadsById(extra)) byId.set(t.id, t)
  const visible = await visibleThreadIds(Array.from(byId.keys()), viewer)

  const off = new Set(excludedRows.map(e => e.thread_id as string))
  const on = links.filter(l => !off.has(l.thread_id) && byId.has(l.thread_id))
  const shown = on.filter(l => visible.has(l.thread_id))
  const messages = await caseMessages(shown.map(l => l.thread_id))
  const count = new Map<string, number>()
  for (const m of messages) count.set(m.thread_id, (count.get(m.thread_id) ?? 0) + 1)
  const sides = new Map<string, Side>(shown.map(l => [l.thread_id as string, isSide(l.side) ? l.side : 'other']))

  // Proposals come only from the client's own threads the viewer may see.
  const taken = new Set([...links.map(l => l.thread_id as string), ...off])
  const pool = client.rows.filter(t => visible.has(t.id) && !taken.has(t.id))
  const held = await inChunks(pool.map(t => t.id as string), 80, c => sbAll<Row>(`work_item_threads?thread_id=in.(${c.join(',')})&select=thread_id,work_items(id,title)`, 'thread_id,work_item_id'))
  const onCase = new Map<string, { id: string; title: string | null }>()
  for (const h of held) if (h.work_items && h.work_items.id !== workItemId) onCase.set(h.thread_id, { id: h.work_items.id, title: h.work_items.title ?? null })
  const candidates: Candidate[] = pool.map(t => ({
    id: t.id, subject: subjectOf(t), last_message_at: t.last_message_at ?? null, label: labelFor(t),
    side: sideOfThread({ company_id: t.company_id ?? null, companyKind: dir.byId.get(t.company_id)?.kind ?? null, named: client.named.has(t.id) }, item.company_id ?? null),
    onCase: onCase.get(t.id) ?? null,
  }))
  const offered = proposeThreads({ id: item.id, case_type: item.case_type, title: item.title ?? null, policy_number: item.policy_number ?? null }, candidates, taken, today, await similarityTo(shown.map(l => l.thread_id as string), candidates.map(t => t.id)))

  const newest = (a: { last_message_at: string | null }, b: { last_message_at: string | null }) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? ''))
  return {
    item: { id: item.id, title: item.title ?? null, case_type: item.case_type, company_id: item.company_id ?? null, client_name: item.client_name ?? null, policy_number: item.policy_number ?? null, closed_at: item.closed_at ?? null },
    picked: shown.map(l => { const t = byId.get(l.thread_id)!; return {
      id: t.id, subject: subjectOf(t), last_message_at: t.last_message_at ?? null, label: labelFor(t), label_by: t.label_by ?? null, side: sides.get(t.id) ?? 'other',
      insurer: sides.get(t.id) === 'insurer' && insurerName.has(named.get(t.id) ?? '') ? { id: named.get(t.id)!, name: insurerName.get(named.get(t.id)!)! } : null,
      joined_by: l.joined_by ?? null, picked_by: l.joined_by === PERSON ? l.joined_evidence ?? null : null, messages: count.get(t.id) ?? 0,
    } }).sort(newest),
    insurers,
    hidden: on.length - shown.length,
    ...offered,
    excluded: excludedRows.filter(e => byId.has(e.thread_id) && visible.has(e.thread_id)).map(e => { const t = byId.get(e.thread_id)!; return {
      id: t.id, subject: subjectOf(t), last_message_at: t.last_message_at ?? null, label: labelFor(t), excluded_by: e.excluded_by, excluded_at: e.created_at,
    } }).sort(newest),
    buckets: buildBuckets(messages, sides, dir.domainKind),
  }
}

// ── a person's choices ────────────────────────────────────────────────────────────────────────

async function threadFor(threadId: string, actor: string): Promise<Row> {
  const [t] = await sb<Row[]>(`email_threads?id=eq.${enc(threadId)}&deleted_at=is.null&select=${THREAD_COLS}&limit=1`)
  if (!t) throw new CaseError('This thread no longer exists.', 404)
  if (!(await threadVisibleTo(threadId, actor))) throw new CaseError(PRIVATE_THREAD.error, 403)
  return t
}

/**
 * Puts a thread on a case by a person's choice. A thread sits on one case: when another case
 * holds it, the pick is refused with that case named unless `move` is set, and then it moves.
 */
export async function pickThread(workItemId: string, threadId: string, actor: string, opts: { move?: boolean } = {}): Promise<{ moved_from: string | null; side: Side }> {
  const item = await caseRow(workItemId)
  const t = await threadFor(threadId, actor)
  const [held] = await sb<Row[]>(`work_item_threads?thread_id=eq.${enc(threadId)}&select=work_item_id,side,joined_by,joined_evidence,created_at,work_items(id,title)&limit=1`)
  let movedFrom: string | null = null
  if (held && held.work_item_id !== workItemId) {
    if (!opts.move) {
      // When a person picked it, the time of that pick; else when the case reader linked it.
      const [picked] = await sbTry<Row[]>(`work_item_events?work_item_id=eq.${enc(held.work_item_id)}&kind=eq.source_picked&detail->>thread_id=eq.${enc(threadId)}&select=created_at&order=created_at.desc&limit=1`, [])
      throw new CaseError('This thread is on another case.', 409, { conflict: {
        id: held.work_item_id, title: held.work_items?.title ?? null,
        picked_by: held.joined_by === PERSON ? held.joined_evidence ?? null : 'case_worker', picked_at: picked?.created_at ?? held.created_at ?? null,
      } })
    }
    await sb(`work_item_threads?thread_id=eq.${enc(threadId)}&work_item_id=eq.${enc(held.work_item_id)}`, { method: 'DELETE', headers: quiet })
    await event(held.work_item_id, 'source_moved', actor, { thread_id: threadId, to: workItemId, to_title: item.title ?? null, note: 'Thread moved to another case' })
    movedFrom = held.work_item_id
  }
  let side: Side
  if (held && held.work_item_id === workItemId) {
    side = isSide(held.side) ? held.side : 'other'
    await sb(`work_item_threads?work_item_id=eq.${enc(workItemId)}&thread_id=eq.${enc(threadId)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ joined_by: PERSON, joined_evidence: actor }) })
  } else {
    const dir = await directory()
    const [named] = item.company_id ? await sbTry<Row[]>(`thread_insurers?thread_id=eq.${enc(threadId)}&client_company_id=eq.${enc(item.company_id)}&select=thread_id&limit=1`, []) : []
    side = sideOfThread({ company_id: t.company_id ?? null, companyKind: dir.byId.get(t.company_id)?.kind ?? null, named: !!named }, item.company_id ?? null)
    await sb('work_item_threads', { method: 'POST', headers: quiet, body: JSON.stringify({ work_item_id: workItemId, thread_id: threadId, side, joined_by: PERSON, joined_evidence: actor }) })
  }
  await sb(`work_item_thread_excluded?work_item_id=eq.${enc(workItemId)}&thread_id=eq.${enc(threadId)}`, { method: 'DELETE', headers: quiet })
  await event(workItemId, 'source_picked', actor, { thread_id: threadId, moved_from: movedFrom, note: 'Thread picked' })
  return { moved_from: movedFrom, side }
}

/** Takes a thread off a case for good: it is not read for the case and not offered again until restored. */
export async function excludeThread(workItemId: string, threadId: string, actor: string): Promise<void> {
  await caseRow(workItemId)
  if (!(await threadVisibleTo(threadId, actor))) throw new CaseError(PRIVATE_THREAD.error, 403)
  await sb(`work_item_threads?work_item_id=eq.${enc(workItemId)}&thread_id=eq.${enc(threadId)}`, { method: 'DELETE', headers: quiet })
  await sb('work_item_thread_excluded?on_conflict=work_item_id,thread_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ work_item_id: workItemId, thread_id: threadId, excluded_by: actor }),
  })
  await event(workItemId, 'source_excluded', actor, { thread_id: threadId, note: 'Thread taken off the case' })
}

/** Undoes an exclusion: the thread can be offered and picked again. It is not put back on the case. */
export async function restoreThread(workItemId: string, threadId: string, actor: string): Promise<void> {
  await caseRow(workItemId)
  await sb(`work_item_thread_excluded?work_item_id=eq.${enc(workItemId)}&thread_id=eq.${enc(threadId)}`, { method: 'DELETE', headers: quiet })
  await event(workItemId, 'source_restored', actor, { thread_id: threadId, note: 'Thread can be offered again' })
}

/**
 * Which bucket a picked thread's TRS messages fall in, and for the insurer side, which insurer the
 * thread is with when a person names one. A named insurer stands over the thread's own company and
 * the insurer its subject names.
 */
export async function setSide(workItemId: string, threadId: string, side: Side, actor: string, insurerId: string | null = null): Promise<void> {
  if (!(await threadVisibleTo(threadId, actor))) throw new CaseError(PRIVATE_THREAD.error, 403)
  const insurer = side === 'insurer' && insurerId ? insurersOnFile(await directory()).find(i => i.id === insurerId) ?? null : null
  if (side === 'insurer' && insurerId && !insurer) throw new CaseError('Choose an insurer on file.', 400)
  const rows = await sb<Row[]>(`work_item_threads?work_item_id=eq.${enc(workItemId)}&thread_id=eq.${enc(threadId)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ side, insurer_company_id: insurer?.id ?? null }) })
  if (!rows.length) throw new CaseError('This thread is not on the case.', 404)
  await event(workItemId, 'source_side', actor, { thread_id: threadId, side, insurer_id: insurer?.id ?? null, insurer: insurer?.name ?? null, note: insurer ? `Thread set to ${insurer.name}` : `Thread set to the ${side} side` })
}

/**
 * What a reader may attach to a case. A thread a person picked onto another case stays there, and a
 * thread a person took off this case stays off: the reader's grouping never overrides either.
 */
export async function attachable(workItemId: string | null, threadIds: readonly string[]): Promise<{ keep: string[]; held: Map<string, string>; excluded: string[] }> {
  const ids = Array.from(new Set(threadIds.filter(Boolean)))
  if (!ids.length) return { keep: [], held: new Map(), excluded: [] }
  const [picked, off] = await Promise.all([
    sbTry<Row[]>(`work_item_threads?thread_id=in.(${ids.join(',')})&joined_by=eq.${PERSON}&select=thread_id,work_item_id`, []),
    workItemId ? sbTry<Row[]>(`work_item_thread_excluded?work_item_id=eq.${enc(workItemId)}&thread_id=in.(${ids.join(',')})&select=thread_id`, []) : Promise.resolve([] as Row[]),
  ])
  const held = new Map<string, string>()
  for (const l of picked) if (l.work_item_id !== workItemId) held.set(l.thread_id, l.work_item_id)
  const excluded = off.map(r => r.thread_id as string)
  const out = new Set(excluded)
  return { keep: ids.filter(id => !held.has(id) && !out.has(id)), held, excluded }
}

// ── labels ────────────────────────────────────────────────────────────────────────────────────

/** A person's label. The rule's label stays in label_rule, so changes per 100 threads can be counted. */
export async function setLabel(threadId: string, label: Label, actor: string): Promise<{ label: Label; label_rule: Label | null }> {
  const t = await threadFor(threadId, actor)
  const [full] = await sb<Row[]>(`email_threads?id=eq.${enc(threadId)}&select=label,label_rule,label_by,subject&limit=1`)
  // The first change of a thread the rule never stored: keep what the rule would have said.
  const rule = isLabel(full?.label_rule) ? full.label_rule : isLabel(full?.label) && full.label_by === 'rule' ? full.label : labelOf({ subject: t.subject }).label
  await sb(`email_threads?id=eq.${enc(threadId)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ label, label_rule: rule, label_by: actor, label_at: new Date().toISOString() }) })
  return { label, label_rule: rule }
}

/**
 * Stores the rule's label for these threads from their subject, senders, first email and file names. A thread a
 * person labelled keeps that label; only label_rule and label_basis follow the rule there.
 */
export async function labelThreadsByRule(threadIds: readonly string[]): Promise<{ labelled: number; kept: number; changed: number }> {
  const ids = Array.from(new Set(threadIds.filter(Boolean)))
  const out = { labelled: 0, kept: 0, changed: 0 }
  if (!ids.length) return out
  const dir = await directory()
  const threads = await inChunks(ids, 80, c => sbAll<Row>(`email_threads?id=in.(${c.join(',')})&deleted_at=is.null&select=id,subject,company_id,label,label_rule,label_by`))
  const [senders, files] = await Promise.all([
    inChunks(ids, 10, c => sbTry<Row[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,from_address&order=sent_at.asc&limit=1000`, [])),
    inChunks(ids, 10, c => sbTry<Row[]>(`email_attachments?thread_id=in.(${c.join(',')})&select=message_id,filename&limit=1000`, [])),
  ])
  const names = new Map<string, string[]>()
  for (const f of files) if (f.filename) names.set(f.message_id, [...(names.get(f.message_id) ?? []), f.filename])
  const byThread = new Map<string, LabelMessage[]>()
  const first = new Map<string, string>()
  for (const m of senders) {
    if (!first.has(m.thread_id)) first.set(m.thread_id, m.id)
    byThread.set(m.thread_id, [...(byThread.get(m.thread_id) ?? []), { party: partyOf(m.from_address, dir.domainKind), attachments: names.get(m.id) ?? [] }])
  }
  // The first email's own words: read only for the label, never stored.
  const bodies = await inChunks(Array.from(first.values()), 15, c => sbAll<Row>(`email_messages?id=in.(${c.join(',')})&select=id,body_text`))
  const opening = new Map(bodies.map(b => [b.id as string, ownText(b.body_text)]))
  const now = new Date().toISOString()
  for (const t of threads) {
    const { label, basis } = labelOf({ subject: t.subject, messages: byThread.get(t.id) ?? [], opening: opening.get(first.get(t.id) ?? '') })
    const byPerson = !!t.label_by && t.label_by !== 'rule'
    if (byPerson) { out.kept++; if (t.label_rule !== label) await sbTry(`email_threads?id=eq.${enc(t.id)}`, null, { method: 'PATCH', headers: quiet, body: JSON.stringify({ label_rule: label, label_basis: basis }) }); continue }
    if (t.label === label && t.label_rule === label) { out.labelled++; continue }
    if (t.label && t.label !== label) out.changed++
    await sb(`email_threads?id=eq.${enc(t.id)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ label, label_rule: label, label_basis: basis, label_by: 'rule', label_at: now }) })
    out.labelled++
  }
  return out
}

// ── relevance ─────────────────────────────────────────────────────────────────────────────────

export type RelevanceThread = {
  id: string; subject: string | null; last_message_at: string | null; label: Label; label_by: string | null; relevance: Relevance; case: { id: string; title: string | null } | null
  /** The insurer or partner the thread is filed under, when it is there and names this client. */
  via: string | null
  waitingOn: WaitingOn | null
}
export type CompanyRelevance = { company_id: string; season: Season; counts: Record<Relevance, number>; hidden: number; threads: RelevanceThread[] }

/** One client's threads in their groups, with whether the client is in renewal season. */
export async function companyRelevance(companyId: string, viewer: string | null, today = todayIso()): Promise<CompanyRelevance> {
  const [{ rows, named }, open, policies] = await Promise.all([
    clientThreads(companyId),
    sbTry<Row[]>(`work_items?company_id=eq.${enc(companyId)}&closed_at=is.null&select=id,title,case_type,deadline,work_item_threads(thread_id)&limit=500`, []),
    sbTry<Row[]>(`policies?company_id=eq.${enc(companyId)}&select=end_date&limit=500`, []),
  ])
  const onOpen = new Map<string, { id: string; title: string | null }>()
  for (const w of open) for (const l of w.work_item_threads ?? []) onOpen.set(l.thread_id, { id: w.id, title: w.title ?? null })
  const visible = await visibleThreadIds(rows.map(t => t.id as string), viewer)
  // Counts are of the threads this person may see; the rest are one number, `hidden` (INB-002).
  const shownRows = rows.filter(t => visible.has(t.id))
  const shownIds = shownRows.map(t => t.id as string)
  const [via, waiting] = await Promise.all([
    named.size ? insurerThreadsFor(companyId) : Promise.resolve(new Map<string, { id: string; name: string }>()),
    waitingByThread(shownIds, new Set(shownIds.filter(id => named.has(id)))),
  ])
  const counts = Object.fromEntries(RELEVANCE.map(r => [r, 0])) as Record<Relevance, number>
  const threads: RelevanceThread[] = []
  for (const t of shownRows) {
    const label = labelFor(t)
    const relevance = relevanceOf({ lastMessageAt: t.last_message_at, label, onOpenCase: onOpen.has(t.id) }, today)
    counts[relevance]++
    threads.push({
      id: t.id, subject: subjectOf(t), last_message_at: t.last_message_at ?? null, label, label_by: t.label_by ?? null, relevance, case: onOpen.get(t.id) ?? null,
      via: named.has(t.id) ? via.get(t.id)?.name ?? 'Insurer' : null,
      waitingOn: waiting.get(t.id) ?? null,
    })
  }
  threads.sort((a, b) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
  const season = renewalSeason({ openRenewalCases: open.filter(w => w.case_type === 'renewal').map(w => ({ title: w.title ?? null, deadline: w.deadline ?? null })), policyEnds: policies.map(p => p.end_date) }, today)
  return { company_id: companyId, season, counts, hidden: rows.length - threads.length, threads }
}
