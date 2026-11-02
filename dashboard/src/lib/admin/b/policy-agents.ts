/**
 * The endorsement loop as queue-driven agents. One job each; hand-offs through agent_tasks.
 *
 *   eb_movements / inbound_mail    one message on a live policy: the client's change request →
 *                                  movements in the open batch; the insurer's note → transaction,
 *                                  check, TRS note (src/lib/admin/b/endorsements).
 *   eb_movements / close_batches   the batches whose window ended → one Today item each.
 *   eb_movements / close_batch     one batch, now (a person asked).
 *   eb_movements / sync            approved batches → sent; paid notes → settled.
 *   (chases run from the one chaser sweep, src/lib/admin/b/sweeps.ts)
 *   eb_movements / bill            a person accepted an insurer figure → the TRS note.
 *   endorsements / attach          an endorsement policy row → its master policy, by base number
 *                                  then by term and class. No match is a question for a person.
 */
import { sbTry, enc } from '@/lib/crm/db'
import { askHuman, skip, type AgentTask } from '@/lib/agent-tasks/queue'
import { handlePolicyInbound } from '@/lib/policies/inbound'
import { findMasterPolicy, looksLikeEndorsement } from '@/lib/policies/endorsement'
import { closeDueBatches, closeBatchNow } from './endorsements/batches'
import { syncSent, syncSettled, syncNotesSent } from './endorsements/sync'
import { billTransaction } from './endorsements/notes'

type Row = Record<string, any>

export async function handleEbMovements(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  switch (task.kind) {
    case 'inbound_mail': {
      const messageId = (task.message_id ?? task.payload?.message_id) as string | undefined
      if (!messageId) { await skip(task.id, 'no message'); return 'handled' }
      const [m] = await sbTry<Row[]>(`email_messages?id=eq.${enc(messageId)}&select=id,thread_id,direction,email_threads(gmail_thread_id)&limit=1`, [])
      if (!m) { await skip(task.id, 'message gone'); return 'handled' }
      const r = await handlePolicyInbound({ message_id: m.id, thread_id: m.thread_id, gmail_thread_id: m.email_threads?.gmail_thread_id ?? null, direction: m.direction === 'outbound' ? 'outbound' : 'inbound' }, { direct: true })
      return { result: r as unknown as Record<string, unknown> }
    }
    case 'close_batches': return closeDueBatches()
    case 'close_batch': {
      const id = (task.payload?.batch_id ?? null) as string | null
      if (!id) { await skip(task.id, 'no batch'); return 'handled' }
      const r = await closeBatchNow(id)
      if (r.question) { await askHuman(task.id, r.question, { work_item_id: r.workItemId }); return 'handled' }
      return r as Record<string, unknown>
    }
    case 'sync': return { sent: await syncSent(), notes_filed: await syncNotesSent(), settled: await syncSettled() }
    case 'bill': {
      const id = (task.payload?.transaction_id ?? null) as string | null
      if (!id) { await skip(task.id, 'no transaction'); return 'handled' }
      return billTransaction(id, { workItemId: task.work_item_id ?? null })
    }
    default:
      await skip(task.id, `unknown kind ${task.kind}`); return 'handled'
  }
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

/** The tasks the daily sweep starts for the loop. Keys carry the day, so a second run the same day is a no-op. */
export function endorsementSweepTasks(today: string) {
  return [
    { agent: 'eb_movements' as const, kind: 'sync', idem_key: `eb:sync:${today}`, created_by_agent: 'system' as const, payload: { today } },
    { agent: 'eb_movements' as const, kind: 'close_batches', idem_key: `eb:close:${today}`, created_by_agent: 'system' as const, payload: { today } },
  ]
}
