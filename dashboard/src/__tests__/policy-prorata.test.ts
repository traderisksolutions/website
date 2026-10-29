/** Pro-rata against two real Great Eastern notes on JK Wildlife's foreign-worker policy (2025-07-28 to 2026-07-27). */
import { describe, expect, it } from 'vitest'
import { prorata, prorataDays, variance, deletionFromLastDay } from '@/lib/policies/prorata'

const P = { periodStart: '2025-07-28', periodEnd: '2026-07-27' }

describe('pro-rata, days over 365', () => {
  it('addition from 25 Aug 2025: S$207.10 × 337/365 = S$191.21 (GE DN, Sep 2025)', () => {
    expect(prorataDays('join', '2025-08-25', P.periodStart, P.periodEnd)).toBe(337)
    expect(prorata({ kind: 'join', effectiveOn: '2025-08-25', ...P, annualRate: 207.10, rateSource: 'insurer_note' }).total).toBe(191.21)
  })
  it('deletion effective 18 Dec 2025: S$190 × 222/365 = S$115.56 + 9% GST = S$125.96 credit (GE CN, Sep 2026)', () => {
    const e = prorata({ kind: 'leave', effectiveOn: '2025-12-18', ...P, annualRate: 190, rateSource: 'insurer_note', gstRate: 0.09 })
    expect(e.days).toBe(222)
    expect(e.net).toBe(-115.56)
    expect(e.total).toBe(-125.96)
  })
  it('last day of service 17 Dec → deletion 18 Dec', () => expect(deletionFromLastDay('2025-12-17')).toBe('2025-12-18'))
  it('an effective date before the policy starts counts from the start', () => {
    expect(prorataDays('join', '2025-07-01', P.periodStart, P.periodEnd)).toBe(365)
  })
  it('variance: a note within 2% passes, outside is flagged', () => {
    expect(variance(191.21, 191.21).withinTolerance).toBe(true)
    expect(variance(-125.96, -126.5).withinTolerance).toBe(true)
    expect(variance(191.21, 250).withinTolerance).toBe(false)
  })
})
