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
