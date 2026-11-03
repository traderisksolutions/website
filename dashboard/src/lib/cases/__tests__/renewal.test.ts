import { describe, it, expect } from 'vitest'
import { dayMark, priceCheck, flowAction } from '../renewal'
import type { PeriodFigures } from '@/lib/policies/ledger'
import { DEFAULT_RENEWAL_METHOD, parseMethod, lineKey } from '@/lib/methods/method'

const period = (o: Partial<PeriodFigures> = {}): PeriodFigures => ({
  policy_id: 'p', policy_number: 'X1', start_date: '2025-12-01', end_date: '2026-11-30', premium_inception: 10_000,
  endorsements_net: 0, endorsements_count: 0, premium_net: 10_000, gst: 900, earned_premium: 9_000,
  claims_count: 0, claims_open: 0, claims_paid: 0, claims_claimed: 0, loss_ratio: 0,
  insurer_experience: null, members_inception: null, members_now: null, joiners: 0, leavers: 0, rate_per_head: null, sum_insured: null, ...o,
})

describe('day marks', () => {
  it('counts back 90, 45, 30 and 15 days from the end date', () => {
    expect(dayMark(120)).toBeNull()
    expect(dayMark(90)).toBe(90)
    expect(dayMark(60)).toBe(90)
    expect(dayMark(45)).toBe(45)
    expect(dayMark(31)).toBe(45)
    expect(dayMark(30)).toBe(30)
    expect(dayMark(16)).toBe(30)
    expect(dayMark(15)).toBe(15)
    expect(dayMark(0)).toBe(15)
    expect(dayMark(-1)).toBeNull()
  })
})

describe('price check', () => {
  const clean = { ...parseMethod(DEFAULT_RENEWAL_METHOD), noClaimsUnknown: false }
  it('no claims on file is unknown by default, not a clean year', () => {
    const r = priceCheck(period())
    expect(r.flow).toBe('no_data')
    expect(r.basis).toMatch(/claims experience not confirmed/)
  })
  it('a blank register reads as clean when the method says so', () => {
    expect(priceCheck(period(), clean).flow).toBe('hold')
  })
  it('a loss ratio over 60% expects an increase', () => {
    expect(priceCheck(period({ claims_count: 2, claims_paid: 6_000 })).flow).toBe('increase')
  })
  it('an open claim with no paid figure counts at the amount claimed', () => {
    expect(priceCheck(period({ claims_count: 1, claims_open: 1, claims_claimed: 8_000 })).flow).toBe('increase')
  })
  it('a claim with no amount at all is never a clean year (the Keller case)', () => {
    expect(priceCheck(period({ claims_count: 1, claims_open: 1 })).flow).toBe('adjust')
  })
  it('a mid loss ratio or a headcount change over 10% adjusts', () => {
    expect(priceCheck(period({ claims_count: 1, claims_paid: 4_500 })).flow).toBe('adjust')
    expect(priceCheck(period({ members_inception: 20, members_now: 25 }), clean).flow).toBe('adjust')
    expect(priceCheck(period({ members_inception: 20, members_now: 25 })).flow).toBe('adjust')
  })
  it('endorsement premium stands in for heads', () => {
    expect(priceCheck(period({ endorsements_count: 2, endorsements_net: 2_000 }), clean).flow).toBe('adjust')
  })
  it('no premium on file is no data', () => {
    expect(priceCheck(period({ premium_inception: null, premium_net: 0 })).flow).toBe('no_data')
    expect(priceCheck(null).flow).toBe('no_data')
  })
  it('an insurer rate note raises the flow for that insurer and line only (the QBE employee benefits case)', () => {
    const m = parseMethod(DEFAULT_RENEWAL_METHOD.replace('Insurer | line | effect | note', 'Insurer | line | effect | note\nQBE | employee benefits | increase | rates up for members aged 50 and over'))
    const c = { ...m, noClaimsUnknown: false }
    expect(priceCheck(period(), c, { insurer: 'QBE Insurance (Singapore)', line: 'Group Medical (Employee Benefits)' }).flow).toBe('increase')
    expect(priceCheck(period(), c, { insurer: 'QBE Insurance (Singapore)', line: 'Work Injury Compensation' }).flow).toBe('hold')
    expect(priceCheck(period(), c, { insurer: 'Chubb', line: 'Group Medical (Employee Benefits)' }).flow).toBe('hold')
  })
  it('a client the method always markets is at least adjust', () => {
    const m = { ...parseMethod(DEFAULT_RENEWAL_METHOD.replace('Clients:', 'Clients: Example Bikes, Other Co')), noClaimsUnknown: false }
    expect(priceCheck(period(), m, { client: 'EXAMPLE BIKES PTE LTD' }).flow).toBe('adjust')
    expect(priceCheck(period(), m, { client: 'Someone Else Pte Ltd' }).flow).toBe('hold')
  })
  it("the insurer's claims experience outranks an empty register (the Keller case)", () => {
    const r = priceCheck(period({ insurer_experience: { loss_ratio: 2.22, claims_paid: 0, claims_reserve: 10_000, claims_count: 1, as_of: '2026-10-01' } }))
    expect(r.flow).toBe('increase')
    expect(r.basis).toMatch(/insurer's claims experience of 2026-10-01: loss ratio 222%/)
    expect(priceCheck(period({ insurer_experience: { loss_ratio: null, claims_paid: 0, claims_reserve: 0, claims_count: 0, as_of: '2026-10-01' } })).flow).toBe('hold')
    expect(priceCheck(period({ insurer_experience: { loss_ratio: null, claims_paid: 1_000, claims_reserve: 5_000, claims_count: 2, as_of: null } })).flow).toBe('adjust')
  })
  it('sets who is asked', () => {
    expect(flowAction('hold', 'Chubb')).toBe('Ask Chubb for renewal terms on the same basis')
    expect(flowAction('increase', 'Chubb')).toMatch(/full panel/)
  })
})

describe('renewal method', () => {
  it('reads the default with nothing left over', () => {
    const m = parseMethod(DEFAULT_RENEWAL_METHOD)
    expect(m.holdBelow).toBe(0.4); expect(m.increaseAbove).toBe(0.6); expect(m.exposureShift).toBe(0.1); expect(m.noClaimsUnknown).toBe(true)
    expect(m.unread).toEqual([])
    expect(Object.keys(m.lineNotes)).toEqual(expect.arrayContaining(['wica', 'fwmi', 'eb', 'gpa', 'pi', 'do', 'cyber', 'property', 'liability', 'marine', 'motor', 'car', 'bond', 'trade_credit']))
  })
  it('reads edited thresholds and lists lines it cannot place', () => {
    const m = parseMethod('# Thresholds\nHold below loss ratio: 35%\nIncrease above loss ratio: 70\nSomething odd: 5\n# Insurer and market notes\nAIG | marine | spike | typo effect\n# Lines\nUnderwater basket weaving: ask')
    expect(m.holdBelow).toBe(0.35); expect(m.increaseAbove).toBe(0.7)
    expect(m.unread).toEqual(['Something odd: 5', 'AIG | marine | spike | typo effect', 'Underwater basket weaving: ask'])
  })
  it('maps line names to one family', () => {
    expect(lineKey('Group Hospital & Surgical')).toBe('eb')
    expect(lineKey('Foreign Worker Medical Insurance')).toBe('fwmi')
    expect(lineKey("Contractors' All Risks")).toBe('car')
    expect(lineKey('Asset Manager Liability')).toBe('pi')
    expect(lineKey('Biz Supreme - Office')).toBe('property')
  })
})
