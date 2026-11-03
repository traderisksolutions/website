import { describe, it, expect } from 'vitest'
import { dayMark, priceCheck, flowAction } from '../renewal'
import type { PeriodFigures } from '@/lib/policies/ledger'

const period = (o: Partial<PeriodFigures> = {}): PeriodFigures => ({
  policy_id: 'p', policy_number: 'X1', start_date: '2025-12-01', end_date: '2026-11-30', premium_inception: 10_000,
  endorsements_net: 0, endorsements_count: 0, premium_net: 10_000, gst: 900, earned_premium: 9_000,
  claims_count: 0, claims_open: 0, claims_paid: 0, claims_claimed: 0, loss_ratio: 0,
  members_inception: null, members_now: null, joiners: 0, leavers: 0, rate_per_head: null, sum_insured: null, ...o,
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
  it('a clean year with flat exposure holds', () => {
    expect(priceCheck(period()).flow).toBe('hold')
  })
  it('a loss ratio over 60% expects an increase', () => {
    expect(priceCheck(period({ claims_count: 2, claims_paid: 6_000 })).flow).toBe('increase')
  })
  it('an open claim with no paid figure counts at the amount claimed', () => {
    expect(priceCheck(period({ claims_count: 1, claims_open: 1, claims_claimed: 8_000 })).flow).toBe('increase')
  })
  it('a mid loss ratio or a headcount change over 10% adjusts', () => {
    expect(priceCheck(period({ claims_count: 1, claims_paid: 4_500 })).flow).toBe('adjust')
    expect(priceCheck(period({ members_inception: 20, members_now: 25 })).flow).toBe('adjust')
  })
  it('endorsement premium stands in for heads', () => {
    expect(priceCheck(period({ endorsements_count: 2, endorsements_net: 2_000 })).flow).toBe('adjust')
  })
  it('no premium on file is no data', () => {
    expect(priceCheck(period({ premium_inception: null, premium_net: 0 })).flow).toBe('no_data')
    expect(priceCheck(null).flow).toBe('no_data')
  })
  it('sets who is asked', () => {
    expect(flowAction('hold', 'Chubb')).toBe('Ask Chubb for renewal terms on the same basis')
    expect(flowAction('increase', 'Chubb')).toMatch(/full panel/)
  })
})
