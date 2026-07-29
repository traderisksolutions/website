import { describe, it, expect } from 'vitest'
import { ageForBasis, coverageFor, computeInsurerQuote } from '@/lib/pm-calc'
import type { RateTable } from '@/lib/pm-rates'

describe('ageForBasis', () => {
  const asOf = new Date('2026-10-24')

  it('computes Age Last Birthday from DOB', () => {
    expect(ageForBasis({ date_of_birth: '1990-10-24' }, 'ALB', asOf)).toBe(36) // birthday is today -> counted
    expect(ageForBasis({ date_of_birth: '1990-10-25' }, 'ALB', asOf)).toBe(35) // birthday tomorrow -> not yet
    expect(ageForBasis({ date_of_birth: '1990-01-01' }, 'ALB', asOf)).toBe(36)
  })

  it('Age Next Birthday is ALB + 1', () => {
    expect(ageForBasis({ date_of_birth: '1990-10-25' }, 'ANB', asOf)).toBe(36)
  })

  it('falls back to a bare age when there is no DOB', () => {
    expect(ageForBasis({ age: 42 }, 'ANB', asOf)).toBe(42)
    expect(ageForBasis({}, 'ANB', asOf)).toBeNull()
  })
})

const RT: RateTable = {
  calculator_id: 'c1',
  age_basis: 'ANB',
  coverages: [
    {
      code: 'HS', full_name: 'Hospital & Surgical', member_type: 'Employee',
      plans: [{ code: 'Plan 1', label: 'Plan 1' }],
      age_bands: ['0-25', '26-30'],
      rates: [{ band: '0-25', by_plan: { 'Plan 1': 1000 } }, { band: '26-30', by_plan: { 'Plan 1': 1200 } }],
    },
    {
      code: 'HS', full_name: 'Hospital & Surgical', member_type: 'Dependant',
      plans: [{ code: 'Plan 1', label: 'Plan 1' }],
      age_bands: ['0-25', '26-30'],
      rates: [{ band: '0-25', by_plan: { 'Plan 1': 700 } }, { band: '26-30', by_plan: { 'Plan 1': 850 } }],
    },
    {
      code: 'TL', full_name: 'Term Life',
      plans: [{ code: 'Plan 1', label: 'Plan 1' }],
      age_bands: ['0-99'],
      rates: [{ band: '0-99', by_plan: { 'Plan 1': 100 } }],
    },
  ],
  rules: {
    group_size_loading: [{ min: 1, max: 1, loading_pct: 50 }, { min: 5, max: 9, loading_pct: -5 }, { min: 10, max: null, loading_pct: -10 }],
    loading_excludes: ['TL'],
    quote_basis_exclusions: { new_business: ['71-75'] },
    gst: { inclusive: true, rate: 0.09 },
  },
}

describe('coverageFor', () => {
  it('picks the member-type variant matching the life, falling back to unscoped', () => {
    expect(coverageFor(RT, 'HS', 'Employee')?.member_type).toBe('Employee')
    expect(coverageFor(RT, 'HS', 'Dependent')?.member_type).toBe('Dependant') // spelling differs, still matches
    expect(coverageFor(RT, 'TL', 'Employee')?.code).toBe('TL') // single unscoped variant
  })
})

describe('computeInsurerQuote', () => {
  const census = [
    { name: 'Jane', relationship: 'Self', date_of_birth: '1999-01-01' },     // Employee, age 27 ANB
    { name: 'Baby', relationship: 'Child', date_of_birth: '2001-01-01' },    // Dependant, age 25 ANB
  ]
  const selection = { HS: { plan: 'Plan 1' }, TL: { plan: 'Plan 1' } }
  const globals = { effective_date: '2026-01-01' }

  it('nets down GST-inclusive rates and reads the right member-type band', () => {
    const r = computeInsurerQuote('c1', 'RCC', '2026-01-01', RT, census, selection, globals)
    // Jane: age 27 ANB -> 26-30 band, Employee variant 1200, GST-inclusive /1.09.
    expect(r.members[0].lines.HS).toBeCloseTo(1200 / 1.09, 2)
    // Baby: DOB 2001-01-01, as of 2026-01-01 -> ALB 25, ANB 26 -> 26-30 band, Dependant variant 850.
    expect(r.members[1].lines.HS).toBeCloseTo(850 / 1.09, 2)
  })

  it('applies group-size loading to medical lines but not to excluded lines (Term Life)', () => {
    const r = computeInsurerQuote('c1', 'RCC', '2026-01-01', RT, census, selection, globals)
    // 2 lives -> no loading band matches (bands are 1, 5-9, 10+) -> loading 0%, so TL == raw net rate.
    expect(r.members[0].lines.TL).toBeCloseTo(100 / 1.09, 2)
  })

  it('applies the +50% single-life loading to medical but not Term Life', () => {
    const solo = [census[0]]
    const r = computeInsurerQuote('c1', 'RCC', '2026-01-01', RT, solo, selection, globals)
    expect(r.members[0].lines.HS).toBeCloseTo((1200 / 1.09) * 1.5, 2)
    expect(r.members[0].lines.TL).toBeCloseTo(100 / 1.09, 2) // excluded from loading
  })

  it('drops a coverage line entirely when the census has no selection for it', () => {
    const r = computeInsurerQuote('c1', 'RCC', '2026-01-01', RT, census, { HS: { plan: 'Plan 1' } }, globals)
    expect(r.members[0].lines.TL).toBeUndefined()
  })

  it('excludes a quote-basis-blocked band', () => {
    const oldRt: RateTable = { ...RT, coverages: [{ ...RT.coverages[0], rates: [{ band: '71-75', by_plan: { 'Plan 1': 5000 } }] }] }
    const elder = [{ name: 'Old', relationship: 'Self', age: 72 }]
    const r = computeInsurerQuote('c1', 'RCC', '2026-01-01', oldRt, elder, { HS: { plan: 'Plan 1' } }, { effective_date: '2026-01-01', quote_basis: 'new_business' })
    expect(r.members[0].lines.HS).toBeUndefined()
  })

  it('produces totals consistent with per-life subtotals', () => {
    const r = computeInsurerQuote('c1', 'RCC', '2026-01-01', RT, census, selection, globals)
    const summed = r.members.reduce((s, m) => s + m.subtotal, 0)
    expect(r.grand).toBeCloseTo(summed, 2)
  })
})
