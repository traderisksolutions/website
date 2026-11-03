import { describe, it, expect } from 'vitest'
import { checkPerMilleText, checkStated, familyTierPremium, perLifeRates, perMillePremium, renewalRate, sumAssured, yearEndAdjustment, INCOME_TIER_MULTIPLE } from '@/lib/gb/custom-quote'

describe('EB custom quotes (cases from TRS mail, Jun–Nov 2026)', () => {
  it('Income family tiers reproduce Genscript Plan 1: EO 579, ES/EC 1,447.50, EF 2,026.50', () => {
    expect(579 * INCOME_TIER_MULTIPLE.ES).toBe(1447.5)
    expect(579 * INCOME_TIER_MULTIPLE.EF).toBe(2026.5)
    const r = familyTierPremium({ 'Plan 1': 579, 'Plan 2': 609 }, [{ plan: 'Plan 1', tier: 'EO', count: 10 }, { plan: 'Plan 1', tier: 'EF', count: 2 }, { plan: 'Plan 2', tier: 'ES', count: 1 }, { plan: 'Plan 9', tier: 'EO', count: 1 }])
    expect(r.byPlan).toEqual({ 'Plan 1': 9843, 'Plan 2': 1522.5 })
    expect(r.net).toBe(11365.5)
    expect(r.missing).toEqual(['Plan 9'])
  })
  it('QBE per life: a child at 0.8 of the employee rate (Genscript P2 568 → 454)', () => {
    expect(perLifeRates(568)).toEqual({ employee: 568, spouse: 568, child: 454 })
  })
  it('sum assured, per mille and the Genscript slips', () => {
    expect(sumAssured({ flat: 50_000 })).toBe(50_000)
    expect(sumAssured({ salaryMultiple: 24, annualSalary: 60_000, cap: 1_000_000 })).toBe(1_000_000)
    expect(perMillePremium(0.2, 7_700_000)).toBe(1540)
    const gtl = checkStated(28_962.5, perMillePremium(1, 7_700_000), 'GTL')
    expect(gtl.ok).toBe(false)
    expect(gtl.note).toMatch(/gives S\$7,700\.00, it states S\$28,962\.50/)
    expect(checkStated(1540, 1540, 'GPA').ok).toBe(true)
  })
  it('reads the basis from the insurer text', () => {
    expect(checkPerMilleText('Rate: S$1.00 per S$1,000 sum assured. Total sum assured: S$7.7m. Annual premium S$28,962.50', 28962.5)?.ok).toBe(false)
    expect(checkPerMilleText('Rate S$0.20 per S$1,000; total sum insured SGD 7,700,000', 1540)?.ok).toBe(true)
    expect(checkPerMilleText('Annual premium S$1,540', 1540)).toBeNull()
  })
  it('renewal load to whole dollars (Aureus: GHS +15% 187 → 215, GP +40% 176 → 246)', () => {
    expect(renewalRate(187, 0.15)).toBe(215)
    expect(renewalRate(176, 0.4)).toBe(246)
  })
  it('year-end headcount adjustment: half the change at the rate, plus GST', () => {
    expect(yearEndAdjustment(40, 50, 190)).toEqual({ net: 950, gst: 85.5, total: 1035.5 })
    expect(yearEndAdjustment(50, 44, 190).net).toBe(-570)
  })
})

describe('custom rates entered for a census', () => {
  const census = [
    { category: 'Plan 1', relationship: 'self' }, { category: 'Plan 1', relationship: 'spouse' }, { category: 'Plan 1', relationship: 'child' },
    { category: 'Plan 1', relationship: 'self' },
    { category: 'Plan 2', relationship: 'self' }, { category: 'Plan 2', relationship: 'child' }, { category: 'Plan 2', relationship: 'child' },
    { category: 'Plan 2', relationship: 'self' }, { category: 'Plan 2', relationship: 'spouse' },
  ]
  it('counts family tiers and lives per plan', async () => {
    const { censusCounts } = await import('@/lib/gb/custom-quote')
    const c = censusCounts(census)
    expect(c.tiers['Plan 1']).toEqual({ EO: 1, ES: 0, EC: 0, EF: 1 })
    expect(c.tiers['Plan 2']).toEqual({ EO: 0, ES: 1, EC: 1, EF: 0 })
    expect(c.lives['Plan 2']).toEqual({ employee: 2, spouse: 1, child: 2 })
    expect([c.employees, c.total]).toEqual([4, 9])
  })
  it('totals an Income-style and a QBE-style quote, GST on medical only', async () => {
    const { censusCounts, customQuoteTotal } = await import('@/lib/gb/custom-quote')
    const c = censusCounts(census)
    const income = customQuoteTotal([
      { product: 'GHS', method: 'tier', rates: { 'Plan 1': 579, 'Plan 2': 609 } },
      { product: 'GTL', method: 'per_mille', ratePerThousand: 1, totalSumAssured: 400_000 },
    ], c)
    // Plan 1: 579 + 579×3.5 = 2,605.50; Plan 2: 609×2.5 × 2 = 3,045; GTL 400, no GST
    expect(income.byProduct).toEqual({ GHS: 5650.5, GTL: 400 })
    expect(income.gst).toBe(508.55)
    expect(income.total).toBe(6559.05)
    const qbe = customQuoteTotal([
      { product: 'GHS', method: 'life', rates: { 'Plan 1': 471, 'Plan 2': 568 } },
      { product: 'Dental', method: 'per_life', rate: 472 },
    ], c)
    // Plan 1: 3 adults... 2 employees + 1 spouse at 471 + 1 child at 376 = 1,789; Plan 2: 3 adults at 568 + 2 children at 454 = 2,612
    expect(qbe.byProduct.GHS).toBe(4401)
    expect(qbe.byProduct.Dental).toBe(4248)
  })
  it('names a plan with no rate', async () => {
    const { censusCounts, customQuoteTotal } = await import('@/lib/gb/custom-quote')
    expect(customQuoteTotal([{ product: 'GHS', method: 'tier', rates: { 'Plan 1': 579 } }], censusCounts(census)).missing).toEqual(['GHS Plan 2'])
  })
})

describe('custom rates from the request', () => {
  it('accepts each method and names what is wrong', async () => {
    const { parseProductRate } = await import('@/lib/gb/custom-quote')
    expect(parseProductRate({ product: 'GHS', method: 'tier', rates: { 'Plan 1': 579, 'Plan 2': 'x' } })).toEqual({ product: 'GHS', method: 'tier', rates: { 'Plan 1': 579 } })
    expect(parseProductRate({ product: 'GTL', method: 'per_mille', rate_per_thousand: 1, total_sum_assured: 7_700_000 })).toEqual({ product: 'GTL', method: 'per_mille', ratePerThousand: 1, totalSumAssured: 7_700_000 })
    expect(parseProductRate({ product: 'GP', method: 'per_employee', rate: -1 })).toBe('GP: enter the rate')
    expect(parseProductRate({ product: 'GHS', method: 'tier', rates: {} })).toBe('GHS: enter a rate for each plan')
    expect(parseProductRate({ product: 'GHS', method: 'guess' })).toBe('GHS: choose how it is priced')
  })
})
