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

/** Drains up to `budgetMs` of work. Returns counts for the cron log. */
export async function drain(opts: { agents?: AgentName[]; budgetMs?: number; batch?: number } = {}) {
  const until = Date.now() + (opts.budgetMs ?? 240_000)
  const agents = opts.agents ?? Array.from(HANDLERS.keys())
  const counts = { done: 0, failed: 0, other: 0 }
  while (Date.now() < until) {
    const tasks = await claim(agents, opts.batch ?? 5)
    if (!tasks.length) break
    for (const t of tasks) {
      const h = HANDLERS.get(t.agent)
      try {
        if (!h) throw new Error(`no handler for ${t.agent}`)
        const r = await h(t)
        if (r === 'handled') counts.other++
        else { await finish(t.id, r ?? {}); counts.done++ }
      } catch (e) {
        await fail(t, e instanceof Error ? e.message : String(e)); counts.failed++
      }
    }
  }
  return counts
}
