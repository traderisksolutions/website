import { describe, it, expect } from 'vitest'
import { ageAt, memberAge, findRate, computeQuote, type RateTableInfo, type Member } from '@/lib/gb-quote'

describe('ageAt', () => {
  it('age last birthday before the birthday in the policy year', () => {
    // DOB 1990-06-15, effective 2026-01-01 → hasn't had 2026 birthday yet → last=35
    expect(ageAt('1990-06-15', '2026-01-01', 'last_birthday')).toBe(35)
    expect(ageAt('1990-06-15', '2026-01-01', 'next_birthday')).toBe(36)
  })
  it('age last birthday on/after the birthday', () => {
    expect(ageAt('1990-01-01', '2026-06-15', 'last_birthday')).toBe(36)
    expect(ageAt('1990-01-01', '2026-06-15', 'next_birthday')).toBe(37)
  })
  it('returns null on bad dates', () => {
    expect(ageAt('not-a-date', '2026-01-01', 'last_birthday')).toBeNull()
  })
})

describe('memberAge', () => {
  it('prefers DOB with the table basis', () => {
    expect(memberAge({ name: 'A', category: 'Staff', relationship: 'self', dob: '1990-06-15' }, '2026-01-01', 'next_birthday')).toBe(36)
  })
  it('falls back to explicit age', () => {
    expect(memberAge({ name: 'A', category: 'Staff', relationship: 'self', age: 40 }, '2026-01-01', 'next_birthday')).toBe(40)
  })
})

const rates = [
  { product_code: 'GOC', plan_code: 'Plan 1', band_label: 'Up to 25', age_min: 0,  age_max: 25, premium: 346.72 },
  { product_code: 'GOC', plan_code: 'Plan 1', band_label: '26-50',    age_min: 26, age_max: 50, premium: 346.72 },
  { product_code: 'GOC', plan_code: 'Plan 1', band_label: '51-75',    age_min: 51, age_max: 75, premium: 430.65 },
]

describe('findRate', () => {
  it('matches the band containing the age', () => {
    expect(findRate(rates, 'GOC', 'Plan 1', 40).premium).toBe(346.72)
    expect(findRate(rates, 'GOC', 'Plan 1', 55).premium).toBe(430.65)
  })
  it('flags an age above all bands', () => {
    const r = findRate(rates, 'GOC', 'Plan 1', 80)
    expect(r.premium).toBeNull()
    expect(r.note).toContain('no band')
  })
  it('flags an unmapped plan', () => {
    expect(findRate(rates, 'GOC', null, 40).note).toBe('no plan mapped')
    expect(findRate(rates, 'GOC', 'Plan 9', 40).note).toBe('plan not in rate table')
  })
})

describe('computeQuote', () => {
  const tables: RateTableInfo[] = [
    { rate_table_id: 't1', insurer_name: 'Insurer A', age_basis: 'next_birthday', rates },
  ]
  const members: Member[] = [
    { name: 'Boss', category: 'Manager', relationship: 'self', dob: '1970-03-01' },  // next-bday age 56 → 430.65
    { name: 'Clerk', category: 'Staff',  relationship: 'self', dob: '2000-03-01' },  // next-bday age 26 → 346.72
  ]
  const categoryMap = { t1: { GOC: { Manager: 'Plan 1', Staff: 'Plan 1' } } }

  it('sums premiums + applies GST + sorts insurers by total', () => {
    const res = computeQuote(members, tables, categoryMap, ['GOC'], 0.09, '2026-01-01')
    const a = res.per_insurer[0]
    expect(a.subtotal).toBe(777.37)            // 430.65 + 346.72
    expect(a.gst).toBe(69.96)                  // 777.37 * 0.09
    expect(a.total).toBe(847.33)
    expect(res.lines).toHaveLength(2)
  })

  it('skips products a category is not mapped to', () => {
    const map2 = { t1: { GOC: { Manager: 'Plan 1' } } }   // Staff unmapped
    const res = computeQuote(members, tables, map2, ['GOC'], 0.09, '2026-01-01')
    expect(res.lines).toHaveLength(1)
    expect(res.per_insurer[0].subtotal).toBe(430.65)
  })
})
