/**
 * The reads and writes behind a case's rounds (rounds.ts). No model is called here.
 *
 *   loadRounds(caseId, viewer)                 the rounds, each insurer's chain, the next steps and their unsent emails
 *   setCall(caseId, messageId, call, actor)    a person's call on one email; null hands it back to the rule
 *
 * Rounds are worked out on every read. Only a person's calls are stored, as case events of kind
 * "move", the latest per email winning.
 */
import { sb, sbTry, enc, emailDomain, bareEmail, inChunks, sbAll } from '@/lib/crm/db'
import { directory } from '@/lib/admin/k/deposit'
import { displayName, matchInsurer, type InsurerCompany } from '@/lib/insurers'
import { indexNames, type NameIndex } from '@/lib/crm/party-read'
import { referralTags } from '@/lib/crm/thread-referral'
import { companyCore } from '@/lib/crm/resolve'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { CaseError, caseMessages, caseThreadIds } from './sources-store'
import { buildRounds, CHAIN_STATE_NAME, isMove, isWriter, MOVES_FOR, MOVE_NAME, WRITER_NAME, type Call, type ChainState, type Move, type Rounds, type RoundsInput, type Writer } from './rounds'
import type { Side, SourceMessage } from './sources'

type Row = Record<string, any>
const quiet = { Prefer: 'return=minimal' }

export type CaseRoundsView = Rounds & {
  item: { id: string; title: string | null; case_type: string; closed_at: string | null }
  /** What a person may call an email, by who wrote it. */
  moves: Record<Writer, { move: Move; name: string }[]>
  /** The unsent email already made for a step, by step. */
  drafted: Record<string, string>
  names: { move: Record<Move, string>; state: Record<ChainState, string>; writer: Record<Writer, string> }
}

async function workItem(id: string): Promise<Row> {
  const [item] = await sb<Row[]>(`work_items?id=eq.${enc(id)}&select=id,title,case_type,company_id,client_name,policy_id,placement_id,product_line,owner_email,closed_at,draft_id&limit=1`)
  if (!item) throw new CaseError('This case no longer exists.', 404)
  return item
}

const sameCompany = (a: string, b: string) => {
  const x = companyCore(a), y = companyCore(b)
  return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(`${y} `) || y.startsWith(`${x} `))))
}

/**
 * The insurer TRS's own subject names. Staff write "(TRS) Insurer - Client | cover" and
 * "(TRS) Client - topic" alike, so the first name counts only when it is an insurer on file, or
 * when the second names the case's client and the first does not.
 */
export function insurerInSubject(subject: string | null | undefined, insurers: InsurerCompany[], client: string | null): string | null {
  const m = /^\s*(?:(?:re|fw|fwd)\s*:\s*)*\(TRS\)\s*([^|]+?)\s+-\s+([^|]+)/i.exec(String(subject ?? ''))
  const first = m?.[1]?.trim(), second = m?.[2]?.trim()
  if (!first || !second || first.length > 60) return null
  const onFile = matchInsurer(first, insurers)
  if (onFile) return displayName(onFile.name)
  return client && sameCompany(second, client) && !sameCompany(first, client) ? first : null
}

export type CaseMail = Omit<RoundsInput, 'caseType' | 'set'> & { item: Row; messages: SourceMessage[]; sides: Map<string, Side>; visible: Set<string>; set: Map<string, Call> }

/** Everything the rounds are read from. */
export async function caseMail(workItemId: string, viewer: string | null): Promise<CaseMail> {
  const item = await workItem(workItemId)
  const { ids, sides, insurers: named } = await caseThreadIds(workItemId)
  const [visible, messages, dir, tags, threads, events] = await Promise.all([
    visibleThreadIds(ids, viewer),
    caseMessages(ids),
    directory(),
    referralTags(ids),
    inChunks(ids, 80, c => sbAll<Row>(`email_threads?id=in.(${c.join(',')})&select=id,subject,company_id`)),
    sbAll<Row>(`work_item_events?work_item_id=eq.${enc(workItemId)}&kind=in.(move,source_side)&select=kind,detail,created_at&order=created_at.asc&limit=2000`),
  ])
  const byDomain = new Map<string, Row>()
  // Insurers first, as the directory's own domain map reads them.
  for (const kind of ['insurer', 'tpa', 'partner', 'client']) for (const c of dir.byId.values()) if (c.kind === kind && c.company_name) {
    for (const d of [c.domain, ...(Array.isArray(c.domains) ? c.domains : [])]) if (d && !byDomain.has(String(d).toLowerCase())) byDomain.set(String(d).toLowerCase(), c)
  }
  const at = (a: string | null | undefined) => byDomain.get(emailDomain(bareEmail(a)))
  const onFile = [...dir.byId.values()].filter(c => c.company_name).map(c => ({ id: String(c.id), name: String(c.company_name), kind: String(c.kind ?? '') }))
  const names: NameIndex = indexNames(onFile)
  const insurers: InsurerCompany[] = onFile.filter(c => c.kind === 'insurer' || c.kind === 'tpa').map(c => ({ id: c.id, name: c.name, domain: null }))
  const client = item.company_id ? dir.byId.get(item.company_id)?.company_name ?? item.client_name ?? null : item.client_name ?? null

  const threadInsurer = new Map<string, string>()
  for (const t of threads) {
    const co = t.company_id ? dir.byId.get(t.company_id) : null
    const name = co && (co.kind === 'insurer' || co.kind === 'tpa') && co.company_name ? displayName(String(co.company_name)) : insurerInSubject(t.subject, insurers, client)
    if (name) threadInsurer.set(t.id, name)
  }
  const set = new Map<string, Call>()
  const sideSet = new Set<string>()
  for (const e of events) {
    if (e.kind === 'source_side') { if (typeof e.detail?.thread_id === 'string') sideSet.add(e.detail.thread_id); continue }
    const id = e.detail?.message_id
    if (typeof id !== 'string') continue
    if (isWriter(e.detail?.by) && isMove(e.detail?.move)) set.set(id, { by: e.detail.by, move: e.detail.move })
    else set.delete(id)
  }
  // The insurer a person named for a thread stands over its company and its subject.
  const threadNamed = new Set<string>()
  for (const [id, companyId] of named) {
    const co = dir.byId.get(companyId)
    if (co?.company_name) { threadInsurer.set(id, displayName(String(co.company_name))); threadNamed.add(id) }
  }
  const referral = new Map<string, string | false>([...tags].map(([id, t]) => [id, t.referral ? t.company ?? 'referral' : false]))
  return {
    item, messages, sides, sideSet, visible, domainKind: dir.domainKind, names, threadInsurer, threadNamed, set, referral,
    insurerName: a => { const c = at(a); return c && (c.kind === 'insurer' || c.kind === 'tpa') ? displayName(String(c.company_name)) : null },
    companyName: a => { const c = at(a); return c ? String(c.company_name) : null },
  }
}

const input = (c: CaseMail, set: ReadonlyMap<string, Call> = c.set): RoundsInput => ({
  messages: c.messages, sides: c.sides, sideSet: c.sideSet, visible: c.visible, domainKind: c.domainKind, insurerName: c.insurerName, companyName: c.companyName,
  names: c.names, threadInsurer: c.threadInsurer, threadNamed: c.threadNamed, caseType: c.item.case_type, set, referral: c.referral,
})
/** The rounds as the case's emails stand. */
export const roundsOf = (c: CaseMail): Rounds => buildRounds(input(c))

const MOVE_LISTS = Object.fromEntries((Object.keys(MOVES_FOR) as Writer[]).map(w => [w, MOVES_FOR[w].map(move => ({ move, name: MOVE_NAME[move] }))])) as CaseRoundsView['moves']

/** The unsent emails made for this case's steps (rounds-draft.ts), by step. */
export async function stepDrafts(workItemId: string): Promise<Record<string, string>> {
  const rows = await sbTry<Row[]>(`ai_drafts?work_item_id=eq.${enc(workItemId)}&status=in.(pending,draft)&select=id,context_used&order=created_at.asc&limit=200`, [])
  return Object.fromEntries(rows.filter(r => typeof r.context_used?.step === 'string').map(r => [r.context_used.step as string, r.id as string]))
}

export async function loadRounds(workItemId: string, viewer: string | null): Promise<CaseRoundsView> {
  const [c, drafted] = await Promise.all([caseMail(workItemId, viewer), stepDrafts(workItemId)])
  return { ...roundsOf(c), drafted, names: { move: MOVE_NAME, state: CHAIN_STATE_NAME, writer: WRITER_NAME }, item: { id: c.item.id, title: c.item.title ?? null, case_type: c.item.case_type, closed_at: c.item.closed_at ?? null }, moves: MOVE_LISTS }
}

/** A person's call on one email: who wrote it and what it is. Null hands the email back to the rule. */
export async function setCall(workItemId: string, messageId: string, call: Call | null, actor: string): Promise<void> {
  const c = await caseMail(workItemId, actor)
  const m = c.messages.find(x => x.id === messageId)
  if (!m) throw new CaseError('This email is not on the case.', 404)
  if (!c.visible.has(m.thread_id)) throw new CaseError('This email is in a colleague\'s mailbox.', 403)
  const was = buildRounds(input(c, new Map())).rounds.flatMap(r => r.moves).find(x => x.message_id === messageId)
  if (!was) throw new CaseError('This email takes no part in the rounds.', 400)
  if (call) {
    if ((was.by === 'trs') !== (call.by === 'trs')) throw new CaseError(was.by === 'trs' ? 'This email was written by TRS.' : 'This email was not written by TRS.', 400)
    if (!MOVES_FOR[call.by].includes(call.move)) throw new CaseError(`An email from ${call.by === 'trs' ? 'TRS' : `the ${call.by}`} cannot be set to ${MOVE_NAME[call.move]}.`, 400)
  }
  const note = call ? `Email set to ${WRITER_NAME[call.by]}: ${MOVE_NAME[call.move]}` : 'Email handed back to the rule'
  await sb('work_item_events', { method: 'POST', headers: quiet, body: JSON.stringify({ work_item_id: workItemId, kind: 'move', actor, detail: { message_id: messageId, thread_id: m.thread_id, by: call?.by ?? null, move: call?.move ?? null, rule: was.rule, note } }) })
}
