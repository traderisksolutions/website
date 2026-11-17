import { describe, expect, it } from 'vitest'
import type { Member } from '@/lib/gb-quote'
import { censusCategories, lastYearNet, lowerTier, seniority, startDesign, tiersFromFacts, tiersFromPlan, todayFromLastYear } from '@/lib/gb/eb-quote'
import type { CategoryFacts, LastYear } from '@/lib/gb/last-year'

const m = (category: string, relationship: string, plan?: string): Member => ({ name: 'x', category, relationship: relationship as Member['relationship'], dob: '1985-01-01', plans: plan ? { GHS: plan } : null })

describe('lowerTier', () => {
  it('steps one tier down', () => { expect(lowerTier('hs', 4)).toBe(3); expect(lowerTier('gp', 2)).toBe(1) })
  it('never drops a cover held today to None', () => { expect(lowerTier('pa', 1)).toBe(1); expect(lowerTier('gd', 1)).toBe(1); expect(lowerTier('mm', 2)).toBe(1) })
  it('keeps a cover not held at None, and the lowest hospital tier where it is', () => { expect(lowerTier('mm', 0)).toBe(0); expect(lowerTier('hs', 0)).toBe(0) })
})

describe('tiersFromPlan', () => {
  it('reads ward and hospital type from the census plan name', () => {
    expect(tiersFromPlan('Plan 1 (PTE 1-bed)')).toEqual({ hs: 4 })
    expect(tiersFromPlan('Plan 5 (GRH 1-bed)')).toEqual({ hs: 1 })
    expect(tiersFromPlan('GRH 4-bed')).toEqual({ hs: 0 })
    expect(tiersFromPlan('Private 2-bed')).toEqual({ hs: 3 })
  })
  it('says nothing about a plain plan number', () => { expect(tiersFromPlan('4')).toEqual({}); expect(tiersFromPlan(null)).toEqual({}) })
})

describe('censusCategories', () => {
  const members = [
    m('Staff', 'self', 'Plan 3 (PTE 4-bed)'), m('Staff', 'self', 'Plan 3 (PTE 4-bed)'), m('Staff', 'spouse'), m('Staff', 'child'), m('Staff', 'child'),
    m('Directors', 'self', 'Plan 1 (PTE 1-bed)'), m('Directors', 'wife'),
    m('Manager', 'self'),
  ]
  const cats = censusCategories(members)
  it('orders the most senior first', () => expect(cats.map(c => c.name)).toEqual(['Directors', 'Manager', 'Staff']))
  it('counts employees apart from spouses and children', () => {
    const staff = cats.find(c => c.name === 'Staff')!
    expect([staff.employees, staff.spouses, staff.children, staff.lives]).toEqual([2, 1, 2, 5])
  })
  it('reads today from the plan most employees hold', () => {
    expect(cats.find(c => c.name === 'Directors')!.today).toEqual({ hs: 4 })
    expect(cats.find(c => c.name === 'Manager')!.today).toEqual({})
  })
})

describe('seniority and the starting design', () => {
  it('ranks directors, managers, staff, then foreign workers', () => {
    expect(['Rank & File', 'SP/WP', 'Directors', 'Senior Mgt'].sort((a, b) => seniority(a) - seniority(b))).toEqual(['Directors', 'Senior Mgt', 'Rank & File', 'SP/WP'])
  })
  it('opens one tier below today where today is known', () => {
    expect(startDesign({ hs: 4 }).hs).toBe(3)
    expect(startDesign({}).hs).toBe(2)
  })
})

describe('last year\'s policy as today', () => {
  const facts = (f: Partial<CategoryFacts>): CategoryFacts => ({ hospital: null, beds: null, limitKind: null, limit: null, coins: null, gmm: null, gpCopay: null, spLimit: null, dentalLimit: null, life: null, pa: null, ...f })
  it('takes the nearest tier per cover, and None where the policy has no such cover', () => {
    expect(tiersFromFacts(facts({ hospital: 'private', beds: 2, limitKind: 'per_disability', limit: 20_000, gpCopay: 10, spLimit: 1_000 }), { GHS: 'Plan 2', GOPC: 'Plan 1', GOSC: 'Plan 1' }))
      .toEqual({ hs: 3, gp: 1, sp: 2, mm: 0, gd: 0, pa: 0 })
    expect(tiersFromFacts(facts({ hospital: 'private', beds: 1, limitKind: 'annual', limit: 150_000 }), { GHS: 'A' }).hs).toBe(5)
  })
  it('lays one policy category over every census category, or matches by name', () => {
    const ly = { categories: [{ name: 'Managers', lives: 4, plans: { GHS: '1' }, facts: facts({ hospital: 'private', beds: 1, limit: 25_000, limitKind: 'per_disability' }) }, { name: 'Staff', lives: 9, plans: { GHS: '3' }, facts: facts({ hospital: 'private', beds: 4, limit: 15_000, limitKind: 'per_disability' }) }] } as unknown as LastYear
    const t = todayFromLastYear(ly, ['Management', 'Staff', 'Drivers'])
    expect(t.Management.hs).toBe(4); expect(t.Staff.hs).toBe(2); expect(t.Drivers).toBeUndefined()
  })
  it('takes GST off a gross total', () => {
    expect(lastYearNet({ total: 10_900, gst: 'included', premiumByCover: {} } as unknown as LastYear)).toBe(10_000)
    expect(lastYearNet(null)).toBeNull()
  })
})
