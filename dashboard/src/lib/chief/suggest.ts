/**
 * Suggestions: what the mail makes possible, offered as one line and one button. The rules are
 * deterministic reads of what arrived; the person says yes, and an existing action runs.
 *
 *   eb_scenarios   the thread is a benefits request, or carries a member list → read the whole
 *                  thread for what the client has, wants and has ruled out, and price like for
 *                  like, lower cost and enhanced at every insurer (src/lib/gb/scenario-run.ts).
 *                  The census is the quotation already on file, else the file on this thread,
 *                  priced first by the intake agent (src/lib/gb/intake.ts).
 *
 * Until 11 Nov 2026 a census file was its own suggestion ("Census received: 33 members") beside
 * the estimate, and a file forwarded twice appeared twice. One thread, one item: the estimate,
 * naming the file it will read.
 *
 * More rules go here as single cases: the shape stays one suggestion, one yes, one result.
 */
import { sbTry, enc } from '@/lib/crm/db'
import { isInternal } from '@/lib/crm/db'
import { benefitsThreads, censusFor, loadScenarios, packSummary, plansFromCensusFile, quotationForThread } from '@/lib/gb/scenario-run'
import { analysisSummary, loadAnalysis, runAnalysis } from '@/lib/gb/analysis'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { censusMembers, isSheetFile } from './census'
import type { SuggestionKind } from './suggest-links'

type Row = Record<string, any>

export type Suggestion = {
  key: string
  kind: SuggestionKind
  title: string
  detail: string
  yes: string
  /** The census file on the thread the estimate will read, when there is one and no quotation yet. */
  attachment: string
  rows: number
  /** Already acted on: where the result is, and what it says. `draftable` when the older scenario pack exists, which the client draft still reads. */
  done: { quotationId: string; members: number; summary?: string; draftable?: boolean } | null
}

export type ThreadSuggestion = Suggestion & { threadId: string; subject: string | null; company: string | null; companyId: string | null; receivedAt: string }
export type SuggestionOutcome = { ok: true; quotationId: string; summary: string } | { ok: false; error: string }

type Att = { thread_id: string; message_id: string; filename: string; mime_type: string | null; size_bytes: number | null; parsed_text: string | null; created_at: string }
const ATT_COLS = 'thread_id,message_id,filename,mime_type,size_bytes,parsed_text,created_at'

export type Census = { threadId: string; messageId: string; filename: string; rows: number; company: string | null; insurer: string | null; receivedAt: string }

const bareAddress = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()

/** Live inbound messages among the ids, from outside TRS. */
async function inboundLive(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await sbTry<Row[]>(`email_messages?id=in.(${ids.slice(i, i + 100).join(',')})&deleted_at=is.null&select=id,direction,from_address`, [])
    for (const m of rows) if (m.direction === 'inbound' && !isInternal(bareAddress(m.from_address))) out.add(m.id)
  }
  return out
}

/** "Member Census - OUE Group (1).xlsx" and "[OUE Group] Member Census.xlsx" of one size are one file. */
const fileKey = (a: Att) => `${a.size_bytes ?? ''}|${a.filename.toLowerCase().replace(/\s*\(\d+\)(?=\.[a-z0-9]+$)/, '').replace(/[^a-z0-9.]+/g, '')}`

/**
 * The member list on a thread: the largest census among its spreadsheet attachments, each file
 * counted once however many copies and forwards carry it. Pure over the rows given.
 */
export function censusAmong(atts: Att[], live: Set<string>): Census | null {
  const sheets = atts.filter(a => isSheetFile(a.filename, a.mime_type))
  // The parsed text may sit on another copy of the same file.
  const textOf = new Map<string, Att>()
  for (const a of sheets) if ((a.parsed_text ?? '').length > 40 && !textOf.has(fileKey(a))) textOf.set(fileKey(a), a)
  const byFile = new Map<string, Census>()
  for (const a of sheets) {
    if (!live.has(a.message_id)) continue
    const k = fileKey(a)
    if (byFile.has(k)) continue
    const text = textOf.get(k)
    const sig = text ? censusMembers(text.parsed_text) : null
    if (!sig || sig.members.length === 0) continue
    byFile.set(k, { threadId: a.thread_id, messageId: a.message_id, filename: a.filename, rows: sig.members.length, company: sig.company, insurer: sig.insurer, receivedAt: a.created_at })
  }
  return [...byFile.values()].sort((a, b) => b.rows - a.rows || a.receivedAt.localeCompare(b.receivedAt))[0] ?? null
}

async function censusOnThread(atts: Att[]): Promise<Census | null> {
  const sheets = atts.filter(a => isSheetFile(a.filename, a.mime_type))
  if (!sheets.length) return null
  const live = await inboundLive(Array.from(new Set(sheets.map(a => a.message_id))))
  return censusAmong(atts, live)
}

/**
 * The estimate for a thread: offered when the thread is in a benefits conversation or carries a
 * member list; done when a pack is saved on its quotation.
 */
async function scenarioSuggestion(thread: Row, dismissed: Set<string>, census: Census | null): Promise<(Suggestion & { threadId: string; receivedAt: string }) | null> {
  const key = `eb_scenarios:${thread.id}`
  if (dismissed.has(key)) return null
  const conversation = thread.category === 'group_benefits' ? null : await benefitsThreads(thread.id)
  if (conversation && !conversation.inConversation && !census) return null
  let q: Awaited<ReturnType<typeof quotationForThread>> = null
  for (const id of conversation?.ids ?? [thread.id]) { q = await quotationForThread(id); if (q) break }
  const [pack, scen] = q ? await Promise.all([loadAnalysis(q.id), loadScenarios(q.id)]) : [null, null]
  const detail = q
    ? `${q.member_count} members on file · like for like, lower cost, enhanced · every insurer`
    : census
      ? [`${census.filename} · ${census.rows} members`, census.company, census.insurer ? `current insurer ${census.insurer}` : null].filter(Boolean).join(' · ')
      : 'Reads the thread; prices the census on file or the file on this thread'
  return {
    key, kind: 'eb_scenarios', attachment: q ? '' : census?.filename ?? '', rows: q?.member_count ?? census?.rows ?? 0, threadId: thread.id, receivedAt: census?.receivedAt ?? thread.last_message_at ?? thread.created_at ?? '',
    title: 'EB analysis', detail, yes: 'Analyse',
    done: pack ? { quotationId: pack.quotationId, members: q?.member_count ?? 0, summary: analysisSummary(pack), draftable: true }
      : scen ? { quotationId: scen.quotationId, members: q?.member_count ?? 0, summary: packSummary(scen), draftable: true } : null,
  }
}

/** The suggestions for one thread. */
export async function suggestionsFor(threadId: string, dismissed: readonly string[] = []): Promise<Suggestion[]> {
  const dis = new Set(dismissed)
  const [thread] = await sbTry<Row[]>(`email_threads?id=eq.${enc(threadId)}&select=id,category,subject,company_id,last_message_at,created_at&limit=1`, [])
  if (!thread) return []
  const atts = await sbTry<Att[]>(`email_attachments?thread_id=eq.${enc(threadId)}&select=${ATT_COLS}&order=created_at.desc&limit=60`, [])
  const sc = await scenarioSuggestion(thread, dis, await censusOnThread(atts))
  if (!sc) return []
  const { threadId: _t, receivedAt: _r, ...s } = sc
  return [s]
}

/** Suggestions across the viewer's threads for the home list: one per thread, newest first. */
export async function recentSuggestions(viewer: string | null, days = 14): Promise<ThreadSuggestion[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const atts = await sbTry<Att[]>(`email_attachments?created_at=gte.${enc(since)}&or=(mime_type.ilike.*spreadsheet*,mime_type.ilike.*ms-excel*,mime_type.ilike.*csv*,filename.ilike.*.xlsx,filename.ilike.*.xls,filename.ilike.*.csv)&select=${ATT_COLS}&order=created_at.desc&limit=200`, [])
  const gbThreads = await sbTry<Row[]>(`email_threads?category=eq.group_benefits&last_message_at=gte.${enc(since)}&deleted_at=is.null&select=id,subject,company_id,category,last_message_at,created_at,companies(company_name,kind)&order=last_message_at.desc&limit=30`, [])
  const threadIds = Array.from(new Set([...atts.map(a => a.thread_id), ...gbThreads.map(t => t.id)]))
  if (!threadIds.length) return []
  const visible = await visibleThreadIds(threadIds, viewer)
  const threads = new Map<string, Row>(gbThreads.map(t => [t.id, t]))
  const missing = threadIds.filter(id => !threads.has(id))
  for (let i = 0; i < missing.length; i += 100) {
    for (const t of await sbTry<Row[]>(`email_threads?id=in.(${missing.slice(i, i + 100).join(',')})&deleted_at=is.null&select=id,subject,company_id,category,last_message_at,created_at,companies(company_name,kind)`, [])) threads.set(t.id, t)
  }
  const holds = new Map<string, Set<string>>()
  for (let i = 0; i < threadIds.length; i += 100) {
    const keys = threadIds.slice(i, i + 100).map(id => `"thread_bar:${id}"`)
    for (const r of await sbTry<Row[]>(`app_settings?key=in.(${keys.join(',')})&select=key,value`, [])) {
      try { const v = JSON.parse(r.value ?? '{}'); if (Array.isArray(v.dismissed)) holds.set(String(r.key).slice('thread_bar:'.length), new Set(v.dismissed)) } catch { /* no hold */ }
    }
  }
  const live = await inboundLive(Array.from(new Set(atts.map(a => a.message_id))))
  const out: ThreadSuggestion[] = []
  for (const id of threadIds) {
    const t = threads.get(id)
    if (!t || !visible.has(id)) continue
    // Threads filed under an insurer or a partner are about a client too (a referral); the estimate
    // names the insured from the census, so they stay in.
    const census = censusAmong(atts.filter(a => a.thread_id === id), live)
    const sc = await scenarioSuggestion(t, holds.get(id) ?? new Set(), census)
    if (sc) out.push({ ...sc, subject: t.subject ?? null, company: t.companies?.company_name ?? null, companyId: t.company_id ?? null })
  }
  return out.sort((a, b) => Number(!!a.done) - Number(!!b.done) || b.receivedAt.localeCompare(a.receivedAt))
}

/** Runs the action behind a suggestion. */
export async function runSuggestion(threadId: string, key: string, by: string | null = null): Promise<SuggestionOutcome> {
  const [kind] = key.split(':')
  if (kind !== 'eb_scenarios') return { ok: false, error: 'Unknown suggestion.' }
  // The census: the quotation on this conversation, the company's latest priced one, or the file on
  // this thread priced first by the intake agent. Then every package at every insurer, one run.
  const conversation = await benefitsThreads(threadId)
  const found = await censusFor(threadId, conversation.ids)
  if ('error' in found) return { ok: false, error: found.error }
  const q = found.quotation
  const plans = await plansFromCensusFile(q, conversation.ids).catch(() => null)
  const req = q.requirement as { current_insurer?: string | null; categories?: { requirement?: Partial<import('@/lib/gb/ladder').Requirement> }[] } | null
  const [thread] = await sbTry<Row[]>(`email_threads?id=eq.${enc(threadId)}&select=subject,display_subject&limit=1`, [])
  const pack = await runAnalysis({
    quotationId: q.id, members: q.census ?? [], effectiveDate: q.effective_date ?? new Date().toISOString().slice(0, 10), basis: q.basis === 'renewal' ? 'renewal' : 'new_business',
    currentInsurer: req?.current_insurer ?? null, current: plans?.current ?? req?.categories?.[0]?.requirement ?? null, by,
    source: { label: thread?.display_subject ?? thread?.subject ?? 'Thread', href: `/engagement?lead=${threadId}` },
  })
  return { ok: true, quotationId: pack.quotationId, summary: `${analysisSummary(pack)} · census from ${found.how}` }
}
