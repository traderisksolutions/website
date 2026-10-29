/**
 * Pro-rata for member movements: what the insurer should bill for a joiner or refund for a leaver,
 * so its debit or credit note can be checked the day it arrives.
 *
 * Insurers bill movements by the day over a 365-day year. Seen on JK Wildlife's Great Eastern
 * foreign-worker policy: an addition of S$191.21 = S$207.10 × 337/365, and the refund for the same
 * worker S$115.56 = S$190 × 222/365 (before 9% GST). A joiner pays from the effective date to the
 * policy end, both days counted; a leaver is refunded from the deletion's effective date (the first
 * day without cover, i.e. the day after the last day of service) to the policy end, both counted:
 * GE refunded 222 days for a deletion effective 18 Dec 2025 on a policy ending 27 Jul 2026.
 *
 * The annual rate per member comes from, in order: the rate the insurer charged for the same plan
 * on an earlier note, the rate table (Tier A schemes, by age), or the policy's premium per head.
 * The estimate says which, so a broker knows how far to trust it. Pure; no I/O.
 */

export type RateSource = 'insurer_note' | 'rate_table' | 'premium_per_head'
export type ProrataInput = {
  kind: 'join' | 'leave'
  /** Joiner: first day of cover. Leaver: first day without cover. YYYY-MM-DD. */
  effectiveOn: string
  /** Policy period, YYYY-MM-DD. */
  periodStart: string
  periodEnd: string
  /** Annual premium for this member, before GST. */
  annualRate: number
  rateSource: RateSource
  /** GST on top, 0 for life cover. */
  gstRate?: number
}
export type ProrataEstimate = {
  days: number
  yearDays: 365
  net: number
  gst: number
  /** Positive for a debit (joiner), negative for a credit (leaver). */
  total: number
  rateSource: RateSource
  basis: string
}

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const DAY_MS = 86_400_000
const r2 = (n: number) => Math.round(n * 100) / 100

/** Days of cover a joiner buys, or a leaver gives back: effective date to policy end, both counted. */
export function prorataDays(_kind: 'join' | 'leave', effectiveOn: string, periodStart: string, periodEnd: string): number {
  const end = day(periodEnd), start = day(periodStart), eff = day(effectiveOn)
  return Math.max(0, Math.round((end - Math.max(eff, start)) / DAY_MS) + 1)
}

/** A leaver's deletion date from the last day of service: the next day. */
export function deletionFromLastDay(lastDay: string): string {
  return new Date(day(lastDay) + DAY_MS).toISOString().slice(0, 10)
}

export function prorata(i: ProrataInput): ProrataEstimate {
  const days = prorataDays(i.kind, i.effectiveOn, i.periodStart, i.periodEnd)
  const net = r2(i.annualRate * days / 365)
  const gst = r2(net * (i.gstRate ?? 0))
  const sign = i.kind === 'join' ? 1 : -1
  return {
    days, yearDays: 365, net: sign * net, gst: sign * gst, total: sign * r2(net + gst), rateSource: i.rateSource,
    basis: `S$${i.annualRate.toFixed(2)} × ${days}/365${i.gstRate ? ` + ${Math.round(i.gstRate * 100)}% GST` : ''}`,
  }
}

/**
 * How far an insurer's note is from the estimate, as a share of the estimate. A note within 2%
 * (rounding, a day's difference) passes; outside it the transaction is marked for review.
 */
export function variance(estimateTotal: number, noteAmount: number): { diff: number; share: number; withinTolerance: boolean } {
  const diff = r2(Math.abs(noteAmount) - Math.abs(estimateTotal))
  const share = estimateTotal === 0 ? (noteAmount === 0 ? 0 : 1) : Math.abs(diff) / Math.abs(estimateTotal)
  return { diff, share, withinTolerance: share <= 0.02 || Math.abs(diff) <= 1 }
}
