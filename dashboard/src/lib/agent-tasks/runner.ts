/**
 * Runs queued tasks. Each agent registers one handler; the runner never decides what a task
 * means. A handler returns normally (done), calls askHuman/skip itself, or throws (retry).
 */
import { claim, finish, fail, type AgentName, type AgentTask } from './queue'

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
 * drops out of the rotation. Returns counts for the cron log.
 */
export async function drain(opts: { agents?: AgentName[]; budgetMs?: number; batch?: number } = {}) {
  const until = Date.now() + (opts.budgetMs ?? 240_000)
  let active = opts.agents ?? Array.from(HANDLERS.keys())
  const perAgent = Math.max(1, Math.min(opts.batch ?? 2, 5))
  const counts = { done: 0, failed: 0, other: 0 }
  while (active.length && Date.now() < until) {
    const next: AgentName[] = []
    for (const agent of active) {
      if (Date.now() >= until) { next.push(agent); continue }
      const tasks = await claim([agent], perAgent)
      if (!tasks.length) continue
      next.push(agent)
      for (const t of tasks) {
        const r = await runOne(t)
        counts[r]++
      }
    }
    active = next
  }
  return counts
}
