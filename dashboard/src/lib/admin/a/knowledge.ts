/**
 * Knowledge keeper: the only writer of company_facts, the per-group knowledge bank. Every fact
 * carries where it came from (source, date, the words it was read from). A newer different value
 * for the same key supersedes the old row — the old one stays, pointed at its successor, so the
 * history reads back. Other agents read with getGroupFacts().
 *
 *   knowledge_keeper · record_facts  { facts }            facts another agent read
 *   knowledge_keeper · seed_company  { company_id }       policies, insureds, acts-for contacts
 *   knowledge_keeper · read_ledger   { group_id }         reads the group's ledger from its cursor: client mail only
 *   knowledge_keeper · read_message  { message_id, company_id }  older hand-off: logs the message, then reads the ledger
 *
 * Mail is read from the company ledger (src/lib/admin/ledger.ts), not message by message: the
 * cursor in agent_cursors makes a run resume where the last one stopped, and only a client
 * writing in their own words is read — never insurers, partners, TPAs, vendors, lists or TRS.
 */
import { sb, sbTry, enc, isInternal, bareEmail } from '@/lib/crm/db'
import { callGemini } from '@/lib/ai-call'
import { GEMINI_FLASH, GEMINI_LITE } from '@/lib/gemini-models'
import { subjectNames } from '@/lib/nexus/company-view'
import { skip, enqueue, type AgentTask } from '@/lib/agent-tasks/queue'
import { readHistory } from './history'
import { refKey } from './signals'
import type { FactInput, ReadMessagePayload, RecordFactsPayload, SeedCompanyPayload } from './handoffs'
import { readLedger, getCursor, setCursor } from '@/lib/admin/ledger'
import { factReader } from '@/lib/admin/k/shape'
import { catalogueFor, cleanFacts, LINE_SLUGS } from '@/lib/admin/k/catalogue'
import { depositMessages, directory } from '@/lib/admin/k/deposit'

type Row = Record<string, any>

export type CompanyFact = {
  id: string; group_id: string | null; company_id: string | null; policy_id: string | null
  topic: string; key: string; value: string; source_kind: string; source_id: string | null
  source_date: string | null; quote: string | null; confidence: string; created_by_agent: string; created_at: string
}

/** The top of a company's group: follow parent_id up (at most 6 steps, cycles stop). */
export async function groupRoot(companyId: string): Promise<string> {
  let id = companyId
  const seen = new Set<string>()
  for (let k = 0; k < 6; k++) {
    seen.add(id)
    const [c] = await sbTry<Row[]>(`companies?id=eq.${enc(id)}&select=parent_id`, [])
    if (!c?.parent_id || seen.has(c.parent_id)) break
    id = c.parent_id
  }
  return id
}

/** Every current fact for the company's whole group, newest first. */
export async function getGroupFacts(companyId: string, opts: { topic?: string } = {}): Promise<CompanyFact[]> {
  const root = await groupRoot(companyId)
  return sbTry<CompanyFact[]>(`company_facts?group_id=eq.${enc(root)}&superseded_by=is.null${opts.topic ? `&topic=eq.${enc(opts.topic)}` : ''}&select=*&order=source_date.desc.nullslast,created_at.desc&limit=1000`, [])
}

/**
 * Pure: which incoming facts are new, and which current rows each one replaces. A newer source
 * replaces what an older source said under the same key; one email stating several values under
 * one key (two premiums in one quotation) keeps them all.
 */
export function planFacts(incoming: FactInput[], current: Pick<CompanyFact, 'id' | 'company_id' | 'key' | 'value' | 'source_id'>[]): { insert: FactInput[]; supersede: Map<number, string[]> } {
  const insert: FactInput[] = []
  const supersede = new Map<number, string[]>()
  const norm = (v: string) => v.replace(/\s+/g, ' ').trim().toLowerCase()
  const seen = new Set<string>()
  for (const f of incoming) {
    const sig = `${f.company_id}|${f.key}|${norm(f.value)}`
    if (seen.has(sig)) continue
    seen.add(sig)
    const same = current.filter(c => c.company_id === f.company_id && c.key === f.key)
    if (same.some(c => norm(c.value) === norm(f.value))) continue
    supersede.set(insert.length, same.filter(c => !f.source_id || c.source_id !== f.source_id).map(c => c.id))
    insert.push(f)
  }
  return { insert, supersede }
}

export async function writeFacts(facts: FactInput[], agent: string): Promise<{ inserted: number; superseded: number }> {
  if (!facts.length) return { inserted: 0, superseded: 0 }
  const companies = Array.from(new Set(facts.map(f => f.company_id)))
  const roots = new Map<string, string>()
  for (const c of companies) roots.set(c, await groupRoot(c))
  const current = await sbTry<CompanyFact[]>(`company_facts?company_id=in.(${companies.join(',')})&superseded_by=is.null&select=id,company_id,key,value,source_id&limit=5000`, [])
  const { insert, supersede } = planFacts(facts, current)
  let superseded = 0
  for (let i = 0; i < insert.length; i++) {
    const f = insert[i]
    // The unique index is on an expression (coalesce(source_id, '')), which ON CONFLICT cannot
    // name; a duplicate insert fails and is skipped — planFacts has already left out the known ones.
    const [row] = await sb<Row[]>('company_facts', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ group_id: roots.get(f.company_id), company_id: f.company_id, policy_id: f.policy_id ?? null, topic: f.topic, key: f.key, value: f.value, source_kind: f.source_kind, source_id: f.source_id ?? null, source_date: f.source_date ?? null, quote: f.quote?.slice(0, 240) ?? null, confidence: f.confidence ?? 'medium', created_by_agent: agent }),
    }).catch(() => [] as Row[])
    const old = supersede.get(i) ?? []
    if (row?.id && old.length) {
      await sb(`company_facts?id=in.(${old.join(',')})`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ superseded_by: row.id }) })
      superseded += old.length
    }
  }
  return { inserted: insert.length, superseded }
}

/** Pure: facts a company's own records already state. */
export function seedFacts(company: Row, policies: Row[], insureds: Row[], links: Row[]): FactInput[] {
  const out: FactInput[] = []
  const id = company.id as string
  const f = (topic: string, key: string, value: unknown, src: { kind: FactInput['source_kind']; id?: string | null; date?: string | null; policy_id?: string | null }) => {
    if (value == null || !String(value).trim()) return
    out.push({ company_id: id, policy_id: src.policy_id ?? null, topic, key, value: String(value).trim().slice(0, 500), source_kind: src.kind, source_id: src.id ?? null, source_date: src.date ?? null, confidence: 'high' })
  }
  f('business', 'business.name', company.company_name, { kind: 'staff', id })
  f('business', 'business.uen', company.uen, { kind: 'staff', id })
  if (company.parent_id) f('business', 'business.parent', company.parent_id, { kind: 'staff', id })
  if (company.relation) f('business', 'business.relation', company.relation, { kind: 'staff', id })
  for (const p of policies) {
    const scope = p.policy_number ? `policy.${refKey(p.policy_number)}` : `policy.${p.id}`
    const src = { kind: 'policy' as const, id: p.id, date: p.start_date ?? null, policy_id: p.id }
    f('cover', `${scope}.number`, p.policy_number, src)
    f('cover', `${scope}.insurer`, p.insurer, src)
    f('cover', `${scope}.class`, p.class_of_insurance ?? p.product_line, src)
    if (p.start_date || p.end_date) f('cover', `${scope}.period`, `${p.start_date ?? '?'} to ${p.end_date ?? '?'}`, src)
    f('cover', `${scope}.status`, p.lifecycle, src)
  }
  for (const i of insureds) f('cover', `policy.${i.policy_id}.insured`, i.role, { kind: 'policy', id: i.policy_id, policy_id: i.policy_id })
  for (const l of links) {
    const email = String(l.contacts?.email ?? '').toLowerCase()
    if (!email) continue
    const name = [l.contacts?.first_name, l.contacts?.last_name].filter(Boolean).join(' ')
    f('contact', `contact.${email}.acts_for`, (l.scope?.length ? l.scope : ['all']).join(', '), { kind: 'staff', id: l.contact_id })
    if (name) f('contact', `contact.${email}.name`, name, { kind: 'staff', id: l.contact_id })
    if (l.status === 'left') f('contact', `contact.${email}.status`, 'left', { kind: 'staff', id: l.contact_id })
  }
  return out
}

async function seedCompany(task: AgentTask) {
  const { company_id } = task.payload as SeedCompanyPayload
  const [company] = await sbTry<Row[]>(`companies?id=eq.${enc(company_id)}&select=id,company_name,uen,parent_id,relation,kind`, [])
  if (!company) { await skip(task.id, 'company not found'); return 'handled' as const }
  const [policies, insureds, links] = await Promise.all([
    sbTry<Row[]>(`policies?company_id=eq.${enc(company_id)}&select=id,policy_number,insurer,class_of_insurance,product_line,start_date,end_date,lifecycle&limit=200`, []),
    sbTry<Row[]>(`policy_insureds?company_id=eq.${enc(company_id)}&select=policy_id,company_id,role`, []),
    sbTry<Row[]>(`company_contacts?company_id=eq.${enc(company_id)}&select=contact_id,scope,status,contacts(email,first_name,last_name)`, []),
  ])
  return writeFacts(seedFacts(company, policies, insureds, links), 'knowledge_keeper')
}

export const CLIENT_SYSTEM = `You read one email a client of TRS (a Singapore insurance broker) wrote, and record durable facts about the client's business that a broker wants on file next year: the business, its people and what each handles, its headcount and sites, what cover its contracts require, how it pays and how it likes to work.
Only what the email states. Nothing about TRS staff, nothing about the request itself, no opinions.
business.* is the client's own business: another entity named in a signature or address goes under business.related_entity, never business.name.
requirement.* is only cover a contract, a tender or the law obliges the client to hold (with its amount when stated), never the thing this email asks for and never a renewal falling due.
Use ONLY these keys. {person} is that person's email address as it appears on the email; {ref} is a policy, claim or quotation number exactly as written, or a line of cover from LINES when no number is given.
KEYS:
%KEYS%
LINES: %LINES%
Each fact: key, value (short; a figure for money, number and percent), quote (the exact words from the email that state it, under 200 characters).
Answer JSON only: {"facts":[{"key":"","value":"","quote":""}]}. An empty list is a good answer when the email states nothing durable.`

export const INSURER_SYSTEM = `You read one email an insurer wrote to TRS (a Singapore insurance broker) about TRS's client %CLIENT%, and record what the insurer states about that client's cover: the premium quoted or agreed, a renewal increase or decrease, sums insured and limits, excesses, conditions and exclusions, a decline and its reason, how long a quote is valid; an endorsement made and its premium; a claim's status, the amount paid and the reason for a decision.
Only what the email or its attachments state about %CLIENT%. Other clients named in the same email are left out. No opinions.
A question or request the insurer puts to TRS is not a fact: leave it out. A condition is a term the cover is subject to, not something the insurer asks for.
Use ONLY these keys. {ref} is the policy, claim, quotation or endorsement number exactly as written, or a line of cover from LINES when no number is given.
KEYS:
%KEYS%
LINES: %LINES%
When the email lists several figures under one key (two premiums, several limits), give each its own fact and start the value with what it is for ("Contract value S$1,380,000", "Plant and machinery S$100,000").
Each fact: key, value (short; a figure for money and percent, with its currency), quote (the exact words from the email that state it, under 200 characters).
Answer JSON only: {"facts":[{"key":"","value":"","quote":""}]}. An empty list is a good answer when the email states no terms.`

/** Pure. A short reply that only thanks, notes or confirms receipt states no fact worth a model call. */
export function isAcknowledgement(text: string): boolean {
  const body = text.replace(/^(hi|dear|hello)[^\n,]{0,40},?\s*/i, '').replace(/\s+/g, ' ').trim()
  const words = body.split(' ').filter(Boolean).length
  if (words > 15 || /\d|@|\$|%/.test(body)) return false
  return /\b(thank(s| you)|noted|well received|received with thanks|got it|will revert|will do|ok(ay)?|appreciate)\b/i.test(body)
}

const AGENT = 'knowledge_keeper'
const PER_RUN = 25

export type PreparedRead = {
  messageId: string; companyId: string; reader: 'client' | 'insurer'
  system: string; prompt: string; corpus: string; addresses: string[]; sentAt: string | null; withFiles: boolean
}

/** Everything one read needs, or null when the email is not worth one. The same for a live call and a batch. */
export async function prepareRead(messageId: string, companyId: string, reader: 'client' | 'insurer'): Promise<PreparedRead | null> {
  const [[m], people, [co]] = await Promise.all([
    sbTry<Row[]>(`email_messages?id=eq.${enc(messageId)}&select=id,from_address,subject,body_text,sent_at`, []),
    sbTry<Row[]>(`email_participants?message_id=eq.${enc(messageId)}&deleted_at=is.null&select=email`, []),
    sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=company_name`, []),
  ])
  if (!m || isInternal(bareEmail(m.from_address))) return null
  const own = readHistory(m.body_text ?? '', m.subject).top.slice(0, 6000)
  if (own.length < 40 || isAcknowledgement(own)) return null
  const client = String(co?.company_name ?? 'the client')
  let corpus = `${m.subject ?? ''}\n${own}`
  if (reader === 'insurer') {
    const atts = await sbTry<Row[]>(`email_attachments?message_id=eq.${enc(messageId)}&parsed_text=not.is.null&select=filename,parsed_text&limit=6`, [])
    // Documents only: an image's stored text is a model's description of it, not its own words.
    for (const a of atts.filter(x => /\.(pdf|xlsx?|xlsm|csv|docx?|txt)$/i.test(String(x.filename ?? '')))) corpus += `\n\nATTACHMENT ${a.filename}:\n${String(a.parsed_text).slice(0, 15_000)}`
    corpus = corpus.slice(0, 40_000)
    const dir = await directory()
    const group = dir.group(companyId)
    const names = [...dir.byId.values()].filter(c => dir.group(c.id) === group && c.company_name).map(c => String(c.company_name))
    if (!names.some(n => subjectNames(corpus, n))) return null
  }
  return {
    messageId, companyId, reader, corpus, sentAt: m.sent_at ?? null,
    system: (reader === 'client' ? CLIENT_SYSTEM : INSURER_SYSTEM).replace(/%CLIENT%/g, client).replace('%KEYS%', catalogueFor(reader)).replace('%LINES%', LINE_SLUGS.join(', ')),
    prompt: `FROM: ${m.from_address}\n${corpus}`,
    addresses: [bareEmail(m.from_address), ...people.map(p => String(p.email ?? ''))].filter(Boolean),
    withFiles: corpus.length > own.length + (m.subject ?? '').length + 2,
  }
}

/** A read's answer, checked against the catalogue and the email's own words. Pure. */
export function finishRead(p: PreparedRead, parsed: unknown): FactInput[] {
  return cleanFacts(parsed, p.corpus, p.reader, p.addresses).map(f => ({ company_id: p.companyId, topic: f.topic, key: f.key, value: f.value, quote: f.quote, source_kind: 'email' as const, source_id: p.messageId, source_date: String(p.sentAt ?? '').slice(0, 10) || null, confidence: 'medium' }))
}

/**
 * Facts the model reads off one email, client or insurer, each checked against the catalogue and
 * the email's own words (cleanFacts). An insurer's email is read for the client it is filed under,
 * with the text of its attachments (quotations, renewal notices, settlement letters arrive as
 * PDFs), and only when the email or an attachment names that client: a thread filed against the
 * wrong client must not write its terms into that client's file.
 */
export async function factsFromMessage(messageId: string, companyId: string, reader: 'client' | 'insurer', opts: { dryRun?: boolean } = {}): Promise<FactInput[]> {
  const p = await prepareRead(messageId, companyId, reader)
  if (!p) return []
  const r = await callGemini({ agent: 'admin', feature: reader === 'client' ? 'admin_fact_read' : 'admin_fact_read_insurer', model: p.withFiles ? GEMINI_FLASH : GEMINI_LITE, system: p.system, temperature: 0, parts: [{ text: p.prompt }], json: true, maxOutputTokens: 4000, thinkingShare: 0, metadata: { company_id: companyId, message_id: messageId, dry_run: !!opts.dryRun } })
  if (!r.text) throw new Error(r.error ?? 'no answer from the model')
  let parsed: unknown = null
  try { parsed = JSON.parse(r.text) } catch { throw new Error('model answer was not JSON') }
  return finishRead(p, parsed)
}

/** Reads a group's new ledger entries from the cursor. The cursor moves after each entry, so a failure resumes at that entry. */
async function readLedgerTask(task: AgentTask) {
  const groupId = String(task.payload?.group_id ?? task.company_id ?? '')
  if (!groupId) { await skip(task.id, 'no group'); return 'handled' as const }
  const dir = await directory()
  let cursor = await getCursor(AGENT, groupId)
  const entries = await readLedger(groupId, cursor, PER_RUN)
  let read = 0, inserted = 0, superseded = 0
  for (const e of entries) {
    const reader = e.source_table === 'email_messages' && e.company_id ? factReader(e, dir.byId.get(e.company_id)?.kind) : null
    if (reader && e.company_id) {
      const w = await writeFacts(await factsFromMessage(e.source_id, e.company_id, reader), AGENT)
      read++; inserted += w.inserted; superseded += w.superseded
    }
    cursor = e.seq
    await setCursor(AGENT, groupId, cursor)
  }
  // More waiting: carry on in a follow-up task rather than one long run.
  if (entries.length === PER_RUN) await enqueue({ agent: 'knowledge_keeper', kind: 'read_ledger', idem_key: `facts:ledger:${groupId}:after:${cursor}`, created_by_agent: 'knowledge_keeper', company_id: groupId, payload: { group_id: groupId } })
  return { entries: entries.length, read, inserted, superseded, cursor }
}

/** Older hand-off from intake: make sure the message is in the ledger, then read the group from its cursor. */
async function readMessage(task: AgentTask) {
  const { message_id, company_id } = task.payload as ReadMessagePayload
  const dir = await directory()
  if (dir.byId.get(company_id)?.kind !== 'client') { await skip(task.id, 'not a client'); return 'handled' as const }
  const r = await depositMessages([message_id])
  if (r.unfiled.length) { await skip(task.id, 'thread not filed yet; the depositor looks again'); return 'handled' as const }
  const groupId = dir.group(company_id)
  await enqueue({ agent: 'knowledge_keeper', kind: 'read_ledger', idem_key: `facts:ledger:${groupId}:${new Date().toISOString().slice(0, 13)}`, created_by_agent: 'knowledge_keeper', company_id: groupId, payload: { group_id: groupId } })
  return { deposited: r.written, queued_read: groupId }
}

export async function knowledgeTask(task: AgentTask) {
  if (task.kind === 'record_facts') return writeFacts((task.payload as RecordFactsPayload).facts ?? [], task.created_by_agent || 'knowledge_keeper')
  if (task.kind === 'seed_company') return seedCompany(task)
  if (task.kind === 'read_message') return readMessage(task)
  if (task.kind === 'read_ledger') return readLedgerTask(task)
  await skip(task.id, `unknown kind ${task.kind}`)
  return 'handled' as const
}
