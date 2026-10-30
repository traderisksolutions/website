/**
 * Picking up a request already under way. A client thread, or a TRS email to an insurer, that
 * belongs to a request TRS started by hand (before the RFQ system, or outside it) is recorded
 * from its history instead of being asked again:
 *
 *   1. the agent reads the whole client thread and says new or midway, the insurers approached,
 *      and the project name (readRequest);
 *   2. the insurer threads for the same request are found: TRS wrote on them, they started after
 *      the client asked, and their subject names the client or shares the project's words;
 *   3. midway (or any such thread found): the placement opens with one dispatch per insurer
 *      thread marked as sent on its real date, and every insurer reply is read into the grid
 *      by the normal reply reader. No request is drafted. An insurer that has not answered gets
 *      a chase date.
 *
 * Nothing here sends.
 */
import { sbTry, inChunks } from '@/lib/crm/db'
import * as store from './store'
import { createPlacement, handleInbound } from './workflow'
import { nextChaseAt } from './position'
import { subjectNames } from '@/lib/nexus/company-view'
import { shortInsurer } from '@/lib/gb/insurer-names'
import type { IntakeResult } from './agent'

const day = 86_400_000
/** An insurer thread belongs to the request when it starts no earlier than this before the client's thread… */
export const BEFORE_MS = 2 * day
/** …and no later than this after it. */
export const AFTER_MS = 120 * day
/** Unanswered insurers on a request older than this are not chased. */
const CHASE_WITHIN_MS = 60 * day

const STOP = new Set(('re fw fwd trs insurance insurer quote quotes quotation quotations request rfq renewal renewals policy policies project projects development developments proposed '
  + 'residential commercial works contract contractor pte ltd limited llp singapore sg company group holdings employer employers employee liability all risk risks car pel wica cgl gpa '
  + 'medical group the and for with from your our new revised final terms slip slips cover coverage nbi trade solutions solution update dear').split(' '))

/** The words that name a job: what is left of a subject after insurance words, insurer names and short words. */
export function projectTokens(text: string, exclude: Iterable<string> = []): Set<string> {
  const ex = new Set([...exclude].map(w => w.toLowerCase()))
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length >= 4 && !STOP.has(w) && !ex.has(w) && !/^\d+$/.test(w)))
}

export function sharedTokens(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter(w => b.has(w))
}

/** Does an insurer thread belong to the client request started at clientStart? Pure. */
export function belongsToRequest(i: { subject: string; firstAt: string; insurerWords: string[] }, c: { subject: string; project: string | null; clientName: string; startAt: string }): boolean {
  const gap = Date.parse(i.firstAt) - Date.parse(c.startAt)
  if (!(gap >= -BEFORE_MS && gap <= AFTER_MS)) return false
  if (subjectNames(i.subject, c.clientName)) return true
  const mine = projectTokens(i.subject, i.insurerWords)
  const theirs = projectTokens(`${c.subject} ${c.project ?? ''}`, i.insurerWords)
  return sharedTokens(mine, theirs).length > 0
}

type ThreadRow = { id: string; subject: string | null; gmail_thread_id: string | null; company_id: string | null; created_at: string }
type MsgRow = { id: string; thread_id: string; direction: string; from_address: string | null; sent_at: string | null }
export type PriorThread = { thread: ThreadRow; insurer_company_id: string; insurer_name: string; first_at: string; trs_first_at: string; replies: MsgRow[]; to_email: string }

const TRS_DOMAIN = 'trade-risksol.com'
const isTrs = (m: MsgRow) => m.direction === 'outbound' || (m.from_address ?? '').toLowerCase().endsWith(`@${TRS_DOMAIN}`)

/** Insurer threads TRS wrote on for this client request and that no placement holds yet. */
export async function priorInsurerThreads(client: { thread: ThreadRow; clientName: string; project: string | null }): Promise<PriorThread[]> {
  const filings = await sbTry<{ thread_id: string; insurer_company_id: string }[]>('thread_insurers?select=thread_id,insurer_company_id&limit=5000', [])
  const held = new Set((await sbTry<{ thread_id: string | null }[]>('placement_dispatches?thread_id=not.is.null&select=thread_id&limit=20000', [])).map(d => d.thread_id))
  const ids = [...new Set(filings.map(f => f.thread_id))].filter(id => id !== client.thread.id && !held.has(id))
  const threads = await inChunks(ids, 80, c => sbTry<ThreadRow[]>(`email_threads?id=in.(${c.join(',')})&deleted_at=is.null&select=id,subject,gmail_thread_id,company_id,created_at`, []))
  const insurers = new Map((await sbTry<{ id: string; company_name: string }[]>('companies?kind=eq.insurer&select=id,company_name&limit=2000', [])).map(c => [c.id, c.company_name]))
  const start = client.thread.created_at
  const near = threads.filter(t => { const g = Date.parse(t.created_at) - Date.parse(start); return g >= -BEFORE_MS - 30 * day && g <= AFTER_MS })
  const msgs = await inChunks(near.map(t => t.id), 60, c => sbTry<MsgRow[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,direction,from_address,sent_at&order=sent_at.asc`, []))
  const out: PriorThread[] = []
  for (const t of near) {
    const f = filings.find(x => x.thread_id === t.id)!
    const name = insurers.get(f.insurer_company_id) ?? ''
    const ms = msgs.filter(m => m.thread_id === t.id)
    const trs = ms.filter(isTrs)
    if (!trs.length) continue
    const firstAt = ms[0]?.sent_at ?? t.created_at
    const insurerWords: string[] = [...(name.toLowerCase().match(/[a-z0-9]+/g) ?? []), ...(shortInsurer(name).toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    if (!belongsToRequest({ subject: t.subject ?? '', firstAt, insurerWords }, { subject: '', project: client.project, clientName: client.clientName, startAt: start })
      && !belongsToRequest({ subject: t.subject ?? '', firstAt, insurerWords }, { subject: client.thread.subject ?? '', project: client.project, clientName: client.clientName, startAt: start })) continue
    const replies = ms.filter(m => !isTrs(m))
    out.push({ thread: t, insurer_company_id: f.insurer_company_id, insurer_name: shortInsurer(name) || name, first_at: firstAt, trs_first_at: trs[0].sent_at ?? firstAt,
      replies, to_email: (replies.at(-1)?.from_address ?? '').toLowerCase() })
  }
  return out
}

/**
 * The placement for a request already under way: lines from the agent's read, one dispatch per
 * insurer thread and line (sent on its real date), each reply read into the grid. No drafts.
 */
export async function recordMidway(input: { thread: ThreadRow; companyId: string; proposal: IntakeResult; lines: IntakeResult['lines']; prior: PriorThread[]; actor: string }) {
  const { placement, lines } = await createPlacement({
    company_id: input.companyId, title: input.proposal.title, client_thread_id: input.thread.id, inception_date: input.proposal.inception_date,
    lines: input.lines.map(l => ({ product_line: l.product_line, label: l.label, spec: l.spec, contact_ids: [] })), actor: input.actor, dispatch: false,
  })
  const rounds = await store.insert<{ id: string; line_id: string }>('placement_rounds', lines.map(l => ({
    placement_id: placement.id, line_id: l.id, round_no: 1, spec: l.spec, reason: 'initial', opened_by: input.actor,
    opened_at: input.prior.map(p => p.trs_first_at).sort()[0] ?? input.thread.created_at,
  })))
  for (const r of rounds) await store.patch('placement_lines', `id=eq.${r.line_id}`, { current_round_id: r.id, status: 'quoting' })
  const now = Date.now()
  let read = 0
  for (const p of input.prior) {
    for (const r of rounds) {
      await store.insert('placement_dispatches', {
        placement_id: placement.id, line_id: r.line_id, round_id: r.id, company_id: input.companyId, insurer_company_id: p.insurer_company_id,
        insurer_name: p.insurer_name, to_email: p.to_email, thread_id: p.thread.id, gmail_thread_id: p.thread.gmail_thread_id, status: 'sent',
        sent_at: p.trs_first_at, last_outbound_at: p.trs_first_at, last_inbound_at: p.replies.at(-1)?.sent_at ?? null, sent_by: input.actor,
        next_chase_at: !p.replies.length && now - Date.parse(p.trs_first_at) < CHASE_WITHIN_MS ? nextChaseAt(new Date(), 0).toISOString() : null,
      })
    }
    // The reply reader takes every line of this placement the insurer was asked about in one read.
    for (const m of p.replies) { await handleInbound({ message_id: m.id, thread_id: p.thread.id, gmail_thread_id: p.thread.gmail_thread_id, direction: 'inbound' }).catch(() => null); read++ }
  }
  await store.log({ company_id: input.companyId, placement_id: placement.id, kind: 'opened', actor: input.actor, thread_id: input.thread.id,
    text: `Picked up mid-way from the mailbox: ${lines.map(l => l.label).join(', ')} — ${input.prior.length} insurer thread${input.prior.length === 1 ? '' : 's'} (${[...new Set(input.prior.map(p => p.insurer_name))].join(', ') || 'none found'}), ${read} repl${read === 1 ? 'y' : 'ies'} read. No request drafted.`,
    detail: { midway: true, insurer_threads: input.prior.map(p => p.thread.id), approached: input.proposal.insurers_approached, project: input.proposal.project } })
  return { placement_id: placement.id, lines: lines.map(l => l.label ?? l.product_line), insurers: input.prior.length, replies_read: read }
}

/** The client request an insurer thread belongs to: the newest client rfq/renewal thread it fits. */
export async function clientThreadFor(insurerThreadId: string): Promise<ThreadRow | null> {
  const [t] = await sbTry<ThreadRow[]>(`email_threads?id=eq.${insurerThreadId}&select=id,subject,gmail_thread_id,company_id,created_at`, [])
  const [f] = await sbTry<{ insurer_company_id: string }[]>(`thread_insurers?thread_id=eq.${insurerThreadId}&select=insurer_company_id&limit=1`, [])
  if (!t || !f) return null
  const [ins] = await sbTry<{ company_name: string }[]>(`companies?id=eq.${f.insurer_company_id}&select=company_name`, [])
  const firstAt = (await store.threadMessages(insurerThreadId, 1))[0]?.sent_at ?? t.created_at
  const from = new Date(Date.parse(firstAt) - AFTER_MS).toISOString(), to = new Date(Date.parse(firstAt) + BEFORE_MS).toISOString()
  const cands = await sbTry<(ThreadRow & { companies: { company_name: string; kind: string } | null })[]>(
    `email_threads?category=in.(rfq,renewal)&created_at=gte.${from}&created_at=lte.${to}&deleted_at=is.null&select=id,subject,gmail_thread_id,company_id,created_at,companies(company_name,kind)&order=created_at.desc&limit=300`, [])
  const insurerWords = (ins?.company_name ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []
  return cands.find(c => c.companies?.kind === 'client' && belongsToRequest({ subject: t.subject ?? '', firstAt, insurerWords }, { subject: c.subject ?? '', project: null, clientName: c.companies.company_name, startAt: c.created_at })) ?? null
}
