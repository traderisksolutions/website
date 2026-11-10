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

describe('to-do digest', () => {
  it('lists my Send, Decide and To act items with links; counts the unowned; skips Read', () => {
    const d = buildDigest([
      base({ id: 'a', group: 'send', title: 'WICA renewal', client: 'JGC', deadline: '2026-12-31' }),
      base({ id: 'b', group: 'decide', title: 'GE question' }),
      base({ id: 'c', group: 'act', owner_email: null }),
      base({ id: 'd', group: 'read' }),
      base({ id: 'e', group: 'send', owner_email: 'hasya@trade-risksol.com' }),
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
    const d = buildDigest([base({ id: 'a', group: 'act', title: 'a <b> & c' })], me, 'https://x.test', now)!
    expect(d.html).toContain('a &lt;b&gt; &amp; c')
  })
})
