/**
 * Renewal start point: the day marks counted back from the policy end date in TRS's own register,
 * and the price check that picks how hard the renewal is marketed. The insurer's renewal notice
 * is an event on the case, never its trigger.
 *
 *   90  open the case; price check; data request pre-filled from last year; the proposal form for
 *       financial lines; the claims experience for employee benefits
 *   45  terms due: with no quote on file, ask the insurer (or the panel, by the flow)
 *   30  the renewal update to the client (the renewal report and its email); no terms yet → a person asks
 *   15  decision due: no client decision yet → a person calls
 *
 * Pure. Tested in src/lib/cases/__tests__/renewal.test.ts.
 */
import type { PeriodFigures } from '@/lib/policies/ledger'

export const DAY_MARKS = [90, 45, 30, 15] as const
export type DayMark = typeof DAY_MARKS[number]
export const OPEN_DAYS = 90
export const TERMS_DAYS = 45
export const UPDATE_DAYS = 30
export const DECISION_DAYS = 15

/** The mark a policy has reached today: the smallest mark its end date falls inside, or null. */
export function dayMark(daysLeft: number | null): DayMark | null {
  if (daysLeft == null || daysLeft < 0) return null
  for (const m of [...DAY_MARKS].sort((a, b) => a - b)) if (daysLeft <= m) return m
  return null
}

export type RenewalFlow = 'hold' | 'adjust' | 'increase' | 'no_data'

/** Loss ratio bands, the same as the renewal report's (src/lib/policies/ledger/maths.ts): under 40% holds, over 60% rises. */
export const HOLD_BELOW = 0.4
export const INCREASE_ABOVE = 0.6
/** A change in heads or in endorsement premium beyond this share of the premium changes the price. */
export const EXPOSURE_SHIFT = 0.1

export type PriceCheck = { flow: RenewalFlow; lossRatio: number | null; exposureShift: number | null; basis: string }

/**
 * The expected price movement from the expiring year's record: claims against earned premium,
 * and the exposure change (heads, else endorsement premium). Claims with no paid figure count
 * at the amount claimed, so an open large claim is not read as a clean year.
 */
export function priceCheck(c: PeriodFigures | null): PriceCheck {
  const premium = c ? (c.premium_inception ?? (c.premium_net || null)) : null
  if (!c || !premium || premium <= 0) return { flow: 'no_data', lossRatio: null, exposureShift: null, basis: 'No premium on file for the expiring year' }
  const incurred = Math.max(c.claims_paid, c.claims_paid > 0 ? 0 : c.claims_claimed)
  const earned = c.earned_premium > 0 ? c.earned_premium : premium
  const lossRatio = c.claims_count === 0 ? 0 : incurred > 0 ? incurred / earned : c.loss_ratio
  let exposureShift: number | null = null
  if (c.members_inception && c.members_now != null) exposureShift = (c.members_now - c.members_inception) / c.members_inception
  else if (c.endorsements_count > 0) exposureShift = c.endorsements_net / premium
  const shift = Math.abs(exposureShift ?? 0)
  const pct = (r: number) => `${Math.round(r * 100)}%`
  const parts = [lossRatio == null ? `${c.claims_count} claims, amounts not on file` : `loss ratio ${pct(lossRatio)}`, exposureShift == null ? null : `exposure ${exposureShift >= 0 ? '+' : ''}${pct(exposureShift)}`].filter(Boolean).join(', ')
  if (lossRatio == null) return { flow: 'adjust', lossRatio, exposureShift, basis: parts }
  if (lossRatio > INCREASE_ABOVE) return { flow: 'increase', lossRatio, exposureShift, basis: parts }
  if (lossRatio < HOLD_BELOW && shift <= EXPOSURE_SHIFT) return { flow: 'hold', lossRatio, exposureShift, basis: parts }
  return { flow: 'adjust', lossRatio, exposureShift, basis: parts }
}

export const FLOW_LABEL: Record<RenewalFlow, string> = { hold: 'Hold', adjust: 'Adjust', increase: 'Increase', no_data: 'No data' }

/** The next action the flow sets on the renewal case at 90 days. */
export function flowAction(flow: RenewalFlow, insurer: string | null): string {
  const who = insurer?.trim() || 'the insurer'
  switch (flow) {
    case 'hold': return `Ask ${who} for renewal terms on the same basis`
    case 'adjust': return `Ask ${who} and two other insurers for renewal terms`
    case 'increase': return `Ask the full panel for renewal terms; tell the client an increase is likely`
    case 'no_data': return `Ask ${who} for renewal terms and the claims experience`
  }
}
