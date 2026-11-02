/**
 * The renewals agent's two timed jobs beyond opening the case:
 *   advice     60 days out: the renewal report and its email on the case, for approval on Today;
 *              without a premium and period on file, the case asks a person instead.
 *   rfq_check  30 days out: no quote on file for this renewal → the case's next action says to
 *              ask the insurer for terms, and the chaser carries it from there.
 * Idempotency keys carry the policy and expiry, so a sweep run twice makes one report.
 */
import { sbTry, enc } from '@/lib/crm/db'
import { skip, type AgentTask, type NewTask } from '@/lib/agent-tasks/queue'
import { draftRenewalAdvice } from '@/lib/policies/ledger/advice'
import { addDays } from '@/lib/policies/ledger/report-model'
import { itemEvent } from '../data'

type Row = Record<string, any>
export const ADVICE_DAYS = 60
export const RFQ_DAYS = 30

export function adviceTask(policyId: string, companyId: string | null, endDate: string): NewTask {
  return { agent: 'renewals', kind: 'advice', policy_id: policyId, company_id: companyId, payload: { policy_id: policyId, expiry: endDate }, idem_key: `renewals:advice:${policyId}:${endDate}`, created_by_agent: 'renewals' }
}

export function rfqCheckTask(policyId: string, companyId: string | null, endDate: string): NewTask {
  return { agent: 'renewals', kind: 'rfq_check', policy_id: policyId, company_id: companyId, payload: { policy_id: policyId, expiry: endDate }, idem_key: `renewals:rfq_check:${policyId}:${endDate}`, created_by_agent: 'renewals' }
}

/** A quote counts for this renewal when it names the policy, or the client and line, inside the 90 days before expiry. */
export async function quotesOnFile(p: { id: string; company_id: string | null; policy_number: string | null; product_line: string | null; end_date: string }): Promise<number> {
  const since = addDays(p.end_date, -90)
  const byNumber = p.policy_number ? await sbTry<Row[]>(`placement_quotes?policy_number=eq.${enc(p.policy_number)}&created_at=gte.${since}&select=id&limit=50`, []) : []
  if (byNumber.length) return byNumber.length
  if (!p.company_id || !p.product_line) return 0
  return (await sbTry<Row[]>(`placement_quotes?company_id=eq.${enc(p.company_id)}&product_line=eq.${enc(p.product_line)}&created_at=gte.${since}&select=id&limit=50`, [])).length
}

export async function handleAdvice(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  const policyId = (task.payload?.policy_id ?? task.policy_id) as string | undefined
  if (!policyId) { await skip(task.id, 'no policy'); return 'handled' }
  const r = await draftRenewalAdvice(policyId, 'renewals')
  return { work_item_id: r.work_item_id, draft_id: r.draft_id, to: r.to, skipped: r.reason ?? null }
}

export async function handleRfqCheck(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  const policyId = (task.payload?.policy_id ?? task.policy_id) as string | undefined
  if (!policyId) { await skip(task.id, 'no policy'); return 'handled' }
  const [p] = await sbTry<Row[]>(`policies?id=eq.${enc(policyId)}&select=id,company_id,policy_number,product_line,end_date,insurer&limit=1`, [])
  if (!p?.end_date) { await skip(task.id, 'policy has no expiry'); return 'handled' }
  const quotes = await quotesOnFile(p as Parameters<typeof quotesOnFile>[0])
  if (quotes > 0) return { quotes, requested: false }
  const [item] = await sbTry<Row[]>(`work_items?policy_id=eq.${enc(policyId)}&case_type=eq.renewal&closed_at=is.null&select=id&limit=1`, [])
  if (item) {
    await sbTry(`work_items?id=eq.${enc(item.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'trs_to_act', next_action: `Ask ${p.insurer ?? 'the insurer'} for renewal terms: no quote on file ${RFQ_DAYS} days before expiry`, updated_at: new Date().toISOString() }) })
    await itemEvent(item.id, 'note', 'renewals', { kind: 'renewal_rfq', requested: true, days_to_expiry: RFQ_DAYS })
  }
  return { quotes: 0, requested: true }
}
