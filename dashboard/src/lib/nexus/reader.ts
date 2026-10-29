/**
 * The email reader. Each new message (inbound and outbound) is read once by Gemini Flash-Lite
 * with the thread subject and the thread's open follow-ups. It answers with the rows the message
 * opens (a question, a request, a promised date: who owes, to whom, what, any stated date) and the
 * open rows it settles. Due dates the message does not state come from the house rule (rules.ts).
 *
 * follow_up_reads claims a message before the model is called, so the ingest hook and the hourly
 * cron never read the same message twice. A failed read keeps its error and is retried by the
 * cron, up to 3 attempts. Nothing here sends anything.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_LITE } from '@/lib/gemini-models'
import { sb, sbTry, enc, isInternal, isAutomated, bareEmail, emailDomain } from '@/lib/crm/db'
import { stripEmbeddedTextQuote } from '@/lib/build-reply-thread'
import { dedupeKey, dueFor, type OwnerParty } from './rules'
import type { FollowUp, FollowUpInsert } from './types'

type Party = 'trs' | 'insurer' | 'client'

export type ReaderMessage = {
  id: string; thread_id: string; direction: string; from_address: string | null; subject: string | null
  body_text: string | null; sent_at: string | null; created_at: string; deleted_at: string | null
}
export type ReaderThread = { id: string; subject: string | null; display_subject: string | null; company_id: string | null; category: string | null }
export type Participant = { email: string; name: string | null; role: string }
export type OpenRow = Pick<FollowUp, 'id' | 'owner_party' | 'what' | 'counterparty_name' | 'counterparty_email' | 'due_at'>

export type ReadOpen = { owes: Exclude<OwnerParty, 'date'>; counterparty_email: string | null; counterparty_name: string | null; what: string; due: string | null }
export type ReadResult = { open: ReadOpen[]; close: string[] }

// ── pure pieces ──────────────────────────────────────────────────────────────────────────────

/** Which side an address is on: our domains, an insurer's domain, or else the client. */
export function partyOf(email: string, insurerDomains: Set<string>): Party {
  if (isInternal(email)) return 'trs'
  return insurerDomains.has(emailDomain(email)) ? 'insurer' : 'client'
}

/** The new text of a message: the quoted history cut off, kept to `max` characters. A forward
 *  whose whole content sits under its header falls back to the raw start. */
export function latestText(body: string | null, max = 6_000): string {
  const raw = (body ?? '').replace(/\r\n/g, '\n')
  const stripped = stripEmbeddedTextQuote(raw)
  return (stripped.length >= 40 ? stripped : raw.trim()).slice(0, max)
}

const OWES = new Set(['trs', 'insurer', 'client'])
const isoDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null

/**
 * The model's answer, cleaned. Pure.
 *   - accepts the JSON object or a fenced string of it; anything unreadable is an empty answer;
 *   - opens: owes must be trs/insurer/client, what must be present (≤ 160 chars), at most 5 rows;
 *     the counterparty email must be an address on the message, else it is dropped;
 *   - closes: only ids of rows that are open on this thread, without repeats.
 */
export function cleanReaderOutput(raw: unknown, openIds: string[], addresses: string[]): ReadResult {
  let obj: unknown = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')) } catch { obj = null }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { open: [], close: [] }
  const o = obj as Record<string, unknown>
  const known = new Set(addresses.map(a => a.toLowerCase()))
  const open: ReadOpen[] = (Array.isArray(o.open) ? o.open : [])
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(r => {
      const email = text(r.counterparty_email, 200)?.toLowerCase() ?? null
      return {
        owes: (typeof r.owes === 'string' ? r.owes.toLowerCase() : '') as ReadOpen['owes'],
        counterparty_email: email && known.has(email) ? email : null,
        counterparty_name: text(r.counterparty_name, 120),
        what: text(r.what, 160) ?? '',
        due: isoDate(r.due),
      }
    })
    .filter(r => OWES.has(r.owes) && r.what.length >= 3)
    .slice(0, 5)
  const allowed = new Set(openIds)
  const close = [...new Set((Array.isArray(o.close) ? o.close : []).filter((x): x is string => typeof x === 'string' && allowed.has(x)))]
  return { open, close }
}

/** The broker on a message: its TRS sender, else its first named TRS recipient (shared inboxes
 *  last), else the company's owner. */
export function brokerOn(msg: Pick<ReaderMessage, 'from_address'>, people: Participant[], companyOwner: string | null): string | null {
  const from = bareEmail(msg.from_address)
  if (isInternal(from)) return from
  const shared = /^(operations|ops|admin|info|accounts|claims|enquiries)@/
  const internal = people.filter(p => p.role !== 'from' && isInternal(p.email)).map(p => p.email.toLowerCase())
  return internal.find(e => !shared.test(e)) ?? companyOwner ?? internal[0] ?? null
}

/** The rows a cleaned read opens, ready to insert. Pure. */
export function plannedRows(read: ReadResult, ctx: {
  message: Pick<ReaderMessage, 'id' | 'thread_id' | 'sent_at' | 'created_at'>
  companyId: string | null; broker: string | null; claim: boolean; label: string | null
}): FollowUpInsert[] {
  const since = new Date(ctx.message.sent_at ?? ctx.message.created_at)
  return read.open.map((r, i) => ({
    company_id: ctx.companyId,
    thread_id: ctx.message.thread_id,
    message_id: ctx.message.id,
    owner_party: r.owes,
    owner_email: ctx.broker,
    counterparty_name: r.counterparty_name,
    counterparty_email: r.counterparty_email,
    what: r.what,
    due_at: dueFor(r.owes, since, r.due),
    since_at: since.toISOString(),
    source_kind: ctx.claim ? 'claim' : 'email',
    source_ref: ctx.message.thread_id,
    source_label: ctx.label,
    dedupe_key: dedupeKey.email(ctx.message.id, i),
  }))
}

const SYSTEM = `You keep the follow-up ledger for Trade Risk Solutions (TRS), an insurance broker in Singapore. Three parties write to each other: TRS (the broker), insurers, and clients.
You read ONE new email and decide:
1. open: what this email leaves someone owing. Only a real question, request or promise that needs an action or answer: a quotation, information, a document, a decision, a payment, a confirmation, a promised date. Not greetings, thanks, FYIs, newsletters, or things already answered in the same email.
   For each: owes = "trs" | "insurer" | "client" (who must act next); counterparty_email = the outside address involved (for trs: the person TRS owes; for insurer or client: the person who owes) chosen ONLY from the PARTICIPANTS list, or null; counterparty_name = that person's name or organisation; what = a short task, 4–12 words, starting with a noun or verb ("Revised quotation for WICA renewal", "Send signed proposal form"); due = the date the email states for it as YYYY-MM-DD, or null. Dates in emails are day-first.
   An email from TRS asking an insurer or client for something opens a row they owe. An email to TRS asking for something opens a row TRS owes. A TRS promise ("we will revert by Friday") opens a row TRS owes with that date.
2. close: ids of the OPEN FOLLOW-UPS this email settles (the thing was sent, answered, declined or withdrawn). Only ids from the list.
Return JSON only: { "open": [ { "owes": ..., "counterparty_email": ..., "counterparty_name": ..., "what": ..., "due": ... } ], "close": [ "id", ... ] }. Empty arrays when nothing applies, which is common.`

export function readerPrompt(i: { message: ReaderMessage; thread: ReaderThread; people: Participant[]; parties: Map<string, Party>; open: OpenRow[]; today: string }): string {
  const list = i.people.map(p => `${p.role.toUpperCase()}: ${p.name ? `${p.name} ` : ''}<${p.email.toLowerCase()}> [${i.parties.get(p.email.toLowerCase()) ?? 'client'}]`).join('\n')
  const open = i.open.length
    ? i.open.map(r => `${r.id} | ${r.owner_party} owes | ${r.what}${r.counterparty_name || r.counterparty_email ? ` | ${r.counterparty_name ?? r.counterparty_email}` : ''}${r.due_at ? ` | due ${r.due_at.slice(0, 10)}` : ''}`).join('\n')
    : '(none)'
  return `TODAY: ${i.today}
THREAD SUBJECT: ${i.thread.display_subject ?? i.thread.subject ?? i.message.subject ?? ''}
DIRECTION: ${i.message.direction} (sent ${i.message.sent_at ?? i.message.created_at})
PARTICIPANTS:
${list || '(none)'}

OPEN FOLLOW-UPS ON THIS THREAD:
${open}

EMAIL (quoted history removed):
${latestText(i.message.body_text)}`
}

// ── I/O ──────────────────────────────────────────────────────────────────────────────────────

let insurerDomainCache: { at: number; set: Set<string> } | null = null
export async function insurerDomains(): Promise<Set<string>> {
  if (insurerDomainCache && Date.now() - insurerDomainCache.at < 10 * 60_000) return insurerDomainCache.set
  const rows = await sbTry<{ domain: string | null; domains: string[] | null }[]>('companies?kind=eq.insurer&select=domain,domains', [])
  const set = new Set<string>()
  for (const r of rows) for (const d of [r.domain, ...(r.domains ?? [])]) if (d) set.add(d.toLowerCase())
  insurerDomainCache = { at: Date.now(), set }
  return set
}

export type ReadPlan = {
  message_id: string
  skipped?: string
  open: FollowUpInsert[]
  close: { id: string; what: string }[]
  tokens?: { input: number; output: number }
  error?: string
}

/** Why a message is not worth a model call, or null. */
function skipReason(m: ReaderMessage, people: Participant[]): string | null {
  if (m.deleted_at) return 'deleted'
  if (isAutomated(m.from_address)) return 'automated sender'
  if (latestText(m.body_text).length < 20) return 'no text'
  const outside = people.some(p => !isInternal(p.email)) || !isInternal(bareEmail(m.from_address))
  if (!outside) return 'internal only'
  return null
}

/**
 * Reads one message. `dryRun` reads without claiming and without writing: the plan comes back
 * for inspection. Otherwise the message is claimed first; an already-claimed message returns
 * `skipped: 'already read'` without a model call.
 */
export async function readMessage(messageId: string, opts: { dryRun?: boolean; retry?: { attempts: number } } = {}): Promise<ReadPlan> {
  const [m] = await sb<ReaderMessage[]>(`email_messages?id=eq.${messageId}&select=id,thread_id,direction,from_address,subject,body_text,sent_at,created_at,deleted_at&limit=1`)
  if (!m) return { message_id: messageId, skipped: 'not found', open: [], close: [] }
  const [[thread], people, domains] = await Promise.all([
    sb<ReaderThread[]>(`email_threads?id=eq.${m.thread_id}&select=id,subject,display_subject,company_id,category&limit=1`),
    sbTry<Participant[]>(`email_participants?message_id=eq.${m.id}&deleted_at=is.null&select=email,name,role`, []),
    insurerDomains(),
  ])
  if (!thread) return { message_id: m.id, skipped: 'no thread', open: [], close: [] }
  const skip = skipReason(m, people)

  if (!opts.dryRun) {
    if (opts.retry) {
      const res = await sb<{ message_id: string }[]>(`follow_up_reads?message_id=eq.${m.id}&attempts=eq.${opts.retry.attempts}&error=not.is.null`, {
        method: 'PATCH', body: JSON.stringify({ attempts: opts.retry.attempts + 1, error: null, read_at: new Date().toISOString() }),
      })
      if (res.length === 0) return { message_id: m.id, skipped: 'already read', open: [], close: [] }
    } else {
      const claimed = await sb<{ message_id: string }[]>('follow_up_reads?on_conflict=message_id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ message_id: m.id, error: skip ? `skipped: ${skip}` : null, attempts: skip ? 3 : 1 }),
      })
      if (claimed.length === 0) return { message_id: m.id, skipped: 'already read', open: [], close: [] }
    }
  }
  if (skip) return { message_id: m.id, skipped: skip, open: [], close: [] }

  const [open, company, dispatch] = await Promise.all([
    sbTry<OpenRow[]>(`follow_ups?thread_id=eq.${m.thread_id}&status=in.(open,snoozed)&select=id,owner_party,what,counterparty_name,counterparty_email,due_at&order=created_at.asc&limit=40`, []),
    thread.company_id ? sbTry<{ kind: string | null; owner_email: string | null }[]>(`companies?id=eq.${thread.company_id}&select=kind,owner_email&limit=1`, []).then(r => r[0] ?? null) : Promise.resolve(null),
    sbTry<{ company_id: string }[]>(`placement_dispatches?thread_id=eq.${m.thread_id}&select=company_id&limit=1`, []).then(r => r[0] ?? null),
  ])
  // Insurer threads are filed under the insurer; the client is the placement's company.
  let companyId = thread.company_id
  let owner = company?.owner_email ?? null
  if (company?.kind === 'insurer' && dispatch) {
    companyId = dispatch.company_id
    owner = (await sbTry<{ owner_email: string | null }[]>(`companies?id=eq.${dispatch.company_id}&select=owner_email&limit=1`, []))[0]?.owner_email ?? null
  }

  const parties = new Map<string, Party>()
  const fromAddr = bareEmail(m.from_address)
  const everyone = people.length ? people : (fromAddr ? [{ email: fromAddr, name: null, role: 'from' }] : [])
  for (const p of everyone) parties.set(p.email.toLowerCase(), partyOf(p.email, domains))

  let inputTokens = 0, outputTokens = 0
  const { text: out, error } = await callGemini({
    agent: 'housekeeping', feature: 'nexus_followup_read', model: GEMINI_LITE, system: SYSTEM, json: true, temperature: 0,
    maxOutputTokens: 3_000, thinkingShare: 0.3, metadata: { message_id: m.id, thread_id: m.thread_id, dry_run: !!opts.dryRun },
    parts: [{ text: readerPrompt({ message: m, thread, people: everyone, parties, open, today: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10) }) }],
    onUsage: u => { inputTokens = u.input; outputTokens = u.output },
  })
  if (error || !out) {
    if (!opts.dryRun) await sbTry(`follow_up_reads?message_id=eq.${m.id}`, null, { method: 'PATCH', body: JSON.stringify({ error: (error ?? 'empty answer').slice(0, 500) }) })
    return { message_id: m.id, open: [], close: [], error: error ?? 'empty answer', tokens: { input: inputTokens, output: outputTokens } }
  }
  const read = cleanReaderOutput(out, open.map(r => r.id), everyone.map(p => p.email))
  const rows = plannedRows(read, {
    message: m, companyId, broker: brokerOn(m, people, owner), claim: thread.category === 'claim',
    label: thread.display_subject ?? thread.subject ?? m.subject,
  })
  const close = open.filter(r => read.close.includes(r.id)).map(r => ({ id: r.id, what: r.what }))

  if (!opts.dryRun) {
    if (rows.length) await sb('follow_ups?on_conflict=dedupe_key', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) })
    if (close.length) {
      await sb(`follow_ups?id=in.(${close.map(c => c.id).join(',')})&status=in.(open,snoozed)`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'done', closed_at: m.sent_at ?? m.created_at, closed_by: 'reader', closed_by_message_id: m.id }),
      })
    }
    await sbTry(`follow_up_reads?message_id=eq.${m.id}`, null, { method: 'PATCH', body: JSON.stringify({ opened: rows.length, closed: close.length, error: null }) })
  }
  return { message_id: m.id, open: rows, close, tokens: { input: inputTokens, output: outputTokens } }
}

/**
 * The cron's pass over email: messages created after the cursor (oldest first, up to `limit`),
 * then up to 10 failed reads to retry. Returns the new cursor: the created_at of the last
 * message looked at, so a long backlog is worked through over several runs.
 */
export async function readSince(cursor: string, limit = 60): Promise<{ cursor: string; read: number; opened: number; closed: number; skipped: number; failed: number }> {
  const msgs = await sb<{ id: string; created_at: string }[]>(`email_messages?created_at=gt.${enc(cursor)}&deleted_at=is.null&select=id,created_at&order=created_at.asc&limit=${limit}`)
  const retries = await sbTry<{ message_id: string; attempts: number; error: string | null }[]>(
    `follow_up_reads?error=not.is.null&error=not.like.skipped*&attempts=lt.3&read_at=lt.${enc(new Date(Date.now() - 50 * 60_000).toISOString())}&select=message_id,attempts,error&limit=10`, [])
  const tally = { read: 0, opened: 0, closed: 0, skipped: 0, failed: 0 }
  const run = async (id: string, retry?: { attempts: number }) => {
    try {
      const p = await readMessage(id, { retry })
      if (p.skipped) tally.skipped++
      else if (p.error) tally.failed++
      else { tally.read++; tally.opened += p.open.length; tally.closed += p.close.length }
    } catch (e) {
      tally.failed++
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[nexus] read', id, msg)
      // Leave an error on the claim so the next run retries it.
      await sbTry(`follow_up_reads?message_id=eq.${id}`, null, { method: 'PATCH', body: JSON.stringify({ error: msg.slice(0, 500) }) })
    }
  }
  // Sequential on purpose: two messages on one thread must see each other's rows.
  for (const m of msgs) await run(m.id)
  for (const r of retries) await run(r.message_id, { attempts: r.attempts })
  return { cursor: msgs.length ? msgs[msgs.length - 1].created_at : cursor, ...tally }
}
