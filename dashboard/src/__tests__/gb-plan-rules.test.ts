/**
 * Choosing a plan tier by rule. Fixtures are the real tiers on file on 2 Oct 2026.
 */
import { describe, it, expect } from 'vitest'
import { matchPlan, parseWard, parseHospital, parseSum, parseCoPay, describeSpec, withDefaults, type OfferedPlan } from '@/lib/gb/plan-rules'
import { offeredPlans } from '@/lib/gb/draft'

const plan = (plan_code: string, f: Partial<OfferedPlan>): OfferedPlan =>
  ({ plan_code, label: plan_code, hospital: null, ward: null, coPay: null, sumAssured: null, avgRate: null, ...f })

describe('reading plan facts', () => {
  it('reads wards, refusing "1 or 4 Bedded"', () => {
    expect(parseWard('1-Bedded')).toBe(1)
    expect(parseWard('PRIVATE 4 Bed')).toBe(4)
    expect(parseWard('Plan 3 (PTE 2-bed)')).toBe(2)
    expect(parseWard('1 or 4 Bedded')).toBeNull()
  })
  it('reads hospital types', () => {
    expect(parseHospital('Plan 5 (GRH 1-bed)')).toBe('government')
    expect(parseHospital('Govt/Restructured')).toBe('government')
    expect(parseHospital('Plan 1 (PTE 1-bed)')).toBe('private')
    expect(parseHospital('Restructured')).toBe('government')
    expect(parseHospital('Plan 1')).toBeNull()
  })
  it('reads sums assured, the printed figure first', () => {
    expect(parseSum('Plan 2 ($100k)')).toBe(100_000)
    expect(parseSum('500,000')).toBe(500_000)
    expect(parseSum('$1m')).toBe(1_000_000)
    expect(parseSum('Plan 1 · Private 1-bedded')).toBeNull()
  })
  it('reads co-payment, a zero one as none', () => {
    expect(parseCoPay('Nil (Major Medical add-on 20%)')).toBe(false)
    expect(parseCoPay('0%')).toBe(false)
    expect(parseCoPay('20% (PTE; 0% at RH/GRH)')).toBe(true)
    expect(parseCoPay('Plan 1B ($10 co-pay)')).toBe(true)
    expect(parseCoPay('GP COPAY S$0 + SP')).toBe(false)
    expect(parseCoPay('GP COPAY S$5 + SP')).toBe(true)
    expect(parseCoPay('Plan 1')).toBeNull()
  })
})

describe('matchPlan — hospital cover', () => {
  // RCC Enhanced III's tiers.
  const rcc = [
    plan('Plan 1 (PTE 1-bed)', { hospital: 'private', ward: 1, coPay: false, avgRate: 900 }),
    plan('Plan 2A (PTE 1-bed)', { hospital: 'private', ward: 1, coPay: false, avgRate: 700 }),
    plan('Plan 2B (PTE 1-bed, 20% co-pay)', { hospital: 'private', ward: 1, coPay: true, avgRate: 500 }),
    plan('Plan 4 (PTE 4-bed)', { hospital: 'private', ward: 4, coPay: false, avgRate: 400 }),
    plan('Plan 5 (GRH 1-bed)', { hospital: 'government', ward: 1, coPay: false, avgRate: 450 }),
  ]
  it('takes the cheapest tier meeting the brief exactly, not one with a co-payment', () => {
    expect(matchPlan({ code: 'GHS' }, rcc)).toEqual({ plan_code: 'Plan 2A (PTE 1-bed)', exact: true, why: 'Plan 2A (PTE 1-bed)' })
  })
  it('honours government 1-bed', () => {
    expect(matchPlan({ code: 'GHS', hospital: 'government', ward: 1 }, rcc)?.plan_code).toBe('Plan 5 (GRH 1-bed)')
  })
  it('settles on the closest and says so', () => {
    const m = matchPlan({ code: 'GHS', hospital: 'government', ward: 4 }, rcc)
    expect(m?.exact).toBe(false)
    expect(m?.plan_code).toBe('Plan 5 (GRH 1-bed)')
  })
  it('takes the top tier when asked', () => {
    expect(matchPlan({ code: 'GHS', tier: 'top' }, rcc)?.plan_code).toBe('Plan 1 (PTE 1-bed)')
  })
})

describe('matchPlan — sums assured', () => {
  const sgl = [50, 100, 150, 200, 300, 500].map((k, i) => plan(`Plan ${i + 1} ($${k}k)`, { sumAssured: k * 1000, avgRate: k }))
  it('finds the exact sum', () => expect(matchPlan({ code: 'GTL', sumAssured: 150_000 }, sgl)?.plan_code).toBe('Plan 3 ($150k)'))
  it('meets or exceeds rather than falling short', () => {
    expect(matchPlan({ code: 'GTL', sumAssured: 120_000 }, sgl)).toMatchObject({ plan_code: 'Plan 3 ($150k)', exact: false })
    expect(matchPlan({ code: 'GTL', sumAssured: 900_000 }, sgl)).toMatchObject({ plan_code: 'Plan 6 ($500k)', exact: false })
  })
  it('defaults to the lowest sum', () => expect(matchPlan({ code: 'GCI' }, sgl)?.plan_code).toBe('Plan 1 ($50k)'))
})

describe('matchPlan — outpatient', () => {
  const rccGp = [plan('Plan 1 (no co-pay)', { coPay: false, avgRate: 300 }), plan('Plan 1B ($10 co-pay)', { coPay: true, avgRate: 200 })]
  it('defaults to no co-payment even when a co-pay tier is cheaper', () => {
    expect(matchPlan({ code: 'GOPC' }, rccGp)?.plan_code).toBe('Plan 1 (no co-pay)')
  })
  it('takes the co-pay tier when asked', () => {
    expect(matchPlan({ code: 'GOPC', coPay: true }, rccGp)?.plan_code).toBe('Plan 1B ($10 co-pay)')
  })
})

describe('offeredPlans', () => {
  it('reads AIA facts from the benefit schedule, the printed sum before the stored number', () => {
    const offered = offeredPlans('GTL', 'GTL',
      [{ rate_table_id: 'a', product_code: 'GTL', plan_code: 'PLAN 6', premium: 1 }], [],
      [{ rate_table_id: 'a', plan_code: 'PLAN 6', canon_benefit: 'GTL_SUM_ASSURED', value_text: '500,000', value_numeric: 50000 }])
    expect(offered[0].sumAssured).toBe(500_000)
  })
  it('reads Income ward and hospital from its schedule when the plan row is bare', () => {
    const offered = offeredPlans('GHS', 'Group Hospital and Surgical (GHS)',
      [{ rate_table_id: 'i', product_code: 'Group Hospital and Surgical (GHS)', plan_code: 'Plan 3', premium: 1 }],
      [{ rate_table_id: 'i', product_code: 'Group Hospital and Surgical (GHS)', plan_code: 'Plan 3', plan_name: 'Plan 3', hospital_type: null, beds: null, co_payment: null, canon_codes: ['GHS'] }],
      [{ rate_table_id: 'i', plan_code: 'Plan 3', canon_benefit: 'GHS_HOSPITAL_TYPE', value_text: 'Restructured', value_numeric: null },
       { rate_table_id: 'i', plan_code: 'Plan 3', canon_benefit: 'GHS_ROOM_BOARD', value_text: '1 Bed', value_numeric: null }])
    expect(offered[0]).toMatchObject({ hospital: 'government', ward: 1 })
  })
})

describe('describeSpec', () => {
  it('says what was priced', () => {
    expect(describeSpec(withDefaults({ code: 'GHS' }))).toBe('Private hospital, 1-bed ward, no co-payment')
    expect(describeSpec({ code: 'GTL', sumAssured: 100_000 })).toBe('S$100,000 sum assured')
  })
})
