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
import { GEMINI_LITE } from '@/lib/gemini-models'
import { skip, enqueue, type AgentTask } from '@/lib/agent-tasks/queue'
import { readHistory } from './history'
import { refKey } from './signals'
import type { FactInput, ReadMessagePayload, RecordFactsPayload, SeedCompanyPayload } from './handoffs'
import { readLedger, getCursor, setCursor } from '@/lib/admin/ledger'
import { factReadable } from '@/lib/admin/k/shape'
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

/** Pure: which incoming facts are new, and which current rows each one replaces. */
export function planFacts(incoming: FactInput[], current: Pick<CompanyFact, 'id' | 'company_id' | 'key' | 'value'>[]): { insert: FactInput[]; supersede: Map<number, string[]> } {
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
    supersede.set(insert.length, same.map(c => c.id))
    insert.push(f)
  }
  return { insert, supersede }
}

export async function writeFacts(facts: FactInput[], agent: string): Promise<{ inserted: number; superseded: number }> {
  if (!facts.length) return { inserted: 0, superseded: 0 }
  const companies = Array.from(new Set(facts.map(f => f.company_id)))
  const roots = new Map<string, string>()
  for (const c of companies) roots.set(c, await groupRoot(c))
  const current = await sbTry<CompanyFact[]>(`company_facts?company_id=in.(${companies.join(',')})&superseded_by=is.null&select=id,company_id,key,value&limit=5000`, [])
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
  f('insured', 'company.name', company.company_name, { kind: 'staff', id })
  f('insured', 'company.uen', company.uen, { kind: 'staff', id })
  if (company.parent_id) f('insured', 'company.parent', company.parent_id, { kind: 'staff', id })
  if (company.relation) f('insured', 'company.relation', company.relation, { kind: 'staff', id })
  for (const p of policies) {
    const scope = p.policy_number ? `policy.${refKey(p.policy_number)}` : `policy.${p.id}`
    const src = { kind: 'policy' as const, id: p.id, date: p.start_date ?? null, policy_id: p.id }
    f('cover', `${scope}.number`, p.policy_number, src)
    f('cover', `${scope}.insurer`, p.insurer, src)
    f('cover', `${scope}.class`, p.class_of_insurance ?? p.product_line, src)
    if (p.start_date || p.end_date) f('cover', `${scope}.period`, `${p.start_date ?? '?'} to ${p.end_date ?? '?'}`, src)
    f('cover', `${scope}.status`, p.lifecycle, src)
  }
  for (const i of insureds) f('insured', `policy.${i.policy_id}.insured.${i.company_id}`, i.role, { kind: 'policy', id: i.policy_id, policy_id: i.policy_id })
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

const FACT_SYSTEM = `You read one email to a Singapore insurance broker (TRS) from a client, and list durable facts about the client that a broker would want on file next year: who handles claims, billing or HR and how to reach them; headcount, fleet size, sites, business activity; what they require (contract insurance requirements, deadlines that recur); how they like to be dealt with.
Only facts the email states. No opinions, no summaries of the request itself, nothing about TRS staff.
Each fact: topic (contact|business|requirement|preference|claims_handling|billing|members), key (dot.separated, lower case, e.g. "claims.contact", "fleet.vehicles", "headcount.total"), value (short), quote (the exact words from the email, under 200 characters).
Answer JSON only: {"facts":[{"topic":"","key":"","value":"","quote":""}]}`

const KEY_SYNONYMS: Record<string, string> = { company: 'business', client: 'business', firm: 'business', organisation: 'business', organization: 'business', hr: 'contact', person: 'contact', poc: 'contact', telephone: 'phone', mobile: 'phone', tel: 'phone', mail: 'email', e_mail: 'email', staff: 'headcount', employees: 'headcount', employee_count: 'headcount', office: 'address', location: 'address' }

/**
 * One spelling per fact key, so a later value supersedes the earlier one instead of sitting
 * beside it: the topic is never repeated inside the key ("business.company.rebrand" and
 * "business.business.rebrand" are both "business.rebrand"), synonyms collapse, and a key is at
 * most three segments. Pure.
 */
export function canonicalKey(topic: string, raw: string): string {
  const segs = raw.toLowerCase().replace(/[^a-z0-9_.]/g, '').split('.').filter(Boolean).map(s => KEY_SYNONYMS[s] ?? s)
  const out: string[] = []
  for (const s of segs) { if (s === topic || s === out[out.length - 1]) continue; out.push(s) }
  return out.slice(0, 3).join('.').slice(0, 80)
}

/** Pure: keeps only facts whose quote is really in the text, with a sane key. */
export function verifiedFacts(raw: unknown, text: string): { topic: string; key: string; value: string; quote: string }[] {
  const flat = text.replace(/\s+/g, ' ').toLowerCase()
  const list = Array.isArray((raw as Row)?.facts) ? (raw as Row).facts as Row[] : []
  const topics = new Set(['contact', 'business', 'requirement', 'preference', 'claims_handling', 'billing', 'members'])
  return list.filter(f => f && typeof f.quote === 'string' && typeof f.value === 'string' && typeof f.key === 'string')
    .map(f => { const topic = topics.has(f.topic) ? f.topic : 'business'; return { topic, key: canonicalKey(topic, String(f.key)), value: String(f.value).trim().slice(0, 300), quote: String(f.quote).trim().slice(0, 240) } })
    .filter(f => f.key.length >= 3 && f.value && f.quote.length >= 8 && flat.includes(f.quote.replace(/\s+/g, ' ').toLowerCase()))
    .slice(0, 20)
}

/** Pure. A short reply that only thanks, notes or confirms receipt states no fact worth a model call. */
export function isAcknowledgement(text: string): boolean {
  const body = text.replace(/^(hi|dear|hello)[^\n,]{0,40},?\s*/i, '').replace(/\s+/g, ' ').trim()
  const words = body.split(' ').filter(Boolean).length
  if (words > 15 || /\d|@|\$|%/.test(body)) return false
  return /\b(thank(s| you)|noted|well received|received with thanks|got it|will revert|will do|ok(ay)?|appreciate)\b/i.test(body)
}

const AGENT = 'knowledge_keeper'
const PER_RUN = 25

/** Facts the model reads off one client email, checked against the email's own text. */
async function factsFromMessage(messageId: string, companyId: string): Promise<FactInput[]> {
  const [m] = await sbTry<Row[]>(`email_messages?id=eq.${enc(messageId)}&select=id,from_address,subject,body_text,sent_at`, [])
  if (!m || isInternal(bareEmail(m.from_address))) return []
  const own = readHistory(m.body_text ?? '', m.subject).top.slice(0, 6000)
  if (own.length < 40 || isAcknowledgement(own)) return []
  const r = await callGemini({ agent: 'admin', feature: 'admin_fact_read', model: GEMINI_LITE, system: FACT_SYSTEM, parts: [{ text: `FROM: ${m.from_address}\nSUBJECT: ${m.subject ?? ''}\n\n${own}` }], json: true, maxOutputTokens: 4000, thinkingShare: 0, metadata: { company_id: companyId, message_id: messageId } })
  if (!r.text) throw new Error(r.error ?? 'no answer from the model')
  let parsed: unknown = null
  try { parsed = JSON.parse(r.text) } catch { throw new Error('model answer was not JSON') }
  return verifiedFacts(parsed, own).map(f => ({ company_id: companyId, topic: f.topic, key: f.key, value: f.value, quote: f.quote, source_kind: 'email', source_id: messageId, source_date: String(m.sent_at ?? '').slice(0, 10) || null, confidence: 'medium' }))
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
    if (e.source_table === 'email_messages' && e.company_id && factReadable(e, dir.byId.get(e.company_id)?.kind)) {
      const w = await writeFacts(await factsFromMessage(e.source_id, e.company_id), AGENT)
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
