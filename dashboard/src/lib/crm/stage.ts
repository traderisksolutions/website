/**
 * Lifecycle rules. The stage is stored on the company and moved by staff (or in bulk from the
 * pipeline); this module only *suggests* a stage from the facts we hold, so nothing ever moves
 * on its own.
 *
 * Being a client is evidenced by billing history or an active policy — not by owing money. A
 * client who pays every debit note on time is still a client. "Lapsed" therefore needs real
 * dormancy: no active policy, nothing billed for a long while, and no recent conversation.
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
  /** Debit notes still owing. Kept for callers, but never the sole proof of being a client. */
  openDebitNotes: number
  /** Any debit note ever raised, paid or not. */
  totalDebitNotes?: number
  /** Issue date (YYYY-MM-DD) of the most recent debit note, paid or not. */
  lastBillingDate?: string | null
}

const RENEWAL_WINDOW_DAYS = 60
/** No billing and no conversation for this long, with no active policy, reads as lapsed. */
const DORMANT_DAYS = 550

function dormant(f: StageFacts, today: string): boolean {
  if (f.activePolicies > 0) return false
  const billingAge  = f.lastBillingDate ? daysBetween(f.lastBillingDate, today) : Infinity
  const activityAge = f.lastActivityAt ? daysBetween(f.lastActivityAt.slice(0, 10), today) : Infinity
  return billingAge > DORMANT_DAYS && activityAge > DORMANT_DAYS
}

export function suggestStage(f: StageFacts, current: Stage, today = todaySGT()): Stage | null {
  const billed = (f.totalDebitNotes ?? f.openDebitNotes) > 0
  const isClient = f.activePolicies > 0 || billed

  let suggested: Stage
  if (isClient) {
    if (dormant(f, today)) suggested = 'lapsed'
    else {
      const days = f.nextRenewalDate ? daysBetween(today, f.nextRenewalDate) : null
      suggested = days !== null && days >= 0 && days <= RENEWAL_WINDOW_DAYS ? 'renewal_due' : 'client'
    }
  } else if (f.openQuotes > 0) {
    suggested = 'quoting'
  } else if (f.openThreads > 0) {
    suggested = dormant(f, today) && (current === 'client' || current === 'renewal_due') ? 'lapsed' : 'prospect'
  } else {
    suggested = current === 'client' || current === 'renewal_due' ? 'lapsed' : 'lead'
  }

  // A client that goes quiet is still a client — never suggest walking one back to lead or
  // prospect. Only genuine dormancy (handled above) may move it to lapsed.
  if ((current === 'client' || current === 'renewal_due') && (suggested === 'lead' || suggested === 'prospect')) return null
  return suggested === current ? null : suggested
}

export function isStage(v: unknown): v is Stage {
  return typeof v === 'string' && (STAGES as readonly string[]).includes(v)
}
