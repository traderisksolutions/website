import { describe, expect, it } from 'vitest'
import { buildDigest, morningCutoff } from '@/lib/today/digest'
import type { TodayItem } from '@/lib/today/data'

const me = 'nathan.budiutomo@trade-risksol.com'
const base = (over: Partial<TodayItem>): TodayItem => ({
  id: 'x', group: 'act', company_id: null, client: 'Acme', case_type: 'renewal', title: 't', status: 'trs_to_act', summary: null, next_action: null,
  needs_human: null, insurer_name: null, policy_number: null, deadline: null, waiting_since: null, last_activity_at: null, owner_email: me,
  later_until: null, later_when: null, draft: null, paired: [], pending: { level: 'green', reason: '', since: null, due: null, override: null },
  side: 'trs', bridge: 'rfq', policy_id: null, stage: null, start_point: null, renewal_flow: null, ...over,
})
const now = new Date('2026-11-10T05:00:00Z')   // Tue 10 Nov 13:00 SGT
const recent = '2026-11-09T02:00:00Z'

describe('to-do digest', () => {
  it('lists my Send, Decide and To act items with links; counts the unowned; skips Read', () => {
    const d = buildDigest([
      base({ id: 'a', group: 'send', title: 'WICA renewal', client: 'JGC', deadline: '2026-12-31', last_activity_at: recent }),
      base({ id: 'b', group: 'decide', title: 'GE question', last_activity_at: recent }),
      base({ id: 'c', group: 'act', owner_email: null, last_activity_at: recent }),
      base({ id: 'd', group: 'read', last_activity_at: recent }),
      base({ id: 'e', group: 'send', owner_email: 'hasya@trade-risksol.com', last_activity_at: recent }),
    ], me, 'https://x.test', now)!
    expect(d.count).toBe(2)
    expect(d.subject).toBe('To do · 2 items · Tue 10 Nov')
    expect(d.html).toContain('https://x.test/today/a')
    expect(d.html).toContain('JGC — WICA renewal')
    expect(d.html).toContain('due 31 Dec')
    expect(d.html).not.toContain('/today/d')
    expect(d.html).not.toContain('/today/e')
    expect(d.html).toContain('1 unassigned item')
  })
  it('nothing to do → no email', () => {
    expect(buildDigest([base({ group: 'read' })], me, 'https://x.test', now)).toBeNull()
  })
  it('an old item with no deadline in sight is counted, not listed; a near deadline or a lapse keeps it', () => {
    const d = buildDigest([
      base({ id: 'old', group: 'act', last_activity_at: '2026-09-01T00:00:00Z' }),
      base({ id: 'due', group: 'act', last_activity_at: '2026-09-01T00:00:00Z', deadline: '2026-11-20' }),
      base({ id: 'red', group: 'act', last_activity_at: '2026-09-01T00:00:00Z', pending: { level: 'red', reason: 'cover lapsed', since: null, due: null, override: null } }),
      base({ id: 'fresh', group: 'send', last_activity_at: recent }),
    ], me, 'https://x.test', now)!
    expect(d.count).toBe(3)
    expect(d.html).not.toContain('/today/old')
    expect(d.html).toContain('/today/due')
    expect(d.html).toContain('/today/red')
    expect(d.html).toContain('1 older item with no deadline in the next 14 days')
  })
  it('the afternoon digest keeps only what moved since 08:30 SGT', () => {
    expect(morningCutoff(now).toISOString()).toBe('2026-11-10T00:30:00.000Z')
    const d = buildDigest([
      base({ id: 'old', group: 'send', last_activity_at: '2026-11-09T10:00:00Z' }),
      base({ id: 'new', group: 'send', last_activity_at: '2026-11-10T03:00:00Z' }),
    ], me, 'https://x.test', now, true)!
    expect(d.count).toBe(1)
    expect(d.subject).toMatch(/^New since this morning · 1 item/)
    expect(d.html).toContain('/today/new')
    expect(d.html).not.toContain('/today/old')
  })
  it('escapes what the model wrote', () => {
    const d = buildDigest([base({ id: 'a', group: 'act', title: 'a <b> & c', last_activity_at: recent })], me, 'https://x.test', now)!
    expect(d.html).toContain('a &lt;b&gt; &amp; c')
  })
})
