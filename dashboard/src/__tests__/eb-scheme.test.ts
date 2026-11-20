import { describe, expect, it } from 'vitest'
import { censusChanges, censusChecks, planYearFor, previousPlanYear } from '@/lib/gb/scheme'
import type { Member } from '@/lib/gb-quote'

const m = (name: string, relationship: string, dob: string | null, category = 'Staff'): Member => ({ name, relationship, dob, category })

describe('scheme file', () => {
  it('plan year from the start date, and the one before', () => {
    expect(planYearFor('2027-01-01')).toBe('2027–28')
    expect(previousPlanYear('2027–28')).toBe('2026–27')
    expect(previousPlanYear('nonsense')).toBeNull()
  })

  it('checks a census by code', () => {
    const census = [
      m('Tan Ah Kow', 'self', '1980-05-01'), m('Tan Ah Kow', 'self', '1980-05-01'),
      m('Lim Bee', 'self', null), m('Old Man', 'self', '1955-01-01'), m('Young One', 'self', '2012-01-01'),
      m('Kid A', 'child', '2006-03-01'), m('Kid B', 'child', '1999-01-01'), m('Kid C', 'child', '2015-01-01'),
      m('Cousin', 'cousin', '1990-01-01'),
    ]
    const by = Object.fromEntries(censusChecks(census, '2027-01-01').map(c => [c.key, c.names]))
    expect(by.duplicate).toEqual(['Tan Ah Kow'])
    expect(by.no_age).toEqual(['Lim Bee'])
    expect(by.employee_70).toEqual(['Old Man'])
    expect(by.employee_u16).toEqual(['Young One'])
    expect(by.child_19_25).toEqual(['Kid A'])
    expect(by.child_over_25).toEqual(['Kid B'])
    expect(by.relationship).toEqual(['Cousin'])
    expect(Object.values(by).flat()).not.toContain('Kid C')
  })

  it('a stated age stands in for a date of birth', () => {
    expect(censusChecks([{ name: 'A', relationship: 'self', age: 40, category: 'Staff' }], '2027-01-01')).toEqual([])
  })

  it('changes from last year: joiners, leavers, category moves; spelling and spacing do not count', () => {
    const before = [m('Tan Ah Kow', 'self', '1980-05-01'), m('Lim Bee', 'self', '1985-02-02'), m('Ong', 'self', '1990-01-01', 'Staff')]
    const now = [m('TAN  AH-KOW', 'self', '1980-05-01'), m('Ong', 'self', '1990-01-01', 'Manager'), m('New Hire', 'self', '1999-09-09')]
    const c = censusChanges(before, now)
    expect(c.joiners).toEqual(['New Hire'])
    expect(c.leavers).toEqual(['Lim Bee'])
    expect(c.moved).toEqual(['Ong: Staff → Manager'])
    expect([c.previous, c.now]).toEqual([3, 3])
  })
})
