import { describe, expect, it } from 'vitest'
import type { Member } from '@/lib/gb-quote'
import { censusCategories, lowerTier, seniority, startDesign, tiersFromPlan } from '@/lib/gb/eb-quote'

const m = (category: string, relationship: string, plan?: string): Member => ({ name: 'x', category, relationship: relationship as Member['relationship'], dob: '1985-01-01', plans: plan ? { GHS: plan } : null })

describe('lowerTier', () => {
  it('steps one tier down', () => { expect(lowerTier('hs', 3)).toBe(2); expect(lowerTier('gp', 2)).toBe(1) })
  it('never drops a cover held today to None', () => { expect(lowerTier('pa', 1)).toBe(1); expect(lowerTier('gd', 1)).toBe(1); expect(lowerTier('mm', 2)).toBe(1) })
  it('keeps a cover not held at None, and the lowest hospital tier where it is', () => { expect(lowerTier('mm', 0)).toBe(0); expect(lowerTier('hs', 0)).toBe(0) })
})

describe('tiersFromPlan', () => {
  it('reads ward and hospital type from the census plan name', () => {
    expect(tiersFromPlan('Plan 1 (PTE 1-bed)')).toEqual({ hs: 3 })
    expect(tiersFromPlan('Plan 5 (GRH 1-bed)')).toEqual({ hs: 0 })
    expect(tiersFromPlan('Private 2-bed')).toEqual({ hs: 2 })
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
    expect(cats.find(c => c.name === 'Directors')!.today).toEqual({ hs: 3 })
    expect(cats.find(c => c.name === 'Manager')!.today).toEqual({})
  })
})

describe('seniority and the starting design', () => {
  it('ranks directors, managers, staff, then foreign workers', () => {
    expect(['Rank & File', 'SP/WP', 'Directors', 'Senior Mgt'].sort((a, b) => seniority(a) - seniority(b))).toEqual(['Directors', 'Senior Mgt', 'Rank & File', 'SP/WP'])
  })
  it('opens one tier below today where today is known', () => {
    expect(startDesign({ hs: 3 }).hs).toBe(2)
    expect(startDesign({}).hs).toBe(1)
  })
})
