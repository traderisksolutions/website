/**
 * Same tier and Lower tier matching (call notes 3, 21, 22, 24): ward and beds first, then the same
 * limit amount and basis (a hard tier), else the next lower, never higher; AIA major medical in the
 * hospital premium; QBE MCare+ an annual policy limit; the current premium only from a read.
 */
import { describe, it, expect } from 'vitest'
import { lowerHospital, lowerTierOf, ruledTier, sameAmount, sameHospital, sameTier, type CoverTarget } from '@/lib/gb/compare-cover'
import { DEFAULT_RULES, IN_HOSPITAL, withDefaults, type PlanRule } from '@/lib/gb/plan-pairs'
import { priceDesign } from '@/lib/gb/eb-price'
import { currentFromLastYear, factsFor, targetOf } from '@/lib/gb/eb-quote'
import { normaliseLastYear } from '@/lib/gb/last-year'
import type { Workbook, WbBenefit, WbRate } from '@/lib/gb/workbook'
import type { Member } from '@/lib/gb-quote'

const H = 'Hospital & Surgical', MM = 'Major Medical', GP = 'Outpatient GP', SP = 'Outpatient Specialist', D = 'Dental'
const QBE = 'Steadfast MCare+', RCC = 'RCC Enhanced III', INC = 'Income FlexCare', SL = 'Singlife MyBenefits Plus', AIA = 'AIA Flexi Vital Care Plus'
const ben = (insurer: string, cover: string, plan: string, id: string, value: string): WbBenefit => ({ insurer, cover, plan, id, label: id, value, source: null })
const hosp = (insurer: string, plan: string, type: string, beds: string, limit: string, basis: string, copay = '0%') => [
  ben(insurer, H, plan, 'ghs.hospital_type', type), ben(insurer, H, plan, 'ghs.room_board', beds), ben(insurer, H, plan, 'ghs.annual_limit', limit), ben(insurer, H, plan, 'ghs.limit_basis', basis), ben(insurer, H, plan, 'ghs.copay', copay),
]
// The house workbook's hospital plans as they stand (TRS EB Calculator V1.2), trimmed.
const QBE_H = [
  ['Plan 2 · Private 4-bed · 0%', 'Private', '4-bed', '$150,000', '0%'], ['Plan 3 · Private 4-bed · 0%', 'Private', '4-bed', '$80,000', '0%'],
  ['Plan 4 · Private 4-bed · 0%', 'Private', '4-bed', '$60,000', '0%'], ['Plan 4 · Private 4-bed · 20%', 'Private', '4-bed', '$60,000', '20%'],
  ['Plan 4 · Govt 1-bed · 0%', 'Government/Restructured', '1-bed', '$60,000', '0%'], ['Plan 5 · Govt 1-bed · 0%', 'Government/Restructured', '1-bed', '$30,000', '0%'],
]
const benefits: WbBenefit[] = [
  // QBE: every plan an annual policy limit; one row says otherwise, and QBE stays annual (note 22).
  ...QBE_H.flatMap(([p, t, b, l, c]) => hosp(QBE, p, t, b, l, p === 'Plan 3 · Private 4-bed · 0%' ? 'Per disability' : 'Annual policy limit (APL)', c)),
  ...hosp(RCC, 'Plan 3 (PTE 2-bed)', 'Private', '2-bed', '$25,000', 'Per disability'),
  ...hosp(RCC, 'Plan 4 (PTE 4-bed)', 'Private', '4-bed', '$15,000', 'Per disability'),
  ...hosp(RCC, 'Plan 5 (GRH 1-bed)', 'Govt/Restructured', '1-bed', '$25,000', 'Per disability'),
  ...hosp(RCC, 'Plan 6 (GRH 4-bed)', 'Govt/Restructured', '4-bed', '$15,000', 'Per disability'),
  ...hosp(INC, 'Plan 4 (Private 4-bed)', 'Private', '4-bed', 'As charged (up to sub-limits)', 'Per disability'),
  ...hosp(INC, 'Plan 5 (Restructured 4-bed)', 'Restructured', '4-bed', 'As charged (up to sub-limits)', 'Per disability'),
  ben(INC, MM, 'Plan 4', 'gmm.annual_limit', '$60,000'), ben(INC, MM, 'Plan 5', 'gmm.annual_limit', '$40,000'),
  ...hosp(SL, 'Plan 3 (Pte 4-bed)', 'Private', '4-bed', 'As charged (up to sub-limits)', 'Per disability'),
  ...hosp(AIA, 'Plan 1 (Pte 4-bed)', 'Private', '4-bed', '$250,000', 'Annual policy limit'),
  ...hosp(AIA, 'Plan 2 (Pte 2-bed)', 'Private', '2-bed', '$250,000', 'Annual policy limit'),
  ...hosp(AIA, 'Plan 4 (Pte 1-bed)', 'Private', '1-bed', '$250,000', 'Annual policy limit'),
  ben(AIA, MM, 'N/A', 'gmm.annual_limit', 'Bundled in H&S'),
  ben(QBE, GP, 'Plan 1 (no co-pay)', 'gp.copay', 'Nil'), ben(QBE, GP, 'Plan 2 ($10 co-pay)', 'gp.copay', '$10 / visit'),
  ben(AIA, GP, 'Plan 1 (no co-pay)', 'gp.copay', 'Nil'), ben(AIA, GP, 'Plan 2 ($5 co-pay)', 'gp.copay', '$5'),
  ben(QBE, SP, 'Plan 1 · 0%', 'sp.annual_limit', '$2,500 (Panel consult)'), ben(QBE, SP, 'Plan 2 · 0%', 'sp.annual_limit', '$1,000 (Panel consult)'),
  ben(QBE, D, 'Plan 1 · Non-Panel', 'dental.annual_limit', '$1,000'), ben(QBE, D, 'Plan 2 · Non-Panel', 'dental.annual_limit', '$500'), ben(QBE, D, 'Plan 3 · Non-Panel', 'dental.annual_limit', '$250'),
  ben(AIA, D, 'Plan 1', 'dental.annual_limit', 'Schedule of allowances (PPO-Plus)'),
]
const lists: Workbook['lists'] = {
  [QBE]: { [H]: QBE_H.map(x => x[0]), [MM]: [], [GP]: ['Plan 1 (no co-pay)', 'Plan 2 ($10 co-pay)'], [SP]: ['Plan 1 · 0%', 'Plan 2 · 0%'], [D]: ['Plan 1 · Non-Panel', 'Plan 2 · Non-Panel', 'Plan 3 · Non-Panel'] },
  [RCC]: { [H]: ['Plan 3 (PTE 2-bed)', 'Plan 4 (PTE 4-bed)', 'Plan 5 (GRH 1-bed)', 'Plan 6 (GRH 4-bed)'] },
  [INC]: { [H]: ['Plan 4 (Private 4-bed)', 'Plan 5 (Restructured 4-bed)', 'Plan 6 (WP/S Pass, Restr. 4-bed)'], [MM]: ['Plan 4', 'Plan 5'] },
  [SL]: { [H]: ['Plan 3 (Pte 4-bed)'] },
  [AIA]: { [H]: ['Plan 1 (Pte 4-bed)', 'Plan 2 (Pte 2-bed)', 'Plan 4 (Pte 1-bed)', 'GHS-FW Plan 1 (WP/SP)'], [MM]: [], [GP]: ['Plan 1 (no co-pay)', 'Plan 2 ($5 co-pay)'], [D]: ['Plan 1'] },
}
const rate = (insurer: string, cover: string, plan: string, net: number): WbRate => ({ insurer, cover, plan, cls: null, renewalOnly: false, from: 16, to: 99, net, life: null })
const wb: Workbook = {
  file: { name: 'test', driveFileId: null, modifiedAt: null, readAt: '2026-11-20' },
  rates: [
    ...QBE_H.map(([p], i) => rate(QBE, H, p, 500 - i * 40)),
    rate(AIA, H, 'Plan 1 (Pte 4-bed)', 400), rate(AIA, H, 'Plan 2 (Pte 2-bed)', 520), rate(AIA, H, 'Plan 4 (Pte 1-bed)', 700),
    rate(QBE, GP, 'Plan 1 (no co-pay)', 300), rate(QBE, GP, 'Plan 2 ($10 co-pay)', 200),
  ],
  lists, benefits,
}
const benefitsOf = (p: string) => (c: string, plan: string) => Object.fromEntries(benefits.filter(b => b.insurer === p && b.cover === c && b.plan === plan).map(b => [b.id, b.value]))
const t = (hosp: CoverTarget['hosp'], extra: Partial<CoverTarget> = {}): CoverTarget => ({ hosp, gmm: null, gpCopay: 10, spLimit: null, dental: null, pa: null, ...extra })
const pte4 = (limit: number | null, basis: 'annual' | 'per_disability' | null) => ({ hospital: 'private' as const, beds: 4, limit, basis, coins: 0 })

describe('Same tier: ward and beds, then the same limit and basis, else the next lower', () => {
  it('takes the same plan when ward, limit and basis agree', () => {
    expect(sameHospital(benefitsOf(QBE), lists[QBE][H], pte4(60_000, 'annual'), QBE)).toEqual({ plan: 'Plan 4 · Private 4-bed · 0%', reason: 'same' })
    expect(sameHospital(benefitsOf(QBE), lists[QBE][H], pte4(80_000, 'annual'), QBE)).toEqual({ plan: 'Plan 3 · Private 4-bed · 0%', reason: 'same' })
  })
  it('never goes higher: no same limit takes the next lower in the ward', () => {
    expect(sameHospital(benefitsOf(QBE), lists[QBE][H], pte4(100_000, 'annual'), QBE)).toEqual({ plan: 'Plan 3 · Private 4-bed · 0%', reason: 'no same plan' })
    // AIA's only private 4-bed plan is S$250,000 a year: higher, so the next ward down, and there is none.
    expect(sameHospital(benefitsOf(AIA), lists[AIA][H], pte4(60_000, 'annual'), AIA)).toEqual({ plan: '', reason: 'no same plan' })
  })
  it('a year and per disability are a hard tier, not a score', () => {
    // RCC private 4-bed is S$15,000 per disability: not the same as S$60,000 a year; it is lower, so taken as "no same plan".
    expect(sameHospital(benefitsOf(RCC), lists[RCC][H], pte4(60_000, 'annual'), RCC)).toEqual({ plan: 'Plan 4 (PTE 4-bed)', reason: 'no same plan' })
    expect(sameHospital(benefitsOf(RCC), lists[RCC][H], pte4(15_000, 'per_disability'), RCC)).toEqual({ plan: 'Plan 4 (PTE 4-bed)', reason: 'same' })
    // Income private 4-bed is as charged per disability: higher than S$60,000 a year, so the next ward down (Restructured 4-bed is also as charged): none lower.
    expect(sameHospital(benefitsOf(INC), lists[INC][H], pte4(60_000, 'annual'), INC).reason).toBe('no same plan')
  })
  it('QBE MCare+ is an annual policy limit whatever a row says; a per-disability target does not match it', () => {
    // Plan 3's row says per disability; read as QBE's annual limit, S$80,000 a year is below S$80,000 per disability: the next lower, not the same.
    expect(sameHospital(benefitsOf(QBE), lists[QBE][H], pte4(80_000, 'per_disability'), QBE)).toEqual({ plan: 'Plan 3 · Private 4-bed · 0%', reason: 'no same plan' })
  })
  it('the ward alone (a census plan name) takes the lowest limit in that ward', () => {
    expect(sameHospital(benefitsOf(QBE), lists[QBE][H], pte4(null, null), QBE)).toEqual({ plan: 'Plan 4 · Private 4-bed · 0%', reason: 'same' })
    expect(sameHospital(benefitsOf(RCC), lists[RCC][H], { hospital: 'private', beds: 1, limit: null, basis: null, coins: 0 }, RCC)).toEqual({ plan: 'Plan 3 (PTE 2-bed)', reason: 'no same plan' })
  })
  it('never offers a foreign-worker plan', () => {
    expect(sameHospital(benefitsOf(INC), lists[INC][H], { hospital: 'government', beds: 4, limit: null, basis: null, coins: 0 }, INC).plan).toBe('Plan 5 (Restructured 4-bed)')
  })
  it('other covers: the same amount, else the next lower; GP by co-pay', () => {
    expect(sameAmount(benefitsOf(QBE), lists[QBE][D], D, 500)).toEqual({ plan: 'Plan 2 · Non-Panel', reason: 'same' })
    expect(sameAmount(benefitsOf(QBE), lists[QBE][D], D, 800)).toEqual({ plan: 'Plan 2 · Non-Panel', reason: 'no same plan' })
    expect(sameAmount(benefitsOf(QBE), lists[QBE][GP], GP, 10)).toEqual({ plan: 'Plan 2 ($10 co-pay)', reason: 'same' })
    expect(sameAmount(benefitsOf(AIA), lists[AIA][GP], GP, 10)).toEqual({ plan: '', reason: 'no same plan' })
    expect(sameAmount(benefitsOf(AIA), lists[AIA][D], D, 500)).toEqual({ plan: 'Plan 1', reason: 'no same plan' })
    expect(sameAmount(benefitsOf(QBE), lists[QBE][D], D, null)).toEqual({ plan: '', reason: 'none' })
  })
})

describe('Lower tier: one plan lower per cover', () => {
  it('a lower limit in the same ward, then more co-insurance, then the next ward down', () => {
    expect(lowerHospital(benefitsOf(QBE), lists[QBE][H], 'Plan 3 · Private 4-bed · 0%', QBE)).toBe('Plan 4 · Private 4-bed · 0%')
    expect(lowerHospital(benefitsOf(QBE), lists[QBE][H], 'Plan 4 · Private 4-bed · 0%', QBE)).toBe('Plan 4 · Private 4-bed · 20%')
    expect(lowerHospital(benefitsOf(QBE), lists[QBE][H], 'Plan 4 · Private 4-bed · 20%', QBE)).toBe('Plan 4 · Govt 1-bed · 0%')
    expect(lowerHospital(benefitsOf(RCC), lists[RCC][H], 'Plan 6 (GRH 4-bed)', RCC)).toBeNull()
  })
  it('keeps the Same pick where nothing is lower', () => {
    const same = sameTier(benefitsOf(QBE), lists[QBE], t(pte4(60_000, 'annual'), { dental: 250 }), QBE)
    const lower = lowerTierOf(benefitsOf(QBE), lists[QBE], same, QBE)
    expect(lower[H]).toEqual({ plan: 'Plan 4 · Private 4-bed · 20%', reason: 'lower' })
    expect(lower[GP]).toEqual({ plan: 'Plan 2 ($10 co-pay)', reason: 'same' })
    expect(lower[D]).toEqual({ plan: 'Plan 3 · Non-Panel', reason: 'same' })
  })
})

describe('AIA major medical (call note 21) and the rule defaults', () => {
  it('aia-mm is a default: major medical in the hospital premium', () => {
    const r = DEFAULT_RULES.find(x => x.id === 'aia-mm')!
    expect(r).toMatchObject({ product: AIA, cover: MM, tiedTo: H, required: true, premium: 'included' })
  })
  it('stored rules gain a default they lack at read time, and keep their own', () => {
    const stored: PlanRule[] = [{ ...DEFAULT_RULES[0], source: 'edited by Nathan' }]
    const merged = withDefaults(stored)
    expect(merged.find(x => x.id === 'income-mm')!.source).toBe('edited by Nathan')
    expect(merged.some(x => x.id === 'aia-mm')).toBe(true)
    expect(withDefaults(merged)).toHaveLength(merged.length)
  })
  it('the AIA major medical row is "In hospital premium" at S$0, with the hospital plan', () => {
    const members: Member[] = [{ name: 'A', category: 'Staff', relationship: 'self', age: 40 }]
    const p = priceDesign({ wb, rules: DEFAULT_RULES, effectiveDate: '2027-01-01', basis: 'renewal', currentInsurer: null, categories: [{ name: 'Staff', members, today: { hs: 2 } }] })
    const mm = p.categories[0].products[AIA].mm
    expect(mm.options).toEqual([{ plan: IN_HOSPITAL, words: 'In hospital premium', premium: 0 }])
    expect(mm.same).toEqual({ plan: IN_HOSPITAL, reason: 'with hospital' })
    expect(mm.locked).toBe(true)
    expect(p.categories[0].products[AIA].hs.same).toEqual({ plan: 'Plan 1 (Pte 4-bed)', reason: 'same' })
    // Income's major medical follows its hospital plan, as before.
    expect(p.categories[0].products[INC].mm.same).toEqual({ plan: 'Plan 4', reason: 'with hospital' })
  })
  it('ruledTier marks a cover the rules moved', () => {
    const r = ruledTier(DEFAULT_RULES, INC, { [H]: { plan: 'Plan 5 (Restructured 4-bed)', reason: 'same' }, [MM]: { plan: 'Plan 4', reason: 'same' } }, lists[INC])
    expect(r[MM]).toEqual({ plan: 'Plan 5', reason: 'with hospital' })
  })
})

describe('targets and the Current column', () => {
  const ly = normaliseLastYear({
    insurer: 'QBE', product: 'Steadfast MCare+', categories: [{ name: 'All', plans: { GHS: 'Plan 4' }, facts: { hospital: 'private', beds: 4, limitKind: 'annual', limit: 60000, coins: 0, gmm: null, gpCopay: 10, spLimit: 1000, dentalLimit: 500 } }],
    premiumByCover: { GHS: 10900, GOPC: 2180 }, total: 13080, gst: 'included', documents: [{ file: 'dn.pdf', kind: 'debit_note' }],
  }, ['dn.pdf'])
  it('a policy read sets the limit and its basis; a census plan sets the ward only', () => {
    expect(targetOf({ hs: 4 }).hosp).toEqual({ hospital: 'private', beds: 1, limit: null, basis: null, coins: 0 })
    expect(targetOf({}, factsFor(ly, 'Directors')).hosp).toEqual({ hospital: 'private', beds: 4, limit: 60000, basis: 'annual', coins: 0 })
    expect(targetOf({}, factsFor(ly, 'Directors')).dental).toBe(500)
  })
  it('Current is only what a premium or debit note states, net of GST; blank otherwise (call note 23)', () => {
    expect(currentFromLastYear(null).total).toBeNull()
    expect(Object.values(currentFromLastYear(null).byCover).every(v => v == null)).toBe(true)
    const c = currentFromLastYear(ly)
    expect(c.byCover.hs).toBe(10000); expect(c.byCover.gp).toBe(2000); expect(c.byCover.gd).toBeNull()
    expect(c.total).toBe(12000)
  })
  it('the priced Current per cover is never filled from renewal rates', () => {
    const members: Member[] = [{ name: 'A', category: 'Staff', relationship: 'self', age: 40 }]
    const p = priceDesign({ wb, rules: DEFAULT_RULES, effectiveDate: '2027-01-01', basis: 'renewal', currentInsurer: 'QBE', categories: [{ name: 'Staff', members, today: { hs: 2 } }] })
    expect(Object.values(p.categories[0].today.premium).every(v => v == null)).toBe(true)
  })
})
