/**
 * The hand-off queue. Every agent does one job; when its job creates work for another agent it
 * enqueues a task here instead of calling that agent. A task carries an idem_key, so the same
 * email or sweep can enqueue twice and the work happens once.
 *
 * Statuses: queued → running → done | failed (after max_attempts) | needs_human | skipped.
 * needs_human rows are the dashboard's review list; nothing an agent does sends mail.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'

export const AGENT_NAMES = [
  'intake', 'resolver', 'document_clerk', 'policy_reader', 'knowledge_keeper', 'knowledge_depositor',
  'claims', 'endorsements', 'eb_movements', 'renewals', 'placement', 'billing',
  'recipient_router', 'drafter', 'chaser',
] as const
export type AgentName = typeof AGENT_NAMES[number]
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'needs_human' | 'skipped'

export type AgentTask = {
  id: string; agent: AgentName; kind: string
  company_id: string | null; policy_id: string | null; work_item_id: string | null
  thread_id: string | null; message_id: string | null
  payload: Record<string, any>; result: Record<string, any> | null
  status: TaskStatus; attempts: number; max_attempts: number
  run_after: string; error: string | null; idem_key: string; created_by_agent: string
  created_at: string; finished_at: string | null
}

export type NewTask = {
  agent: AgentName; kind: string; idem_key: string; created_by_agent: AgentName | 'system' | 'staff'
  company_id?: string | null; policy_id?: string | null; work_item_id?: string | null
  thread_id?: string | null; message_id?: string | null
  payload?: Record<string, unknown>; run_after?: string; max_attempts?: number
}

/** Enqueues tasks; a task whose idem_key already exists is left as it is. */
export async function enqueue(tasks: NewTask | NewTask[]): Promise<void> {
  const rows = (Array.isArray(tasks) ? tasks : [tasks]).map(t => ({ payload: {}, ...t }))
  if (!rows.length) return
  await sb('agent_tasks?on_conflict=idem_key', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows),
  })
}

export async function claim(agents: AgentName[] | null, limit = 10): Promise<AgentTask[]> {
  return sb<AgentTask[]>('rpc/claim_agent_tasks', { method: 'POST', body: JSON.stringify({ p_agents: agents, p_limit: limit }) })
}

async function patch(id: string, row: Record<string, unknown>) {
  await sb(`agent_tasks?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) })
}

export const finish = (id: string, result: Record<string, unknown> = {}) =>
  patch(id, { status: 'done', result, error: null, finished_at: new Date().toISOString() })

export const skip = (id: string, reason: string) =>
  patch(id, { status: 'skipped', result: { reason }, finished_at: new Date().toISOString() })

/** A decision the agent must not make. `question` is what a person decides, in one line. */
export const askHuman = (id: string, question: string, result: Record<string, unknown> = {}) =>
  patch(id, { status: 'needs_human', result: { question, ...result }, finished_at: new Date().toISOString() })

/** Retries with backoff (2, 8, 32 min) until max_attempts, then fails for good. */
export async function fail(task: AgentTask, error: string) {
  const last = task.attempts >= task.max_attempts
  await patch(task.id, last
    ? { status: 'failed', error: error.slice(0, 2000), finished_at: new Date().toISOString() }
    : { status: 'queued', error: error.slice(0, 2000), locked_at: null, run_after: new Date(Date.now() + 2 * 4 ** (task.attempts - 1) * 60_000).toISOString() })
}

/** A person settles a needs_human task: done with their answer, or re-queued with it in payload. */
export async function resolveHuman(id: string, by: string, answer: Record<string, unknown>, requeue: boolean) {
  const [t] = await sbTry<AgentTask[]>(`agent_tasks?id=eq.${enc(id)}&select=*`, [])
  if (!t) throw new Error('task not found')
  await patch(id, requeue
    ? { status: 'queued', payload: { ...t.payload, human: { by, ...answer } }, run_after: new Date().toISOString(), locked_at: null, attempts: 0, finished_at: null }
    : { status: 'done', result: { ...(t.result ?? {}), human: { by, ...answer } }, finished_at: new Date().toISOString() })
}
