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
  return { facts: facts.length }
}
