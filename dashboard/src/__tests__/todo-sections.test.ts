import { describe, expect, it } from 'vitest'
import { todoOrder, todoSections, ownedBy } from '@/lib/today/todo'
import type { TodayItem } from '@/lib/today/data'

const base = (over: Partial<TodayItem>): TodayItem => ({
  id: 'x', group: 'act', company_id: null, client: 'Acme', case_type: 'renewal', title: 't', status: 'trs_to_act', summary: null, next_action: null,
  needs_human: null, insurer_name: null, policy_number: null, deadline: null, waiting_since: null, last_activity_at: null, owner_email: null,
  later_until: null, later_when: null, draft: null, paired: [], pending: { level: 'green', reason: '', since: null, due: null, override: null },
  side: 'trs', bridge: 'rfq', policy_id: null, stage: null, start_point: null, renewal_flow: null, ...over,
})

describe('todo order', () => {
  it('lapsed first, then the nearest deadline, then the longest wait', () => {
    const red = base({ id: 'red', pending: { level: 'red', reason: 'lapsed', since: null, due: null, override: null } })
    const soon = base({ id: 'soon', deadline: '2026-11-11' })
    const later = base({ id: 'later', deadline: '2026-12-31' })
    const old = base({ id: 'old', waiting_since: '2026-10-01' })
    const newer = base({ id: 'newer', waiting_since: '2026-11-01' })
    expect([newer, later, old, soon, red].sort(todoOrder).map(i => i.id)).toEqual(['red', 'soon', 'later', 'old', 'newer'])
  })
})

describe('todo sections', () => {
  const me = 'nathan.budiutomo@trade-risksol.com'
  const items = [
    base({ id: 'a', group: 'send', owner_email: me }),
    base({ id: 'b', group: 'send', owner_email: 'hasya@trade-risksol.com' }),
    base({ id: 'c', group: 'act', owner_email: null }),
    base({ id: 'd', group: 'decide', owner_email: 'Nathan.Budiutomo@trade-risksol.com' }),
    base({ id: 'e', group: 'later', owner_email: me }),
    base({ id: 'f', group: 'read', owner_email: me }),
  ]
  it('"mine" keeps my items and the unowned; "later" never shows', () => {
    const s = todoSections(items, 'mine', me)
    expect(s.send.map(i => i.id)).toEqual(['a'])
    expect(s.act.map(i => i.id)).toEqual(['c'])
    expect(s.decide.map(i => i.id)).toEqual(['d'])
    expect(s.read.map(i => i.id)).toEqual(['f'])
  })
  it('"all" keeps everyone’s', () => {
    expect(todoSections(items, 'all', me).send.map(i => i.id)).toEqual(['a', 'b'])
  })
  it('an unowned item is everyone’s', () => {
    expect(ownedBy({ owner_email: null }, 'anyone@trade-risksol.com')).toBe(true)
    expect(ownedBy({ owner_email: 'a@trade-risksol.com' }, null)).toBe(false)
  })
})
