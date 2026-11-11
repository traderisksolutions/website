import { describe, expect, it } from 'vitest'
import { customRequirement, customSummary, DEFAULT_CUSTOM, resolveCustom } from '@/lib/gb/custom'
import { bedsOf, coinsOf, copayOf, dollars, ghsLimitOf, hospitalOf, type LimitFacts } from '@/lib/gb/limit-facts'

describe('limit fact parsers', () => {
  it('read the schedule wording the benefit table holds', () => {
    expect(dollars('$300,000 annual policy limit')).toBe(300000)
    expect(ghsLimitOf('$300,000 annual policy limit', 'As charged up to APL')).toEqual({ kind: 'annual', limit: 300000 })
    expect(ghsLimitOf('Not applicable; $25,000 per disability (items 2–6)', '$25,000 (hospital services)')).toEqual({ kind: 'per_disability', limit: 25000 })
    expect(ghsLimitOf('Not applicable; sub-limits apply', '$20,000 (surgical, hospital services, doctor, ambulance)')).toEqual({ kind: 'per_disability', limit: 20000 })
    expect(ghsLimitOf('No overall limit; benefits apply per disability', '$30,000')).toEqual({ kind: 'per_disability', limit: 30000 })
    expect(ghsLimitOf('$250,000 per policy year (excl. R&B, ICU)', '$250,000 per policy year')).toEqual({ kind: 'annual', limit: 250000 })
    expect(hospitalOf('Govt/Restructured')).toBe('government'); expect(hospitalOf('PRIVATE')).toBe('private')
    expect(bedsOf('1-Bedded')).toBe(1); expect(bedsOf('4 Bed')).toBe(4); expect(bedsOf('2-bed')).toBe(2)
    expect(coinsOf('20% (PTE; 0% at RH/GRH)')).toBe(20); expect(coinsOf('Nil (Major Medical add-on 20%)')).toBe(0)
    expect(copayOf('Not applicable')).toBe(0); expect(copayOf('$10 per visit')).toBe(10); expect(copayOf('Nil')).toBe(0)
  })
})

const singlife: LimitFacts = {
  table: 'sl',
  ghs: [
    { plan: 'Plan 1 (Govt/Restr)', hospital: 'government', beds: 4, coins: 0, kind: 'per_disability', limit: 15000 },
    { plan: 'Plan 2 (Govt/Restr)', hospital: 'government', beds: 1, coins: 0, kind: 'per_disability', limit: 20000 },
    { plan: 'Plan 3 (Pte 4-bed)', hospital: 'private', beds: 4, coins: 0, kind: 'per_disability', limit: 15000 },
    { plan: 'Plan 4 (Pte 2-bed)', hospital: 'private', beds: 2, coins: 0, kind: 'per_disability', limit: 20000 },
    { plan: 'Plan 5 (Pte 1-bed)', hospital: 'private', beds: 1, coins: 0, kind: 'per_disability', limit: 25000 },
    { plan: 'Plan 6 (Pte 1-bed)', hospital: 'private', beds: 1, coins: 0, kind: 'annual', limit: 250000 },
  ],
  emm: [{ plan: 'Plan 4', limit: 80000 }], gosc: [{ plan: 'Plan 1', limit: 1000 }, { plan: 'Plan 3', limit: 1500 }, { plan: 'Plan 5', limit: 2000 }],
  gd: [{ plan: 'Plan 1', limit: 200 }, { plan: 'Plan 2', limit: 500 }, { plan: 'Plan 3', limit: 800 }], gopc: [], gtl: [],
}
const qbe: LimitFacts = {
  table: 'qbe',
  ghs: [
    { plan: 'Plan 4 · Private 1-bedded', hospital: 'private', beds: 1, coins: 0, kind: 'annual', limit: 60000 },
    { plan: 'Plan 3 · Private 1-bedded', hospital: 'private', beds: 1, coins: 0, kind: 'annual', limit: 80000 },
    { plan: 'Plan 3 · Private 1-bedded · 20% co-insurance', hospital: 'private', beds: 1, coins: 20, kind: 'annual', limit: 80000 },
    { plan: 'Plan 1 · Private 4-bedded', hospital: 'private', beds: 4, coins: 0, kind: 'annual', limit: 300000 },
  ],
  emm: [], gosc: [], gd: [], gopc: [{ plan: 'Plan 1', copay: 0 }, { plan: 'Plan 2', copay: 10 }], gtl: [],
}

describe('resolveCustom', () => {
  it('takes the lowest plan that meets each number', () => {
    const r = resolveCustom({ ...DEFAULT_CUSTOM, hospital: 'private', beds: 2, limit: 20000, spLimit: 1500, gdLimit: 500 }, singlife)
    expect(r.overrides).toMatchObject({ GHS: 'Plan 4 (Pte 2-bed)', GOSC: 'Plan 3', GD: 'Plan 2' })
    expect(r.notes).toEqual([])
  })
  it('says when it takes the nearest below, the nearest ward or the other limit kind', () => {
    const r = resolveCustom({ ...DEFAULT_CUSTOM, hospital: 'private', beds: 1, limit: 30000, spLimit: 5000, gdLimit: 1500 }, singlife)
    expect(r.overrides.GHS).toBe('Plan 5 (Pte 1-bed)')
    expect(r.notes).toContain('per-stay limit: nearest is S$25,000')
    expect(r.notes).toContain('specialist limit: nearest is S$2,000')
    const q = resolveCustom({ ...DEFAULT_CUSTOM, hospital: 'private', beds: 2, limitKind: 'annual', limit: 80000, coins: 20 }, qbe)
    expect(q.overrides.GHS).toBe('Plan 3 · Private 1-bedded · 20% co-insurance')
    expect(q.notes).toContain('no 2-bed plan; 1-bed priced')
    const a = resolveCustom({ ...DEFAULT_CUSTOM, hospital: 'private', beds: 1, limitKind: 'annual', limit: 100000 }, singlife)
    expect(a.overrides.GHS).toBe('Plan 6 (Pte 1-bed)')
  })
  it('GP co-pay picks the plan with that co-pay', () => {
    expect(resolveCustom({ ...DEFAULT_CUSTOM, gpCopay: 10 }, qbe).overrides.GOPC).toBe('Plan 2')
    expect(resolveCustom({ ...DEFAULT_CUSTOM, gpCopay: 0 }, qbe).overrides.GOPC).toBe('Plan 1')
  })
  it('the requirement carries the covers and the summary reads as a line', () => {
    expect(customRequirement({ ...DEFAULT_CUSTOM, hospital: 'government', beds: 1 }).ward).toBe('G1')
    expect(customRequirement({ ...DEFAULT_CUSTOM, limitKind: 'annual', limit: 250000 }).wardLevel).toBe('top')
    expect(customSummary(DEFAULT_CUSTOM)).toBe('Private 4-bed · S$15,000 per stay · major medical S$60,000 · GP S$0 · specialist S$1,500 · dental S$500 · life S$100,000 · dependants on medical')
  })
})
