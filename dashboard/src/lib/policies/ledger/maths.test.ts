import { describe, it, expect } from 'vitest'
import { termDays, elapsedDays, earnedPremium, lossRatio, bandFor, projectRenewal, runningTotals, NO_CLAIMS_DATA_BAND } from './maths'

describe('term and earned premium', () => {
  it('counts both ends of a one-year term', () => {
    expect(termDays('2026-09-01', '2027-08-31')).toBe(365)
    expect(termDays('2025-07-28', '2026-07-27')).toBe(365)
    expect(termDays(null, '2027-08-31')).toBe(0)
    expect(termDays('2027-08-31', '2026-09-01')).toBe(0)
  })
  it('caps elapsed days at the term and floors at zero', () => {
    expect(elapsedDays('2026-09-01', '2027-08-31', '2026-09-01')).toBe(1)
    expect(elapsedDays('2026-09-01', '2027-08-31', '2026-08-01')).toBe(0)
    expect(elapsedDays('2026-09-01', '2027-08-31', '2028-01-01')).toBe(365)
  })
  it('earns pro-rata by the day', () => {
    expect(earnedPremium(3650, '2026-01-01', '2026-12-31', '2026-01-10')).toBe(100)
    expect(earnedPremium(3650, '2026-01-01', '2026-12-31', '2027-06-01')).toBe(3650)
    expect(earnedPremium(3650, null, null, '2026-06-01')).toBe(0)
  })
})

describe('loss ratio and bands', () => {
  it('is null until premium is earned', () => {
    expect(lossRatio(500, 0)).toBeNull()
    expect(lossRatio(500, 1000)).toBe(0.5)
    expect(lossRatio(0, 1000)).toBe(0)
  })
  it('picks the band by ratio, flat band without claims data', () => {
    expect(bandFor(null)).toBe(NO_CLAIMS_DATA_BAND)
    expect(bandFor(0.2).low_pct).toBe(-10)
    expect(bandFor(0.4).high_pct).toBe(0)
    expect(bandFor(0.5).high_pct).toBe(5)
    expect(bandFor(0.75).low_pct).toBe(5)
    expect(bandFor(0.95).high_pct).toBe(30)
    expect(bandFor(1.4).low_pct).toBe(30)
  })
})

describe('projection', () => {
  it('rates per head when heads and a rate are known', () => {
    const p = projectRenewal({ inceptionPremium: 3080, endorsementsNet: 0, lossRatio: 0.2, headsInception: 22, headsNow: 25, ratePerHead: 140 })
    expect(p.same_rate).toBe(3500)
    expect(p.low).toBe(3150)
    expect(p.high).toBe(3500)
    expect(p.basis).toContain('25 heads')
  })
  it('scales the inception premium by heads when no rate is on file', () => {
    const p = projectRenewal({ inceptionPremium: 3080, endorsementsNet: 191.21, lossRatio: null, headsInception: 22, headsNow: 11, ratePerHead: null })
    expect(p.same_rate).toBe(1540)
    expect(p.band).toBe(NO_CLAIMS_DATA_BAND)
    expect(p.high).toBe(1694)
  })
  it('keeps the inception premium when exposure is unknown', () => {
    const p = projectRenewal({ inceptionPremium: 1050, endorsementsNet: -100, lossRatio: 0.9, headsInception: null, headsNow: null, ratePerHead: null })
    expect(p.same_rate).toBe(1050)
    expect(p.low).toBe(1207.5)
    expect(p.high).toBe(1365)
    expect(p.assumptions.some(a => /not annualised/.test(a))).toBe(true)
  })
  it('has nothing to project without a premium', () => {
    const p = projectRenewal({ inceptionPremium: null, endorsementsNet: 0, lossRatio: null, headsInception: null, headsNow: null, ratePerHead: null })
    expect(p.same_rate).toBeNull()
    expect(p.low).toBeNull()
  })
})

describe('running totals', () => {
  it('accumulates signed lines and skips nulls', () => {
    expect(runningTotals([3080, 191.21, null, -115.56])).toEqual([3080, 3271.21, 3271.21, 3155.65])
  })
})
