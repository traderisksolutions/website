import { describe, it, expect } from 'vitest'
import { mergeTerms } from '@/lib/pm-benefits-extract'
import type { BenefitTerm } from '@/lib/pm-benefits-extract'

const t = (over: Partial<BenefitTerm> = {}): BenefitTerm => ({ plan_code: 'Plan 1', category: 'Hospitalization', label: 'Room & Board', value: 'S$300k', source: 'pdf', ...over })

describe('mergeTerms', () => {
  it('has no conflicts when both extractors agree', () => {
    const { terms, conflicts } = mergeTerms([t()], [t()])
    expect(terms).toHaveLength(1)
    expect(conflicts).toHaveLength(0)
  })

  it('flags a value disagreement, keeping both readings for the human to pick', () => {
    const { conflicts } = mergeTerms([t({ value: 'S$300k' })], [t({ value: 'S$200k' })])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ opus: 'S$300k', gemini: 'S$200k' })
  })

  it('is insensitive to cosmetic differences (S$300k vs S$300,000)', () => {
    const { conflicts } = mergeTerms([t({ value: 'S$300k' })], [t({ value: 'S$300k' })])
    expect(conflicts).toHaveLength(0)
  })

  it('flags a term only one extractor found, without dropping it', () => {
    const { terms, conflicts } = mergeTerms([t(), t({ label: 'ICU limit', value: 'S$10k' })], [t()])
    expect(terms).toHaveLength(2)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ label: 'ICU limit', note: 'Only Opus found this term' })
  })

  it('merges terms Gemini alone found', () => {
    const { terms, conflicts } = mergeTerms([t()], [t(), t({ label: 'Panel', value: 'Yes' })])
    expect(terms).toHaveLength(2)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ label: 'Panel', note: 'Only Gemini found this term' })
  })

  it('matches terms by plan+category+label regardless of insurer-specific plan codes elsewhere', () => {
    const { conflicts } = mergeTerms([t({ plan_code: 'Plan 1' })], [t({ plan_code: 'Plan 1' })])
    expect(conflicts).toHaveLength(0)
  })
})
