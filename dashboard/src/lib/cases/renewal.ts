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
import { lineKey, type RenewalMethod } from '@/lib/methods/method'

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

/** Defaults; the live values come from the renewal method admins edit (src/lib/methods/method.ts). */
export const HOLD_BELOW = 0.4
export const INCREASE_ABOVE = 0.6
export const EXPOSURE_SHIFT = 0.1

export type PriceCheck = { flow: RenewalFlow; lossRatio: number | null; exposureShift: number | null; basis: string; rules: string[] }
export type PriceContext = { client?: string | null; insurer?: string | null; line?: string | null }

const RANK: Record<RenewalFlow, number> = { no_data: 0, hold: 1, adjust: 2, increase: 3 }
const raise = (a: RenewalFlow, b: RenewalFlow): RenewalFlow => (a === 'no_data' && b !== 'increase' ? (b === 'hold' ? 'no_data' : b) : RANK[b] > RANK[a] ? b : a)

/**
 * The expected price movement from the expiring year's record, then the method's overrides.
 *  - No premium on file: no data.
 *  - No claims on file: unknown (no data) unless the method says a blank register counts as clean,
 *    because TRS's claims register is incomplete and a missing claim is not a clean year.
 *  - Claims on file with no amount: adjust, never hold.
 *  - Loss ratio (paid, else claimed, over earned premium) against the method's two thresholds;
 *    heads, else endorsement premium, against its exposure threshold.
 *  - Then: an insurer and market note for this insurer and line can raise the flow; a client or
 *    line the method always takes to market is at least adjust.
 */
export function priceCheck(c: PeriodFigures | null, m: Pick<RenewalMethod, 'holdBelow' | 'increaseAbove' | 'exposureShift' | 'noClaimsUnknown' | 'marketClients' | 'marketLines' | 'insurerNotes'> = DEFAULT_THRESHOLDS, ctx: PriceContext = {}): PriceCheck {
  const rules: string[] = []
  const pctS = (r: number) => `${Math.round(r * 100)}%`
  const premium = c ? (c.premium_inception ?? (c.premium_net || null)) : null
  let flow: RenewalFlow
  let lossRatio: number | null = null
  let exposureShift: number | null = null
  const parts: string[] = []
  if (!c || !premium || premium <= 0) {
    flow = 'no_data'; parts.push('no premium on file for the expiring year')
  } else {
    if (c.members_inception && c.members_now != null) exposureShift = (c.members_now - c.members_inception) / c.members_inception
    else if (c.endorsements_count > 0) exposureShift = c.endorsements_net / premium
    const shift = Math.abs(exposureShift ?? 0)
    const earned = c.earned_premium > 0 ? c.earned_premium : premium
    const incurred = c.claims_paid > 0 ? c.claims_paid : c.claims_claimed
    const xp = c.insurer_experience
    if (xp && (xp.loss_ratio != null || xp.claims_paid != null || xp.claims_reserve != null || xp.claims_count === 0)) {
      // The insurer's own statement outranks TRS's register: paid plus reserve over premium.
      const xpIncurred = (xp.claims_paid ?? 0) + (xp.claims_reserve ?? 0)
      lossRatio = xp.loss_ratio ?? (xp.claims_count === 0 ? 0 : xpIncurred / premium)
      parts.push(`insurer's claims experience${xp.as_of ? ` of ${xp.as_of}` : ''}: loss ratio ${pctS(lossRatio)}`)
    } else if (c.claims_count === 0) {
      lossRatio = m.noClaimsUnknown ? null : 0
      parts.push(m.noClaimsUnknown ? 'no claims on file, claims experience not confirmed' : 'no claims on file, read as clean')
    } else if (incurred > 0) {
      lossRatio = incurred / earned
      parts.push(`loss ratio ${pctS(lossRatio)}`)
    } else parts.push(`${c.claims_count} claim${c.claims_count === 1 ? '' : 's'} on file with no amount`)
    if (exposureShift != null) parts.push(`exposure ${exposureShift >= 0 ? '+' : ''}${pctS(exposureShift)}`)
    if (!xp && c.claims_count > 0 && lossRatio == null) { flow = 'adjust'; rules.push('a claim with no amount is never read as a clean year') }
    else if (lossRatio == null) flow = shift > m.exposureShift ? 'adjust' : 'no_data'
    else if (lossRatio > m.increaseAbove) { flow = 'increase'; rules.push(`loss ratio over ${pctS(m.increaseAbove)}`) }
    else if (lossRatio < m.holdBelow && shift <= m.exposureShift) { flow = 'hold'; rules.push(`loss ratio under ${pctS(m.holdBelow)} and exposure within ${pctS(m.exposureShift)}`) }
    else { flow = 'adjust'; rules.push('between the thresholds, or exposure moved') }
  }
  const line = lineKey(ctx.line)
  const insurer = (ctx.insurer ?? '').toLowerCase()
  for (const n of m.insurerNotes) {
    if (!insurer.includes(n.insurer.toLowerCase().split(' ')[0]) || (n.line && line && n.line !== line)) continue
    const before = flow
    flow = n.effect === 'increase' ? raise(flow, 'increase') : n.effect === 'adjust' ? raise(flow, 'adjust') : flow
    if (flow !== before) rules.push(`market note: ${n.insurer} ${n.line}: ${n.note || n.effect}`)
  }
  const client = (ctx.client ?? '').toLowerCase()
  const market = (line && m.marketLines.includes(line)) || m.marketClients.some(x => x && client.includes(x.toLowerCase()))
  if (market && RANK[flow] < RANK.adjust) { flow = 'adjust'; rules.push('always taken to market') }
  return { flow, lossRatio, exposureShift, basis: parts.join(', '), rules }
}

const DEFAULT_THRESHOLDS = { holdBelow: HOLD_BELOW, increaseAbove: INCREASE_ABOVE, exposureShift: EXPOSURE_SHIFT, noClaimsUnknown: true, marketClients: [] as string[], marketLines: [] as string[], insurerNotes: [] as RenewalMethod['insurerNotes'] }

export const FLOW_LABEL: Record<RenewalFlow, string> = { hold: 'Hold', adjust: 'Adjust', increase: 'Increase', no_data: 'No data' }

/** The next action the flow sets on the renewal case at 90 days. */
export function flowAction(flow: RenewalFlow, insurer: string | null): string {
  const who = insurer?.trim() || 'the insurer'
  switch (flow) {
    case 'hold': return `Ask ${who} for renewal terms on the same basis`
    case 'adjust': return `Ask ${who} and two other insurers for renewal terms`
    case 'increase': return `Ask the full panel for renewal terms; tell the client an increase is likely`
    case 'no_data': return `Ask ${who} for renewal terms and the claims experience; no claims record to judge the price`
  }
}
