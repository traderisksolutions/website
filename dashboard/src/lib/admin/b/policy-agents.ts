/**
 * Endorsements and EB movements as queue-driven agents. Both wrap code that already runs; the
 * wrapping changes when it runs (on a task), not what it does.
 *
 *   eb_movements / inbound_mail   handlePolicyInbound on one message: client movement mail →
 *                                 movements + a draft to the insurer; insurer DN/CN → transactions.
 *   endorsements / attach         an endorsement policy row → its master policy, by base number
 *                                 then by term and class. No match is a question for a person.
 */
import { sbTry, enc } from '@/lib/crm/db'
import { askHuman, skip, type AgentTask } from '@/lib/agent-tasks/queue'
import { handlePolicyInbound } from '@/lib/policies/inbound'
import { findMasterPolicy, looksLikeEndorsement } from '@/lib/policies/endorsement'

type Row = Record<string, any>

export async function handleEbMovements(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  if (task.kind !== 'inbound_mail') { await skip(task.id, `unknown kind ${task.kind}`); return 'handled' }
  const messageId = (task.message_id ?? task.payload?.message_id) as string | undefined
  if (!messageId) { await skip(task.id, 'no message'); return 'handled' }
  const [m] = await sbTry<Row[]>(`email_messages?id=eq.${enc(messageId)}&select=id,thread_id,direction,email_threads(gmail_thread_id)&limit=1`, [])
  if (!m) { await skip(task.id, 'message gone'); return 'handled' }
  const r = await handlePolicyInbound({ message_id: m.id, thread_id: m.thread_id, gmail_thread_id: m.email_threads?.gmail_thread_id ?? null, direction: m.direction === 'outbound' ? 'outbound' : 'inbound' })
  return { result: r as unknown as Record<string, unknown> }
}

export async function handleEndorsements(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  if (task.kind !== 'attach') { await skip(task.id, `unknown kind ${task.kind}`); return 'handled' }
  const policyId = task.policy_id ?? task.payload?.policy_id
  if (!policyId) { await skip(task.id, 'no policy'); return 'handled' }
  const [p] = await sbTry<Row[]>(`policies?id=eq.${enc(policyId)}&select=id,company_id,policy_number,class_of_insurance,description,start_date,end_date&limit=1`, [])
  if (!p) { await skip(task.id, 'policy gone'); return 'handled' }
  if (!looksLikeEndorsement(p)) { await skip(task.id, 'not an endorsement'); return 'handled' }
  const siblings = p.company_id ? await sbTry<Row[]>(`policies?company_id=eq.${enc(p.company_id)}&id=neq.${enc(p.id)}&select=id,policy_number,class_of_insurance,description,start_date,end_date`, []) : []
  const master = findMasterPolicy(p, siblings.filter(s => !looksLikeEndorsement(s)))
  if (!master) {
    await askHuman(task.id, `Which policy does endorsement ${p.policy_number ?? p.id} amend?`, { policy_id: p.id })
    return 'handled'
  }
  return { policy_id: p.id, master_policy_id: master.id, master_policy_number: master.policy_number }
}
