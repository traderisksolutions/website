/**
 * Runs queued tasks. Each agent registers one handler; the runner never decides what a task
 * means. A handler returns normally (done), calls askHuman/skip itself, or throws (retry).
 */
import { claim, finish, fail, type AgentName, type AgentTask } from './queue'
import { alertHeld, modelState, splitAgents } from './model-guard'

export type Handler = (task: AgentTask) => Promise<Record<string, unknown> | void | 'handled'>

const HANDLERS = new Map<AgentName, Handler>()

export function register(agent: AgentName, handler: Handler) { HANDLERS.set(agent, handler) }

/** Runs one task already chosen by the caller (a supervised run on named messages). */
export async function runOne(t: AgentTask): Promise<'done' | 'other' | 'failed'> {
  const h = HANDLERS.get(t.agent)
  try {
    if (!h) throw new Error(`no handler for ${t.agent}`)
    const r = await h(t)
    if (r === 'handled') return 'other'
    await finish(t.id, r ?? {}); return 'done'
  } catch (e) { await fail(t, e instanceof Error ? e.message : String(e)); return 'failed' }
}

/**
 * Drains up to `budgetMs` of work, a few tasks from each agent in turn. Oldest-first across all
 * agents let one backlog hold the queue: on 4 Nov 2026, 2,116 document-clerk tasks from 1 Nov
 * would have kept 157 endorsement emails waiting about three hours. An agent with nothing queued
 * drops out of the rotation. Each drain starts at a different agent: a read can take a minute, so
 * one that always started at intake ran out of time before relay, which waited from 3 Nov 2026.
 * Returns counts, the agents held for the model, and the model state.
 */
const DRAIN_EVERY_MS = 10 * 60_000
const WORKERS = 5

/** Pure. The rotation with `turn` agents moved from the front to the back. */
export function rotateAgents<T>(agents: T[], turn: number): T[] {
  if (agents.length === 0) return agents
  const at = turn % agents.length
  return [...agents.slice(at), ...agents.slice(0, at)]
}

export async function drain(opts: { agents?: AgentName[]; budgetMs?: number; batch?: number } = {}) {
  const until = Date.now() + (opts.budgetMs ?? 240_000)
  // The credit guard (model-guard.ts): with no model, the agents that read with it wait in the queue.
  const model = await modelState()
  const { run, held } = splitAgents(opts.agents ?? Array.from(HANDLERS.keys()), model.ok)
  if (held.length) await alertHeld(held, model.reason)
  const active = rotateAgents(run, Math.floor(Date.now() / DRAIN_EVERY_MS))
  const perAgent = Math.max(1, Math.min(opts.batch ?? 2, 5))
  const counts = { done: 0, failed: 0, other: 0, held, model: model.ok ? 'ok' : (model.reason ?? 'unavailable') }
  // A pool, so a slow agent holds one worker and the rest keep moving: a case read can take minutes,
  // and waiting for it held the filing and relay work to about 50 tasks an hour on 6 Nov 2026.
  const turnOrder = [...active]
  const worker = async () => {
    while (Date.now() < until) {
      const agent = turnOrder.shift()
      if (!agent) return
      const tasks = await claim([agent], perAgent)
      if (!tasks.length) continue
      for (const t of tasks) {
        const r = await runOne(t)
        counts[r === 'done' ? 'done' : r === 'failed' ? 'failed' : 'other']++
      }
      turnOrder.push(agent)
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker))
  return counts
}
