import { describe, it, expect } from 'vitest'
import { alignTerms, differingRows, alignSelectedTerms, UNCONFIRMED_TAG } from '@/lib/pm-compare'
import type { CompareInsurer, SelectedCompareInsurer } from '@/lib/pm-compare'
import type { RateTable } from '@/lib/pm-rates'

const A: CompareInsurer = {
  calculator_id: 'a', insurer_name: 'Raffles',
  terms: [
    { category: 'Hospitalization', label: 'Room & Board', value: 'S$200,000', source: 'pdf' },
    { category: 'Panel', label: 'Panel clinics', value: 'Yes', source: 'pdf' },
  ],
}
const B: CompareInsurer = {
  calculator_id: 'b', insurer_name: 'Singlife',
  terms: [
    { category: 'Hospitalization', label: 'Room & Board', value: 'S$300,000', source: 'pdf' },
    { category: 'Maternity', label: 'Delivery benefit', value: 'S$2,000', source: 'pdf' },
  ],
}

describe('alignTerms', () => {
  it('aligns identical-label terms across insurers into one row', () => {
    const rows = alignTerms([A, B])
    const rb = rows.find(r => r.label === 'Room & Board')!
    expect(rb.per_insurer).toEqual({ a: 'S$200,000', b: 'S$300,000' })
  })

  it('keeps insurer-specific-only terms as their own row', () => {
    const rows = alignTerms([A, B])
    const panel = rows.find(r => r.label === 'Panel clinics')!
    expect(panel.per_insurer).toEqual({ a: 'Yes' })
    const maternity = rows.find(r => r.label === 'Delivery benefit')!
    expect(maternity.per_insurer).toEqual({ b: 'S$2,000' })
  })

  it('joins multiple plan-tier values for the same insurer+label', () => {
    const multi: CompareInsurer = {
      calculator_id: 'a', insurer_name: 'Raffles',
      terms: [
        { plan_code: 'Plan 1', category: 'Hospitalization', label: 'Room & Board', value: 'S$150k', source: 'pdf' },
        { plan_code: 'Plan 2', category: 'Hospitalization', label: 'Room & Board', value: 'S$300k', source: 'pdf' },
      ],
    }
    const rows = alignTerms([multi])
    expect(rows[0].per_insurer.a).toBe('S$150k (Plan 1) / S$300k (Plan 2)')
  })
})

describe('alignSelectedTerms — canonical_category matching', () => {
  const rt: RateTable = {
    age_basis: null,
    coverages: [
      { code: 'OPC', full_name: 'Group Outpatient Clinical (GP Outpatient)', canonical_category: 'Outpatient GP', plans: [{ code: 'Plan 1', label: 'Plan 1' }], age_bands: [], rates: [] },
    ],
    rules: {},
  }
  const insurers: SelectedCompareInsurer[] = [{
    calculator_id: 'a', insurer_name: 'A', rate_table: rt,
    terms: [
      // category is worded nothing like full_name/code, so the old substring heuristic would miss it —
      // canonical_category is the same bucket as the coverage, so it should still resolve cleanly.
      { plan_code: 'Plan 1', category: 'Primary Care Visits', canonical_category: 'Outpatient GP', label: 'Consultation cap', value: '$500', source: 'pdf' },
    ],
  }]

  it('resolves the plan-tier match via canonical_category even when category text does not overlap the coverage label', () => {
    const rows = alignSelectedTerms(insurers, { a: { OPC: { plan: 'Plan 1' } } })
    const row = rows.find(r => r.label === 'Consultation cap')!
    expect(row.per_insurer.a).toBe('$500 (Plan 1)')  // resolved cleanly, not tagged unconfirmed
    expect(row.per_insurer.a).not.toContain(UNCONFIRMED_TAG)
  })

  it('drops the term when the selected plan does not match', () => {
    const rows = alignSelectedTerms(insurers, { a: { OPC: { plan: 'Plan 2' } } })
    expect(rows.find(r => r.label === 'Consultation cap')).toBeUndefined()
  })
})

describe('differingRows', () => {
  it('drops rows where every insurer agrees', () => {
    const rows = alignTerms([
      { calculator_id: 'a', insurer_name: 'A', terms: [{ category: 'X', label: 'Y', value: 'same', source: 'pdf' }] },
      { calculator_id: 'b', insurer_name: 'B', terms: [{ category: 'X', label: 'Y', value: 'same', source: 'pdf' }] },
    ])
    expect(differingRows(rows, ['a', 'b'])).toHaveLength(0)
  })

  it('keeps rows where values differ or one insurer lacks the term', () => {
    const rows = alignTerms([A, B])
    const diff = differingRows(rows, ['a', 'b'])
    expect(diff.map(r => r.label).sort()).toEqual(['Delivery benefit', 'Panel clinics', 'Room & Board'])
  })
})
