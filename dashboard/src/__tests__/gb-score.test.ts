/**
 * The value score. Pins the method stated in src/lib/gb/score.ts: per-line scoring direction,
 * the roll-up from plan tiers to an insurer, the broker's weights, PEPM, filters and rank.
 */
import { describe, it, expect } from 'vitest'
import { compare, toComparable, type Option } from '@/lib/gb/compare'
import {
  lineScores, scoreComparison, dimensionOf, parseSettings, censusProfile,
  DEFAULT_SETTINGS, AS_CHARGED_CAP, type ScoreSettings,
} from '@/lib/gb/score'

const opt = (key: string, insurer: string, plan: string, total: number | null,
             values: Record<string, string | number | null>, productCodes = ['GHS'], memberCount = 1): Option => ({
  key, insurerName: insurer, planCode: plan, productCodes, annualTotal: total, memberCount,
  values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k,
    typeof v === 'number' ? { text: null, numeric: v } : { text: v, numeric: null }])),
})

const cells = (code: string, xs: [string, string][]) => {
  const compareAs = code.includes('CO_PAY') ? 'percent' : code.includes('ROOM') ? 'room_tier'
    : code === 'GOSC_REFERRAL' ? 'boolean' : 'sgd_limit'
  return xs.map(([key, text]) => ({ key, c: toComparable({ text, numeric: null }, compareAs) }))
}

describe('lineScores', () => {
  it('scores a dollar limit against the highest', () => {
    const s = lineScores(cells('GHS_ANNUAL_LIMIT', [['a', '$300,000'], ['b', '$150,000']]), 'GHS_ANNUAL_LIMIT')
    expect(s.get('a')).toBe(1)
    expect(s.get('b')).toBe(0.5)
  })

  it('caps a finite limit below "as charged"', () => {
    const s = lineScores(cells('GHS_HOSP_MISC', [['a', 'As charged'], ['b', '$20,000'], ['c', '$10,000']]), 'GHS_HOSP_MISC')
    expect(s.get('a')).toBe(1)
    expect(s.get('b')).toBe(AS_CHARGED_CAP)
    expect(s.get('c')).toBe(AS_CHARGED_CAP / 2)
  })

  it('scores a co-payment the other way: 0% beats 10%', () => {
    const s = lineScores(cells('GHS_CO_PAYMENT', [['a', '0%'], ['b', '10%']]), 'GHS_CO_PAYMENT')
    expect(s.get('a')).toBe(1)
    expect(s.get('b')).toBe(0.9)
  })

  it('reads a flat S$0 co-payment as 0%', () => {
    const s = lineScores(cells('GOSC_CO_PAYMENT', [['a', 'S$0'], ['b', '20%']]), 'GOSC_CO_PAYMENT')
    expect(s.get('a')).toBe(1)
    expect(s.get('b')).toBe(0.8)
  })

  it('scores ward class by rank: 1-bed against 4-bed is 0.5', () => {
    const s = lineScores(cells('GHS_ROOM_BOARD', [['a', '1 Bedded'], ['b', '4 Bedded']]), 'GHS_ROOM_BOARD')
    expect(s.get('a')).toBe(1)
    expect(s.get('b')).toBe(0.5)
  })

  it('treats "referral required" as a restriction', () => {
    const s = lineScores(cells('GOSC_REFERRAL', [['a', 'Yes'], ['b', 'No']]), 'GOSC_REFERRAL')
    expect(s.get('a')).toBe(0)
    expect(s.get('b')).toBe(1)
  })

  it('scores nothing when only one option has a value', () => {
    expect(lineScores(cells('GHS_ICU', [['a', '$5,000']]), 'GHS_ICU').size).toBe(0)
  })
})

describe('dimensionOf', () => {
  it('puts co-payments in cost sharing whatever the product', () => {
    expect(dimensionOf('GHS_CO_PAYMENT')).toBe('cost_sharing')
    expect(dimensionOf('GOPC_CO_PAYMENT')).toBe('cost_sharing')
    expect(dimensionOf('EMM_DEDUCTIBLE')).toBe('cost_sharing')
    expect(dimensionOf('GHS_ROOM_BOARD')).toBe('inpatient')
    expect(dimensionOf('GOSC_SPEC_VISIT')).toBe('outpatient')
    expect(dimensionOf('GTL_SUM_ASSURED')).toBe('life')
  })
})

describe('scoreComparison', () => {
  // A dearer 1-bed plan with 0% co-pay against a cheaper 4-bed plan with 10% co-pay.
  const rich  = opt('t1:Plan 1', 'QBE',    'Plan 1', 12_000, { GHS_ROOM_BOARD: '1 Bedded', GHS_ANNUAL_LIMIT: '$300,000', GHS_CO_PAYMENT: '0%' })
  const cheap = opt('t2:Plan 3', 'Income', 'Plan 3',  6_000, { GHS_ROOM_BOARD: '4 Bedded', GHS_ANNUAL_LIMIT: '$150,000', GHS_CO_PAYMENT: '10%' })
  const cmp = compare([rich, cheap])

  it('computes PEPM from employees', () => {
    const r = scoreComparison(cmp, DEFAULT_SETTINGS, 10)
    expect(r.insurers.find(i => i.insurerName === 'QBE')!.pepm).toBe(100)
    expect(r.insurers.find(i => i.insurerName === 'Income')!.pepm).toBe(50)
  })

  it('gives full coverage to the option best on every line', () => {
    const r = scoreComparison(cmp, DEFAULT_SETTINGS, 10)
    expect(r.insurers.find(i => i.insurerName === 'QBE')!.coverage).toBe(100)
  })

  it('ranks the cheaper plan first on value when it gives up less than half', () => {
    const r = scoreComparison(cmp, DEFAULT_SETTINGS, 10)
    // Income inpatient: (0.5·2 + 0.5·2)/4 = 50; cost sharing 0.9 → 90. Weights 40/20 over the
    // two active dimensions: (40·50 + 20·90)/60 = 63.3. Value 63.3/50 beats 100/100.
    const income = r.insurers.find(i => i.insurerName === 'Income')!
    expect(income.coverage).toBe(63.3)
    expect(income.rank).toBe(1)
    expect(income.valueIndex).toBe(100)
  })

  it('follows the broker: rank by coverage puts the richer plan first', () => {
    const r = scoreComparison(cmp, { ...DEFAULT_SETTINGS, sort: 'coverage' }, 10)
    expect(r.insurers[0].insurerName).toBe('QBE')
  })

  it('changes with the weights', () => {
    const onlyCostSharing: ScoreSettings = { ...DEFAULT_SETTINGS, weights: { inpatient: 0, outpatient: 0, life: 0, cost_sharing: 100 } }
    const r = scoreComparison(cmp, onlyCostSharing, 10)
    expect(r.insurers.find(i => i.insurerName === 'Income')!.coverage).toBe(90)
  })

  it('applies the filters and says why', () => {
    const r = scoreComparison(cmp, { ...DEFAULT_SETTINGS, filters: { maxPepm: 80, minWardRank: 2, requiredProducts: ['GTL'], excludeTables: [] } }, 10)
    const qbe = r.insurers.find(i => i.insurerName === 'QBE')!
    const income = r.insurers.find(i => i.insurerName === 'Income')!
    expect(qbe.excluded).toEqual(['Over S$80 PEPM', 'No GTL'])
    expect(income.excluded).toEqual(['Below ward floor', 'No GTL'])
    expect(qbe.rank).toBeNull()
  })

  it('weights plan tiers by the members on them', () => {
    const a1 = opt('t1:Plan 1', 'QBE', 'Plan 1', 10_000, { GHS_ANNUAL_LIMIT: '$300,000' }, ['GHS'], 1)
    const a2 = opt('t1:Plan 2', 'QBE', 'Plan 2', 10_000, { GHS_ANNUAL_LIMIT: '$100,000' }, ['GHS'], 3)
    const b  = opt('t2:Plan 1', 'AIA', 'Plan 1', 10_000, { GHS_ANNUAL_LIMIT: '$300,000' })
    const r = scoreComparison(compare([a1, a2, b]), DEFAULT_SETTINGS, 4)
    // (1·1 + (1/3)·3) / 4 = 0.5
    expect(r.insurers.find(i => i.insurerName === 'QBE')!.dimensions.inpatient.score).toBe(50)
  })

  it('scores 0 on a dimension the insurer does not quote but another does', () => {
    const a = opt('t1:P', 'QBE', 'P', 10_000, { GHS_ANNUAL_LIMIT: '$300,000', GTL_SUM_ASSURED: '$100,000' }, ['GHS', 'GTL'])
    const b = opt('t2:P', 'AIA', 'P', 10_000, { GHS_ANNUAL_LIMIT: '$300,000' }, ['GHS'])
    const c = opt('t3:P', 'Income', 'P', 10_000, { GHS_ANNUAL_LIMIT: '$300,000', GTL_SUM_ASSURED: '$50,000' }, ['GHS', 'GTL'])
    const r = scoreComparison(compare([a, b, c]), DEFAULT_SETTINGS, 10)
    const aia = r.insurers.find(i => i.insurerName === 'AIA')!
    expect(aia.dimensions.life).toEqual({ quoted: false, linesScored: 0, score: 0 })
  })

  it('leaves an unpriced option out of the value rank', () => {
    const r = scoreComparison(compare([rich, { ...cheap, annualTotal: null }]), DEFAULT_SETTINGS, 10)
    expect(r.insurers.find(i => i.insurerName === 'Income')!.rank).toBeNull()
  })

  it('does not rank a premium with unpriced member lines, and reads S$0 with gaps as not priced', () => {
    const r = scoreComparison(compare([rich, { ...cheap, pricingGaps: 3 }, opt('t3:P', 'Singlife', 'P', 0, { GHS_ROOM_BOARD: '1 Bedded' })
      ].map(o => o.insurerName === 'Singlife' ? { ...o, pricingGaps: 24 } : o)), DEFAULT_SETTINGS, 10)
    const income = r.insurers.find(i => i.insurerName === 'Income')!
    const singlife = r.insurers.find(i => i.insurerName === 'Singlife')!
    expect(income.excluded).toEqual(['3 member lines unpriced'])
    expect(income.rank).toBeNull()
    expect(singlife.annualTotal).toBeNull()
    expect(singlife.pepm).toBeNull()
    expect(r.insurers[0].insurerName).toBe('QBE')
  })
})

describe('equal basis', () => {
  it('leaves a dimension out for everyone when one insurer quoting it has nothing scorable', () => {
    const a = opt('t1:G', 'Income', 'G', 10_000, { GHS_ANNUAL_LIMIT: '$200,000' })
    const a2 = opt('t1:S', 'Income', 'S', 10_000, { GOSC_ANNUAL_LIMIT: '$1,000/yr' }, ['GOSC'])
    const b = opt('t2:G', 'AIA', 'G', 10_000, { GHS_ANNUAL_LIMIT: '$100,000' })
    const b2 = opt('t2:S', 'AIA', 'S', 10_000, { GOSC_ANNUAL_LIMIT: '$500' }, ['GOSC'])
    const c = opt('t3:G', 'QBE', 'G', 10_000, { GHS_ANNUAL_LIMIT: '$300,000' })
    const c2 = opt('t3:S', 'QBE', 'S', 10_000, {}, ['GOSC'])
    const r = scoreComparison(compare([a, a2, b, b2, c, c2]), DEFAULT_SETTINGS, 10)
    expect(r.activeDimensions).toEqual(['inpatient'])
    expect(r.droppedDimensions).toEqual([{ key: 'outpatient', insurers: ['QBE'] }])
    expect(r.insurers.find(i => i.insurerName === 'QBE')!.coverage).toBe(100)
    expect(r.insurers.find(i => i.insurerName === 'Income')!.coverage).toBe(66.7)
  })
})

describe('fixes from the QuantuPeak and White Horse drafts', () => {
  it('reads an insurer ward from its hospital option only', () => {
    const ghs = opt('t1:GHS:Plan 3', 'Income', 'Plan 3', 10_000, { GHS_ROOM_BOARD: '1 Bed' }, ['GHS'])
    const gtl = opt('t1:GTL:Plan 4', 'Income', 'Plan 4', 10_000, { GHS_ROOM_BOARD: '4 Bed', GTL_SUM_ASSURED: '$100,000' }, ['GTL'])
    const other = opt('t2:GHS:P', 'AIA', 'P', 10_000, { GHS_ROOM_BOARD: '1 Bed' }, ['GHS'])
    const r = scoreComparison(compare([ghs, gtl, other]), DEFAULT_SETTINGS, 5)
    expect(r.insurers.find(i => i.insurerName === 'Income')!.worstWardRank).toBe(2)
  })
  it('does not let a filtered-out insurer drop a dimension for the rest', () => {
    const a = opt('t1:G', 'Income', 'G', 10_000, { GHS_ANNUAL_LIMIT: '$200,000' })
    const a2 = opt('t1:S', 'Income', 'S', 10_000, { GOSC_ANNUAL_LIMIT: '$1,000' }, ['GOSC'])
    const b = opt('t2:G', 'AIA', 'G', 10_000, { GHS_ANNUAL_LIMIT: '$100,000' })
    const b2 = opt('t2:S', 'AIA', 'S', 10_000, { GOSC_ANNUAL_LIMIT: '$500' }, ['GOSC'])
    const c = opt('t3:G', 'QBE', 'G', 10_000, { GHS_ANNUAL_LIMIT: '$300,000' })
    const c2 = opt('t3:S', 'QBE', 'S', 10_000, {}, ['GOSC'])
    const r = scoreComparison(compare([a, a2, b, b2, c, c2]), { ...DEFAULT_SETTINGS, filters: { ...DEFAULT_SETTINGS.filters, excludeTables: ['t3'] } }, 10)
    expect(r.activeDimensions).toEqual(['inpatient', 'outpatient'])
    expect(r.droppedDimensions).toEqual([])
  })
})

describe('parseSettings', () => {
  it('reads what the route stores and falls back field by field', () => {
    const s = parseSettings(JSON.stringify({ score: { weights: { inpatient: 70 }, sort: 'pepm', filters: { maxPepm: 120 } } }))
    expect(s.weights).toEqual({ inpatient: 70, outpatient: 20, life: 20, cost_sharing: 20 })
    expect(s.sort).toBe('pepm')
    expect(s.filters.maxPepm).toBe(120)
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
  })
})

describe('censusProfile', () => {
  it('ages from date of birth at the effective date, day-first', () => {
    const p = censusProfile([
      { dob: '24/12/1971', relationship: 'self' },
      { dob: '12/09/1972', relationship: 'spouse' },
      { age: 30, relationship: 'self' },
    ], '2026-10-01')
    expect(p.employees).toBe(2)
    expect(p.dependants).toBe(1)
    expect(p.averageAgeEmployees).toBe(42)   // 54 and 30
    expect(p.bands.find(b => b.label === '50–59')!.count).toBe(2)
  })
})
