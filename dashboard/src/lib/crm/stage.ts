/**
 * Lifecycle rules. The stage is stored on the company and moved by staff (or by a small set of
 * system events); this module only *suggests* a stage from the facts we hold, so the pipeline
 * can show "suggested: client" without ever moving a card by itself.
 */
import type { Stage } from './types'
import { STAGES } from './types'
import { daysBetween, todaySGT } from './format'

export interface StageFacts {
  activePolicies: number
  nextRenewalDate: string | null
  openQuotes: number
  openThreads: number
  lastActivityAt: string | null
  openDebitNotes: number
}

const RENEWAL_WINDOW_DAYS = 60
const LAPSED_AFTER_DAYS   = 180

export function suggestStage(f: StageFacts, current: Stage, today = todaySGT()): Stage | null {
  let suggested: Stage
  if (f.activePolicies > 0 || f.openDebitNotes > 0) {
    const days = f.nextRenewalDate ? daysBetween(today, f.nextRenewalDate) : null
    suggested = days !== null && days >= 0 && days <= RENEWAL_WINDOW_DAYS ? 'renewal_due' : 'client'
  } else if (f.openQuotes > 0) {
    suggested = 'quoting'
  } else if (f.openThreads > 0) {
    const quietDays = f.lastActivityAt ? daysBetween(f.lastActivityAt.slice(0, 10), today) : 0
    suggested = quietDays > LAPSED_AFTER_DAYS && (current === 'client' || current === 'renewal_due') ? 'lapsed' : 'prospect'
  } else {
    suggested = current === 'client' || current === 'renewal_due' ? 'lapsed' : 'lead'
  }
  // A lapsed client that comes back is still a client — do not suggest going backwards to lead.
  if ((current === 'client' || current === 'renewal_due') && (suggested === 'lead' || suggested === 'prospect')) return null
  return suggested === current ? null : suggested
}

export function isStage(v: unknown): v is Stage {
  return typeof v === 'string' && (STAGES as readonly string[]).includes(v)
}
