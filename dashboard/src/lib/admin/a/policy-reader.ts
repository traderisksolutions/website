/**
 * Policy reader: turns a filed cover document into facts about the client's cover — insurer,
 * class, number, period, premium — each quoting the document it came from. It writes nothing
 * itself: the facts go to the knowledge keeper, which owns company_facts.
 *
 *   policy_reader · document   { document_id }
 */
import { sbTry, enc } from '@/lib/crm/db'
import { enqueue, skip, type AgentTask } from '@/lib/agent-tasks/queue'
import { refKey } from './signals'
import type { FactInput, PolicyDocumentPayload } from './handoffs'
import { issuedDifferences, differenceLines, type Bound } from '@/lib/policies/issued-check'

type Row = Record<string, any>

/** Pure: the facts a classified document row states. */
export function factsFromDocument(doc: Row): FactInput[] {
  if (!doc.company_id) return []
  const no = doc.policy_number ? refKey(doc.policy_number) : null
  const scope = no ? `policy.${no}` : doc.policy_id ? `policy.${doc.policy_id}` : null
  if (!scope) return []
  const quote = [doc.title, doc.filename].filter(Boolean).join(' — ').slice(0, 240)
  const base = {
    company_id: doc.company_id as string, policy_id: doc.policy_id ?? null, topic: 'cover', source_kind: 'document' as const,
    source_id: doc.id as string, source_date: String(doc.received_at ?? '').slice(0, 10) || null, quote,
    confidence: (Number(doc.confidence ?? 0) >= 0.8 ? 'high' : 'medium') as 'high' | 'medium',
  }
  const out: FactInput[] = []
  const put = (key: string, value: unknown) => { if (value != null && String(value).trim()) out.push({ ...base, key: `${scope}.${key}`, value: String(value).trim().slice(0, 500) }) }
  put('number', doc.policy_number)
  put('insurer', doc.insurer_name)
  put('class', doc.class_of_insurance)
  if (doc.period_from || doc.period_to) put('period', `${doc.period_from ?? '?'} to ${doc.period_to ?? '?'}`)
  put('premium', doc.premium_text)
  put(`document.${doc.doc_type}`, doc.drive_url ?? doc.filename)
  return out
}

export async function readPolicyDocument(task: AgentTask) {
  const { document_id } = task.payload as PolicyDocumentPayload
  const [doc] = await sbTry<Row[]>(`policy_documents?id=eq.${enc(document_id)}&select=*`, [])
  if (!doc) { await skip(task.id, 'document not found'); return 'handled' as const }
  const facts = factsFromDocument(doc)
  if (!facts.length) { await skip(task.id, 'no facts on this document'); return 'handled' as const }
  await enqueue({ agent: 'knowledge_keeper', kind: 'record_facts', idem_key: `facts:doc:${document_id}`, created_by_agent: 'policy_reader', company_id: doc.company_id, policy_id: doc.policy_id ?? null, payload: { facts } })
  const checked = await checkIssued(doc)
  return { facts: facts.length, ...(checked ? { differences: checked } : {}) }
}

const COVER_DOCS = new Set(['policy_schedule', 'cover_note', 'certificate', 'endorsement'])

/**
 * A cover document against what was bound: the selected quote for the client and line, else the
 * policy record. Differences go on the company memory and on the open work item for the policy,
 * so a person sees "Premium: issued S$12,000, bound S$11,500" before the client does.
 */
async function checkIssued(doc: Row): Promise<number | null> {
  if (!COVER_DOCS.has(String(doc.doc_type ?? '')) || !doc.company_id) return null
  const bounds: Bound[] = []
  const quotes = await sbTry<Row[]>(`placement_quotes?company_id=eq.${enc(doc.company_id)}&status=in.(selected,recommended)&select=premium_amount,premium_text,limit_text,limit_amount,insurer_name,period_from,period_to,policy_number,created_at&order=created_at.desc&limit=5`, [])
  const sameInsurer = (q: Row) => !doc.insurer_name || !q.insurer_name || String(q.insurer_name).toLowerCase().split(' ')[0] === String(doc.insurer_name).toLowerCase().split(' ')[0]
  const q = quotes.find(sameInsurer)
  if (q) bounds.push({ premium_amount: q.premium_amount != null ? Number(q.premium_amount) : null, premium_text: q.premium_text ?? null, limit_text: q.limit_text ?? null, limit_amount: q.limit_amount != null ? Number(q.limit_amount) : null, insurer_name: q.insurer_name ?? null, period_from: q.period_from ?? null, period_to: q.period_to ?? null, policy_number: q.policy_number ?? null, source: 'the selected quote' })
  if (doc.policy_id) {
    const [pol] = await sbTry<Row[]>(`policies?id=eq.${enc(doc.policy_id)}&select=premium,start_date,end_date,insurer,policy_number`, [])
    if (pol) bounds.push({ premium_amount: pol.premium != null ? Number(pol.premium) : null, period_from: pol.start_date, period_to: pol.end_date, insurer_name: pol.insurer, policy_number: pol.policy_number, source: 'the policy record' })
  }
  if (!bounds.length) return null
  const issued = { doc_type: doc.doc_type, policy_number: doc.policy_number, insurer_name: doc.insurer_name, period_from: doc.period_from, period_to: doc.period_to, premium_text: doc.premium_text, sum_insured_text: doc.sum_insured_text ?? null }
  const diffs = bounds.flatMap(b => issuedDifferences(issued, b))
  if (!diffs.length) return 0
  const lines = differenceLines(diffs)
  const text = `Check the issued ${String(doc.doc_type).replace(/_/g, ' ')} ${doc.filename ?? ''}: ${lines.join('; ')}`.slice(0, 600)
  await sbTry('company_ledger', null, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: doc.company_id, policy_id: doc.policy_id ?? null, kind: 'note', title: text, occurred_at: new Date().toISOString(), actor: 'policy_reader', links: [] }) })
  const items = await sbTry<Row[]>(`work_items?company_id=eq.${enc(doc.company_id)}&closed_at=is.null${doc.policy_id ? `&policy_id=eq.${enc(doc.policy_id)}` : ''}&select=id,needs_human&order=updated_at.desc&limit=1`, [])
  if (items[0] && !items[0].needs_human) {
    await sbTry(`work_items?id=eq.${enc(items[0].id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ needs_human: text, updated_at: new Date().toISOString() }) })
  }
  return diffs.length
}
