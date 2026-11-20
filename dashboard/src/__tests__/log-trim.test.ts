import { describe, it, expect } from 'vitest'
import { taskAction, trimFilters, rangeCount, cutoffs, SLIMMED } from '@/lib/maintenance/log-trim'

const now = Date.UTC(2026, 11, 31)
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

describe('log trim selection', () => {
  it('deletes old finished tasks with a dated key and slims the rest, keeping their key', () => {
    expect(taskAction({ status: 'done', idem_key: 'renewals:sweep:2026-11-01', finished_at: daysAgo(31), created_at: daysAgo(31) }, now)).toBe('delete')
    expect(taskAction({ status: 'failed', idem_key: 'facts:ledger:g1:2026-11-01T09', finished_at: daysAgo(40), created_at: daysAgo(40) }, now)).toBe('delete')
    expect(taskAction({ status: 'skipped', idem_key: 'resolve:thread-1', finished_at: daysAgo(31), created_at: daysAgo(31), payload: { thread_id: 'x' } }, now)).toBe('slim')
    expect(taskAction({ status: 'done', idem_key: 'drafter:renewal_notice:p1:2027-03-31', finished_at: daysAgo(45), created_at: daysAgo(45) }, now)).toBe('delete')
  })

  it('keeps recent, unfinished and already slimmed tasks', () => {
    expect(taskAction({ status: 'done', idem_key: 'chaser:sweep:2026-12-20', finished_at: daysAgo(29), created_at: daysAgo(60) }, now)).toBe('keep')
    for (const status of ['queued', 'running', 'needs_human']) expect(taskAction({ status, idem_key: 'k:2026-01-01', finished_at: null, created_at: daysAgo(300) }, now)).toBe('keep')
    expect(taskAction({ status: 'done', idem_key: 'resolve:t', finished_at: daysAgo(90), created_at: daysAgo(90), payload: { trimmed: true } }, now)).toBe('keep')
  })

  it('falls back to created_at when a finished task has no finished_at', () => {
    expect(taskAction({ status: 'failed', idem_key: 'pinbound:m1', finished_at: null, created_at: daysAgo(31) }, now)).toBe('slim')
  })

  it('builds filters on agent_tasks and error_logs only, with the 30- and 90-day cut-offs', () => {
    const f = trimFilters(now), c = cutoffs(now)
    expect(c.tasks).toBe(daysAgo(30))
    expect(c.errors).toBe(daysAgo(90))
    expect(f.deleteTasks).toBe(`agent_tasks?status=in.(done,failed,skipped)&or=(finished_at.lt."${c.tasks}",and(finished_at.is.null,created_at.lt."${c.tasks}"))&idem_key=match.[0-9]{4}-[0-9]{2}-[0-9]{2}`)
    expect(f.slimTasks).toContain('idem_key=not.match.')
    expect(f.slimTasks).toContain('payload->>trimmed=is.null')
    expect(f.deleteErrors).toBe(`error_logs?created_at=lt.${c.errors}`)
    expect(JSON.stringify(f)).not.toMatch(/audit_logs|gemini_usage_log/)
    expect(SLIMMED).toEqual({ payload: { trimmed: true }, result: null, error: null })
  })

  it('reads the row count from Content-Range', () => {
    expect(rangeCount('*/12')).toBe(12)
    expect(rangeCount('0-9/1200')).toBe(1200)
    expect(rangeCount(null)).toBe(0)
  })
})
