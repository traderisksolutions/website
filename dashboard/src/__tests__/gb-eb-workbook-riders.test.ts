/**
 * Rates the house workbook holds that /eb priced nothing for until 20 Nov 2026 (Jarod): RCC and
 * Singlife major medical, AIA personal accident, term life at all five products. Against the
 * workbook's own rows (fixtures/eb-workbook-v1.2-riders.json, each with its Rates sheet row).
 */
import { describe, it, expect } from 'vitest'
import fixture from './fixtures/eb-workbook-v1.2-riders.json'
import { priceDesign } from '@/lib/gb/eb-price'
import { indexRates, priceCover } from '@/lib/gb/compare-cover'
import { DEFAULT_RULES } from '@/lib/gb/plan-pairs'
import type { Workbook, WbRate } from '@/lib/gb/workbook'
import type { Member } from '@/lib/gb-quote'

const fx = fixture as unknown as { rates: (WbRate & { row: number })[]; lists: Workbook['lists']; benefits: Workbook['benefits'] }
const wb: Workbook = { file: { name: 'TRS EB Calculator V1.2.xlsx', driveFileId: null, modifiedAt: null, readAt: '2026-11-20' }, rates: fx.rates, lists: fx.lists, benefits: fx.benefits }
const idx = indexRates(wb)
const DATE = '2027-01-01'
const ee: Member = { name: 'E', category: 'Staff', relationship: 'self', dob: '1986-06-15', occupation_class: '1' }      // 40 last birthday, 41 next
const sp: Member = { name: 'S', category: 'Staff', relationship: 'spouse', dob: '1988-06-15' }
/** The Rates row a price comes from: insurer, cover, plan, age, and the Life column where the sheet has one. */
const row = (insurer: string, cover: string, plan: string, age: number, life: 'EE' | 'Dep' | null = null, cls: string | null = null) =>
  fx.rates.find(r => r.insurer === insurer && r.cover === cover && r.plan === plan && age >= r.from && age <= r.to && !r.renewalOnly && (r.life == null || r.life === life) && (r.cls == null || r.cls === cls))!
const price = (insurer: string, cover: string, plan: string, ms: Member[], employeesInCompany = 10) => priceCover(idx, insurer, cover, plan, ms, { effectiveDate: DATE, renewal: false, employeesInCompany }).premium

describe('(1) major medical for RCC and Singlife, priced whenever a plan is picked and in both tiers', () => {
  it('RCC major medical Plan 3: Rates row 94 at age 41 next birthday, the group factor of 0.9 for 10 employees', () => {
    expect(row('RCC Enhanced III', 'Major Medical', 'Plan 3', 41).row).toBe(94)
    expect(price('RCC Enhanced III', 'Major Medical', 'Plan 3', [ee])).toBeCloseTo(36.41 * 0.9, 2)
  })
  it('Singlife major medical Plan 3: Rates row 1095', () => {
    expect(row('Singlife MyBenefits Plus', 'Major Medical', 'Plan 3', 40).row).toBe(1095)
    expect(price('Singlife MyBenefits Plus', 'Major Medical', 'Plan 3', [ee])).toBe(13)
  })
  it('Same and Lower tier carry the major medical the insurer ties to the hospital plan, priced, even when today has none', () => {
    const p = priceDesign({ wb, rules: DEFAULT_RULES, effectiveDate: DATE, basis: 'new_business', currentInsurer: null, categories: [{ name: 'Staff', members: [ee], today: { hs: 3 } }] })
    const rcc = p.categories[0].products['RCC Enhanced III']
    expect(rcc.hs.same.plan).toBe('Plan 3 (PTE 2-bed)')
    expect(rcc.mm.same).toEqual({ plan: 'Plan 3', reason: 'with hospital' })
    expect(rcc.mm.options.find(o => o.plan === 'Plan 3')!.premium).toBeCloseTo(36.41 * 1.5, 2)    // one employee: RCC's factor 1.5
    expect(rcc.mm.options.every(o => o.premium != null)).toBe(true)
    const sl = p.categories[0].products['Singlife MyBenefits Plus']
    expect(sl.hs.same.plan).toBe('Plan 4 (Pte 2-bed)')
    expect(sl.mm.same).toEqual({ plan: 'Plan 4', reason: 'with hospital' })
    expect(sl.mm.options.find(o => o.plan === 'Plan 4')!.premium).toBe(row('Singlife MyBenefits Plus', 'Major Medical', 'Plan 4', 40).net)
    // Lower tier: the hospital plan one lower, its major medical with it.
    expect(sl.hs.lower.plan).toBe('Plan 3 (Pte 4-bed)')
    expect(sl.mm.lower).toEqual({ plan: 'Plan 3', reason: 'with hospital' })
  })
})

describe('(2) AIA personal accident: the EE and Dep rates of the Life column (Rates!K, as Calc!AY2 selects them)', () => {
  it('an employee takes the EE rate of their class: Plan 1 class 1 is row 1511 (S$25), class 2 row 1517', () => {
    expect(row('AIA Flexi Vital Care Plus', 'Personal Accident', 'Plan 1 ($50k)', 40, 'EE', 'Class 1').row).toBe(1511)
    expect(price('AIA Flexi Vital Care Plus', 'Personal Accident', 'Plan 1 ($50k)', [ee])).toBe(25)
    expect(price('AIA Flexi Vital Care Plus', 'Personal Accident', 'Plan 1 ($50k)', [{ ...ee, occupation_class: '2' }])).toBe(35.18)
  })
  it('a spouse holds no accident plan here, so the Dep rate (row 1529, S$14.82) is not added', () => {
    expect(row('AIA Flexi Vital Care Plus', 'Personal Accident', 'Plan 1 ($50k)', 38, 'Dep', 'Class 1').net).toBe(14.82)
    expect(price('AIA Flexi Vital Care Plus', 'Personal Accident', 'Plan 1 ($50k)', [ee, sp])).toBe(25)
  })
  it('all six plans are priced', () => {
    expect(fx.lists['AIA Flexi Vital Care Plus']['Personal Accident']).toHaveLength(6)
    for (const plan of fx.lists['AIA Flexi Vital Care Plus']['Personal Accident']) expect(price('AIA Flexi Vital Care Plus', 'Personal Accident', plan, [ee])).toBeGreaterThan(0)
  })
})

describe('(3) term life at the five products, per category, sum assured per plan', () => {
  it('employees on the age-banded rows; dependants hold no term life plan', () => {
    expect(row('RCC Enhanced III', 'Term Life', 'Plan 5 ($50k)', 41).row).toBe(221)
    expect(price('RCC Enhanced III', 'Term Life', 'Plan 5 ($50k)', [ee, sp])).toBe(82.8)          // RCC's group factor is for medical lines only
    expect(row('Income FlexCare', 'Term Life', 'Plan 5 ($50k)', 40).row).toBe(404)
    expect(price('Income FlexCare', 'Term Life', 'Plan 5 ($50k)', [ee, sp])).toBe(48)
    expect(row('Singlife MyBenefits Plus', 'Term Life', 'Plan 1 ($50k)', 40).row).toBe(874)
    expect(price('Singlife MyBenefits Plus', 'Term Life', 'Plan 1 ($50k)', [ee])).toBe(47.5)
    expect(row('AIA Flexi Vital Care Plus', 'Term Life', 'Plan 1 ($50k)', 40, 'EE').row).toBe(1179)
    expect(price('AIA Flexi Vital Care Plus', 'Term Life', 'Plan 1 ($50k)', [ee, sp])).toBe(94.5)
  })
  it('QBE MCare+ sells no term life: no plan, no rate (Lists "N/A")', () => {
    expect(fx.lists['Steadfast MCare+']['Term Life']).toEqual([])
    expect(fx.rates.some(r => r.insurer === 'Steadfast MCare+' && r.cover === 'Term Life')).toBe(false)
  })
  it('on /eb: a dropdown of every plan with its sum assured and premium; a fixed sum is matched, else none', () => {
    const p = priceDesign({ wb, rules: DEFAULT_RULES, effectiveDate: DATE, basis: 'new_business', currentInsurer: null, categories: [{ name: 'Staff', members: [ee, sp], today: { tl: 2 } }] })
    const inc = p.categories[0].products['Income FlexCare'].tl
    expect(inc.options.map(o => o.words)).toEqual(['S$500,000', 'S$300,000', 'S$200,000', 'S$100,000', 'S$50,000'])
    expect(inc.same).toEqual({ plan: 'Plan 4 ($100k)', reason: 'same' })
    expect(inc.lower).toEqual({ plan: 'Plan 5 ($50k)', reason: 'lower' })
    expect(inc.options.find(o => o.plan === 'Plan 5 ($50k)')!.premium).toBe(48)
    expect(p.categories[0].products['Steadfast MCare+'].tl.options).toEqual([])
    const none = priceDesign({ wb, rules: DEFAULT_RULES, effectiveDate: DATE, basis: 'new_business', currentInsurer: null, categories: [{ name: 'Staff', members: [ee], today: {} }] })
    expect(none.categories[0].products['Income FlexCare'].tl.same).toEqual({ plan: '', reason: 'none' })
  })
})
