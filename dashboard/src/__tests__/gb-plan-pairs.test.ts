import { describe, it, expect } from 'vitest'
import { allowedPlans, applyRules, cleanRules, DEFAULT_RULES, planNumbers, type PlanRule } from '@/lib/gb/plan-pairs'

const H = 'Hospital & Surgical', MM = 'Major Medical'
const income = { [H]: ['Plan 1 (Private 1-bed)', 'Plan 2 (Private 1-bed)', 'Plan 3 (Restructured 1-bed)', 'Plan 4 (Private 4-bed)', 'Plan 5 (Restructured 4-bed)'], [MM]: ['Plan 2', 'Plan 3', 'Plan 4', 'Plan 5'] }

describe('plan rules', () => {
  it('reads plan numbers, the bracket left out', () => {
    expect(planNumbers('Plan 2A/2B')).toEqual(['2a', '2b'])
    expect(planNumbers('Plan 1 (Private 1-bed)')).toEqual(['1'])
    expect(planNumbers('Plan 002')).toEqual(['2'])
  })
  it('Income FlexCare: major medical follows the hospital plan and is taken with it', () => {
    const r = DEFAULT_RULES[0]
    expect(allowedPlans(r, 'Plan 3 (Restructured 1-bed)', income[MM])).toEqual(['Plan 3'])
    expect(applyRules(DEFAULT_RULES, 'Income FlexCare', { [H]: 'Plan 4 (Private 4-bed)', [MM]: 'Plan 2' }, income)[MM]).toBe('Plan 4')
    expect(applyRules(DEFAULT_RULES, 'Income FlexCare', { [H]: 'Plan 4 (Private 4-bed)', [MM]: '' }, income)[MM]).toBe('Plan 4')
    expect(applyRules(DEFAULT_RULES, 'Income FlexCare', { [H]: 'Plan 1 (Private 1-bed)', [MM]: 'Plan 2' }, income)[MM]).toBe('')
    expect(applyRules(DEFAULT_RULES, 'Income FlexCare', { [H]: '', [MM]: 'Plan 2' }, income)[MM]).toBe('')
  })
  it('an optional rule may leave the cover out; other insurers are untouched', () => {
    const opt: PlanRule[] = [{ ...DEFAULT_RULES[0], required: false }]
    expect(applyRules(opt, 'Income FlexCare', { [H]: 'Plan 3 (Restructured 1-bed)', [MM]: '' }, income)[MM]).toBe('')
    expect(applyRules(opt, 'Income FlexCare', { [H]: 'Plan 3 (Restructured 1-bed)', [MM]: 'Plan 5' }, income)[MM]).toBe('Plan 3')
    expect(applyRules(DEFAULT_RULES, 'RCC Enhanced III', { [H]: 'Plan 1', [MM]: 'Plan 5' }, income)[MM]).toBe('Plan 5')
  })
  it('refuses unknown insurers, a cover tied to itself and two rules for one cover', () => {
    const P = ['Income FlexCare'], C = [H, MM]
    expect(cleanRules([{ product: 'X', cover: MM, tiedTo: H }], P, C)).toBeNull()
    expect(cleanRules([{ product: 'Income FlexCare', cover: MM, tiedTo: MM }], P, C)).toBeNull()
    expect(cleanRules([{ product: 'Income FlexCare', cover: MM, tiedTo: H }, { product: 'Income FlexCare', cover: MM, tiedTo: H }], P, C)).toBeNull()
    expect(cleanRules([{ product: 'Income FlexCare', cover: MM, tiedTo: H, match: 'any_plan', required: false }], P, C)?.[0]).toMatchObject({ match: 'any_plan', required: false })
  })
})
