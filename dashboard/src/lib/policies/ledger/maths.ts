/**
 * The arithmetic behind a policy's ledger and its renewal pack. Pure; no I/O.
 *
 * Earned premium is pro-rata by the day over the policy term. Loss ratio is claims paid over
 * earned premium. The projection is a range from the loss-ratio bands insurers in Singapore use
 * when they re-rate a commercial account at renewal; the bands are this file's assumption, not any
 * insurer's published rule, and every pack says so.
 */

const DAY_MS = 86_400_000
const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
export const r2 = (n: number) => Math.round(n * 100) / 100

/** Days in the term, both ends counted. 0 when the dates are missing or reversed. */
export function termDays(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  const d = Math.round((day(end) - day(start)) / DAY_MS) + 1
  return d > 0 ? d : 0
}

/** Days of the term that have run by `asOf`, both ends counted, capped at the term. */
export function elapsedDays(start: string | null, end: string | null, asOf: string): number {
  const t = termDays(start, end)
  if (!t || !start) return 0
  const e = Math.round((day(asOf) - day(start)) / DAY_MS) + 1
  return Math.max(0, Math.min(t, e))
}

/** The share of a net annual premium earned by `asOf`. */
export function earnedPremium(netPremium: number, start: string | null, end: string | null, asOf: string): number {
  const t = termDays(start, end)
  if (!t) return 0
  return r2(netPremium * elapsedDays(start, end, asOf) / t)
}

/** Claims paid over earned premium; null when nothing has been earned. */
export function lossRatio(claimsPaid: number, earned: number): number | null {
  if (!(earned > 0)) return null
  return Math.round(claimsPaid / earned * 1000) / 1000
}

export type Band = { label: string; low_pct: number; high_pct: number }

/**
 * Renewal rate movement by loss ratio. Assumption: the usual commercial re-rating bands in the
 * Singapore market (no-claim discount at the bottom, loading above 60%). A pack with no claims
 * data gets the flat band.
 */
export const LOSS_RATIO_BANDS: { upTo: number; band: Band }[] = [
  { upTo: 0.4, band: { label: 'Loss ratio under 40%', low_pct: -10, high_pct: 0 } },
  { upTo: 0.6, band: { label: 'Loss ratio 40–60%', low_pct: 0, high_pct: 5 } },
  { upTo: 0.8, band: { label: 'Loss ratio 60–80%', low_pct: 5, high_pct: 15 } },
  { upTo: 1.0, band: { label: 'Loss ratio 80–100%', low_pct: 15, high_pct: 30 } },
  { upTo: Infinity, band: { label: 'Loss ratio over 100%', low_pct: 30, high_pct: 50 } },
]
export const NO_CLAIMS_DATA_BAND: Band = { label: 'No claims figures on file', low_pct: 0, high_pct: 10 }

export function bandFor(ratio: number | null): Band {
  if (ratio == null) return NO_CLAIMS_DATA_BAND
  return LOSS_RATIO_BANDS.find(b => ratio <= b.upTo)!.band
}

export type ProjectionInput = {
  /** The premium at inception or last renewal, before GST. */
  inceptionPremium: number | null
  /** Endorsement premiums in the period, signed, before GST. */
  endorsementsNet: number
  lossRatio: number | null
  headsInception: number | null
  headsNow: number | null
  ratePerHead: number | null
}

export type Projection = {
  /** Next year's premium at this year's rate: the rate per head × today's heads, else the inception premium. */
  same_rate: number | null
  basis: string
  band: Band
  low: number | null
  high: number | null
  assumptions: string[]
}

export function projectRenewal(i: ProjectionInput): Projection {
  const assumptions = ['Rate bands are an assumption, not the insurer\'s terms.', 'Figures are as billed to the client, GST included where the insurer charged it.']
  let same: number | null = null
  let basis = 'No premium on file'
  if (i.ratePerHead != null && i.headsNow != null && i.headsNow > 0) {
    same = r2(i.ratePerHead * i.headsNow)
    basis = `Rate per head ${i.ratePerHead.toFixed(2)} × ${i.headsNow} heads`
  } else if (i.inceptionPremium != null) {
    if (i.headsInception && i.headsNow && i.headsInception > 0) {
      same = r2(i.inceptionPremium * i.headsNow / i.headsInception)
      basis = `Inception premium × ${i.headsNow}/${i.headsInception} heads`
    } else {
      same = r2(i.inceptionPremium)
      basis = 'Inception premium, same exposure'
      if (i.endorsementsNet) assumptions.push('Endorsements in the period are not annualised.')
    }
  }
  const band = bandFor(i.lossRatio)
  return {
    same_rate: same, basis, band,
    low: same != null ? r2(same * (1 + band.low_pct / 100)) : null,
    high: same != null ? r2(same * (1 + band.high_pct / 100)) : null,
    assumptions,
  }
}

/** The running balance after each line, oldest first. */
export function runningTotals(amounts: (number | null)[]): number[] {
  let acc = 0
  return amounts.map(a => { acc = r2(acc + (a ?? 0)); return acc })
}
