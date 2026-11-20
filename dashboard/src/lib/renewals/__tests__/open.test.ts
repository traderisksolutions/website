import { describe, expect, it } from 'vitest'
import { dueToOpen, hasSuccessor, renewable, type OpenPolicy } from '../open'

const pol = (o: Partial<OpenPolicy> & { id: string }): OpenPolicy => ({ company_id: 'c1', class_of_insurance: 'Public Liability', policy_number: 'PL-1', end_date: '2027-02-28', lifecycle: 'live', ...o })
const today = '2026-11-20'

describe('renewable', () => {
  it('takes bound and live client policies only', () => {
    expect(renewable(pol({ id: 'a' }))).toBe(true)
    expect(renewable(pol({ id: 'a', lifecycle: 'quoting' }))).toBe(false)
    expect(renewable(pol({ id: 'a', company_id: null }))).toBe(false)
    expect(renewable(pol({ id: 'a', companies: { kind: 'insurer' } }))).toBe(false)
    expect(renewable(pol({ id: 'a', class_of_insurance: 'Work Injury Compensation Endorsement' }))).toBe(false)
  })
})

describe('dueToOpen', () => {
  it('opens a general policy from 120 days and Employment Benefits from 180', () => {
    const general = pol({ id: 'g', end_date: '2027-03-20' })  // opens 2026-11-20
    const later = pol({ id: 'l', end_date: '2027-03-21' })     // opens 2026-11-21
    const eb = pol({ id: 'e', class_of_insurance: 'Employee Benefits', end_date: '2027-05-19' }) // opens 2026-11-20
    expect(dueToOpen([general, later, eb], new Set(), today).map(p => p.id)).toEqual(['g', 'e'])
  })
  it('skips a policy that has a record, ended over 30 days ago, has no end date, or already has its next term', () => {
    const had = pol({ id: 'h' })
    const old = pol({ id: 'o', end_date: '2026-10-20' })
    const recent = pol({ id: 'r', end_date: '2026-10-21' })
    const undated = pol({ id: 'u', end_date: null })
    const done = pol({ id: 'd', class_of_insurance: 'Motor', end_date: '2026-12-31' })
    const next = pol({ id: 'n', class_of_insurance: 'motor', start_date: '2027-01-01', end_date: '2027-12-31', lifecycle: 'quoting' })
    expect(dueToOpen([had, old, recent, undated, done, next], new Set(['h']), today).map(p => p.id)).toEqual(['r'])
    expect(hasSuccessor(done, [done, next])).toBe(true)
  })
  it('opens nothing twice', () => {
    const p = pol({ id: 'a' })
    const first = dueToOpen([p], new Set(), today)
    expect(dueToOpen([p], new Set(first.map(x => x.id)), today)).toEqual([])
  })
})
