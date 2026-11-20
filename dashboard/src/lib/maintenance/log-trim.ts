/**
 * Daily log trim (20 Nov 2026), run by the admin sweep; code only, no model.
 * - agent_tasks finished (done, failed, skipped) more than 30 days ago:
 *   deleted when the idem_key carries a date (a daily sweep's key such as `renewals:sweep:2026-10-01`,
 *   which nothing enqueues again); otherwise slimmed (payload {"trimmed":true}, result and error
 *   cleared) and kept, because the row's idem_key is what stops the same task (a renewal notice
 *   for a policy, a resolver run for a thread) being queued twice.
 * - error_logs older than 90 days: deleted.
 * - Never touched: gemini_usage_log (spend history), audit_logs, queued, running and needs_human tasks.
 * Tested in src/__tests__/log-trim.test.ts; one-time counts: scripts/trim-logs.ts.
 */
import { SB_URL, sbHeaders } from '@/lib/sb'

export const TASK_DAYS = 30
export const ERROR_DAYS = 90
export const FINISHED = ['done', 'failed', 'skipped'] as const
/** A date in an idem_key: YYYY-MM-DD, optionally with an hour (knowledge keeper's `…:2026-10-01T09`). */
export const DATED_KEY = '[0-9]{4}-[0-9]{2}-[0-9]{2}'

const DAY = 86_400_000
export function cutoffs(now = Date.now()) {
  return { tasks: new Date(now - TASK_DAYS * DAY).toISOString(), errors: new Date(now - ERROR_DAYS * DAY).toISOString() }
}

export interface TaskRow { status: string; idem_key: string; finished_at: string | null; created_at: string; payload?: unknown }
export type TaskAction = 'delete' | 'slim' | 'keep'

/** What the trim does to one task. Mirrors the PostgREST filters below; the tests hold them together. */
export function taskAction(t: TaskRow, now = Date.now()): TaskAction {
  if (!(FINISHED as readonly string[]).includes(t.status)) return 'keep'
  const at = Date.parse(t.finished_at ?? t.created_at)
  if (!(at < Date.parse(cutoffs(now).tasks))) return 'keep'
  if (new RegExp(DATED_KEY).test(t.idem_key)) return 'delete'
  const p = t.payload as { trimmed?: unknown } | null | undefined
  return p && typeof p === 'object' && p.trimmed === true ? 'keep' : 'slim'
}

/** The PostgREST filters, one per write. */
export function trimFilters(now = Date.now()) {
  const c = cutoffs(now)
  const old = `status=in.(${FINISHED.join(',')})&or=(finished_at.lt."${c.tasks}",and(finished_at.is.null,created_at.lt."${c.tasks}"))`
  return {
    deleteTasks: `agent_tasks?${old}&idem_key=match.${DATED_KEY}`,
    slimTasks:   `agent_tasks?${old}&idem_key=not.match.${DATED_KEY}&payload->>trimmed=is.null`,
    deleteErrors: `error_logs?created_at=lt.${c.errors}`,
  }
}

export const SLIMMED = { payload: { trimmed: true }, result: null, error: null }

/** Rows the request touched, from PostgREST's Content-Range (`*\/12`, `0-9/12`). */
export function rangeCount(h: string | null): number {
  const n = Number((h ?? '').split('/')[1])
  return Number.isFinite(n) ? n : 0
}

async function call(path: string, init: RequestInit): Promise<number> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(60_000),
    headers: { ...sbHeaders('return=minimal'), Prefer: 'return=minimal, count=exact', ...(init.headers as Record<string, string> ?? {}) },
  })
  if (!res.ok) throw new Error(`${path.split('?')[0]} ${init.method} failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return rangeCount(res.headers.get('content-range'))
}

/** How many rows each step would touch. Reads counts only. */
export async function trimCounts(now = Date.now()) {
  const f = trimFilters(now)
  const count = (path: string) => call(`${path}&limit=0`, { method: 'GET' })
  const [deleteTasks, slimTasks, deleteErrors] = await Promise.all([count(f.deleteTasks), count(f.slimTasks), count(f.deleteErrors)])
  return { deleteTasks, slimTasks, deleteErrors }
}

/** Runs the trim. Each step is independent; a failed step is reported, the others still run. */
export async function trimLogs(now = Date.now()) {
  const f = trimFilters(now)
  const step = (p: Promise<number>) => p.catch(e => (e instanceof Error ? e.message : 'failed'))
  return {
    tasks_deleted: await step(call(f.deleteTasks, { method: 'DELETE' })),
    tasks_slimmed: await step(call(f.slimTasks, { method: 'PATCH', body: JSON.stringify(SLIMMED) })),
    errors_deleted: await step(call(f.deleteErrors, { method: 'DELETE' })),
  }
}
