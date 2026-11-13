import { describe, it, expect } from 'vitest'
import { allowedPlans, applyRules, cleanRules, DEFAULT_RULES, permutations, planNumbers, type PlanRule } from '@/lib/gb/plan-pairs'

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
    expect(applyRules(DEFAULT_RULES, 'Steadfast MCare+', { [H]: 'Plan 1', [MM]: 'Plan 5' }, income)[MM]).toBe('Plan 5')
  })
  it('refuses unknown insurers, a cover tied to itself and two rules for one cover', () => {
    const P = ['Income FlexCare'], C = [H, MM]
    expect(cleanRules([{ product: 'X', cover: MM, tiedTo: H }], P, C)).toBeNull()
    expect(cleanRules([{ product: 'Income FlexCare', cover: MM, tiedTo: MM }], P, C)).toBeNull()
    expect(cleanRules([{ product: 'Income FlexCare', cover: MM, tiedTo: H }, { product: 'Income FlexCare', cover: MM, tiedTo: H }], P, C)).toBeNull()
    expect(cleanRules([{ product: 'Income FlexCare', cover: MM, tiedTo: H, match: 'any_plan', required: false }], P, C)?.[0]).toMatchObject({ match: 'any_plan', required: false })
  })
  it('every hospital plan with each way its riders go: Income\'s inside, an optional rider with and without', () => {
    const inc = permutations(DEFAULT_RULES, 'Income FlexCare', H, income)
    expect(inc).toHaveLength(5)
    expect(inc).toContainEqual({ [H]: 'Plan 1 (Private 1-bed)', [MM]: '' })
    expect(inc).toContainEqual({ [H]: 'Plan 3 (Restructured 1-bed)', [MM]: 'Plan 3' })
    const opt: PlanRule[] = [{ ...DEFAULT_RULES[0], product: 'X', required: false }]
    const x = permutations(opt, 'X', H, income)
    expect(x).toHaveLength(1 + 4 * 2)
    expect(x).toContainEqual({ [H]: 'Plan 3 (Restructured 1-bed)', [MM]: '' })
  })
  it('the brochure rules: Income included, RCC and Singlife optional riders, RCC specialist needs GP', () => {
    expect(DEFAULT_RULES.map(r => [r.product, r.cover, r.required, r.premium])).toEqual([
      ['Income FlexCare', MM, true, 'included'], ['RCC Enhanced III', MM, false, 'own'], ['RCC Enhanced III', 'Outpatient Specialist', false, 'own'], ['Singlife MyBenefits Plus', MM, false, 'own'],
    ])
    expect(applyRules(DEFAULT_RULES, 'RCC Enhanced III', { 'Outpatient GP': '', 'Outpatient Specialist': 'Plan 2' }, { 'Outpatient Specialist': ['Plan 1', 'Plan 2'] })['Outpatient Specialist']).toBe('')
  })
})
