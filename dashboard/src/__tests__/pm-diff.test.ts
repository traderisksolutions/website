import { describe, it, expect } from 'vitest'
import { diffRateTable, diffBenefitTerms } from '@/lib/pm-diff'
import type { RateTable } from '@/lib/pm-rates'
import type { BenefitTerm } from '@/lib/pm-benefits-extract'

const mkRt = (rate: number, opts: { age_basis?: RateTable['age_basis']; gst?: RateTable['rules']['gst'] } = {}): RateTable => ({
  calculator_id: 'c1',
  age_basis: opts.age_basis ?? 'ANB',
  rules: { gst: opts.gst },
  coverages: [{
    code: 'GHS', full_name: 'Group Hospital & Surgical',
    plans: [{ code: 'Plan 1', label: 'Plan 1' }],
    age_bands: ['0-25'],
    rates: [{ band: '0-25', by_plan: { 'Plan 1': rate } }],
  }],
})

describe('diffRateTable', () => {
  it('finds no diff between identical tables', () => {
    expect(diffRateTable(mkRt(100), mkRt(100))).toHaveLength(0)
  })

  it('flags a changed rate cell with its coverage/band/plan path', () => {
    const d = diffRateTable(mkRt(100), mkRt(120))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ path: 'coverages.Group Hospital & Surgical.0-25.Plan 1', from: 100, to: 120 })
  })

  it('flags age_basis and gst rule changes', () => {
    const before = mkRt(100, { age_basis: 'ANB', gst: { inclusive: true, rate: 0.09 } })
    const after = mkRt(100, { age_basis: 'ALB', gst: { inclusive: false, rate: 0.09 } })
    const d = diffRateTable(before, after)
    expect(d.find(e => e.path === 'age_basis')).toMatchObject({ from: 'ANB', to: 'ALB' })
    expect(d.find(e => e.path === 'rules.gst')).toBeTruthy()
  })

  it('flags an added/removed coverage', () => {
    const before = mkRt(100)
    const after: RateTable = { ...mkRt(100), coverages: [...mkRt(100).coverages, { code: 'GTL', full_name: 'Group Term Life', plans: [], age_bands: [], rates: [] }] }
    const d = diffRateTable(before, after)
    expect(d.find(e => e.path === 'coverages.Group Term Life')).toMatchObject({ from: null, to: 'added' })
  })

  it('returns no diff when either side is missing', () => {
    expect(diffRateTable(null, mkRt(100))).toHaveLength(0)
    expect(diffRateTable(mkRt(100), undefined)).toHaveLength(0)
  })
})

const mkTerm = (value: string): BenefitTerm => ({ category: 'Hospitalization', label: 'Room & Board', value, source: 'pdf' })

describe('diffBenefitTerms', () => {
  it('finds no diff between identical term sets', () => {
    expect(diffBenefitTerms([mkTerm('1-bed')], [mkTerm('1-bed')])).toHaveLength(0)
  })

  it('flags a changed value', () => {
    const d = diffBenefitTerms([mkTerm('1-bed')], [mkTerm('2-bed')])
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ from: '1-bed', to: '2-bed' })
  })

  it('flags an added and a removed term', () => {
    const before = [mkTerm('1-bed')]
    const after = [{ category: 'Dental', label: 'Annual limit', value: '$800', source: 'pdf' as const }]
    const d = diffBenefitTerms(before, after)
    expect(d.find(e => e.to === null)).toMatchObject({ from: '1-bed' })
    expect(d.find(e => e.from === null)).toMatchObject({ to: '$800' })
  })
})
