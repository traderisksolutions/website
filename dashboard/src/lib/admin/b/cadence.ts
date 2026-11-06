/**
 * The one cadence table every chaser reads. Pure.
 *
 * As Nathan keeps it (read from 1,192 of his sent emails, 2 Nov 2026): an insurer is chased after
 * five working days, a client after a calendar week; inside the last week before a deadline every
 * two days, and inside the last five days the chase asks for the answer today. Three chases, then
 * a person calls. Signed forms, slips and letters are chased every six days.
 *
 * Read by the work-item chaser (sweeps.ts), the placement dispatch chase (placement/position.ts),
 * the member-movement chase (policies/movement-flow.ts) and the endorsement batch chase
 * (endorsements/rules.ts). Change a number here and every chaser follows.
 */
import { addDays, isoDay, isWorkingDay, rollToWorkingDay } from './dates'

export const CHASE_AFTER_WORKING_DAYS = 5
export const CHASE_CLIENT_AFTER_DAYS = 7
export const NEAR_DEADLINE_DAYS = 7
export const NEAR_DEADLINE_EVERY = 2
export const URGENT_DAYS = 5
export const MAX_CHASES = 3
export const DOCUMENT_CHASE_DAYS = 6
/** A request to an insurer with no answer is chased at this many calendar days: five working days. */
export const INSURER_CHASE_CALENDAR_DAYS = 7

const DAY = 86_400_000

export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from.getTime())
  let left = days
  while (left > 0) {
    d.setTime(d.getTime() + DAY)
    if (isWorkingDay(d.toISOString())) left--
  }
  return d
}

/**
 * When an email with no answer is due a chase. An insurer: five working days. A client: seven days,
 * moved on to the next working day when that lands on a weekend or public holiday.
 */
export function chaseDueOn(sentAt: string, side: 'client' | 'insurer'): string {
  const singapore = new Date(Date.parse(sentAt) + 8 * 3_600_000)
  if (side === 'insurer') return isoDay(addWorkingDays(singapore, CHASE_AFTER_WORKING_DAYS))
  return rollToWorkingDay(addDays(isoDay(singapore), CHASE_CLIENT_AFTER_DAYS))
}

/** When an insurer that has not answered is next chased: five working days from now, every time. */
export function nextInsurerChase(from: Date): Date {
  return addWorkingDays(from, CHASE_AFTER_WORKING_DAYS)
}
