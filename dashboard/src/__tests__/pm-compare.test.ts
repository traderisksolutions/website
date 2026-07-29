import { describe, it, expect } from 'vitest'
import { alignTerms, differingRows } from '@/lib/pm-compare'
import type { CompareInsurer } from '@/lib/pm-compare'

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
