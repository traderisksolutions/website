/**
 * Dates of birth, read the way Singapore writes them.
 *
 * Every age in the quoting engines used to come from `new Date(dob)`. JavaScript reads a slash
 * date month-first, and Singapore writes it day-first, so a census row of 24/12/1971 became
 * "month 24" — invalid — and 12/09/1972 became 9 December. On the Gembridge quotation that
 * dropped 10 of 15 members from the total with no more than a count in the footer, and priced two
 * of the rest a year off: S$9,184.34 stored against S$29,155.70 priced correctly.
 *
 * This reads ISO dates (2026-10-01) and day-first dates (24/12/1971, 24-12-1971, 24.12.1971), and
 * nothing else. A month-first date is not guessed at: 12/09/1972 is the 12th of September. A
 * two-digit year is refused rather than pivoted, because a birth year is exactly where "72" is
 * ambiguous. An impossible date — 31/02/1980 — is refused rather than rolled into March.
 */

export type CalendarDate = { y: number; m: number; d: number }

function valid(y: number, m: number, d: number): CalendarDate | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()   // day 0 of next month = last of this
  return d <= days ? { y, m, d } : null
}

export function parseCalendarDate(raw: string | null | undefined): CalendarDate | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  // ISO, optionally with a time part: 1971-12-24, 1971-12-24T00:00:00Z
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (m) return valid(+m[1], +m[2], +m[3])
  // Day first, with / - or . between: 24/12/1971
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return valid(+m[3], +m[2], +m[1])
  return null
}

/** Completed years on `on` — age last birthday. */
export function ageLastBirthday(dob: CalendarDate, on: CalendarDate): number {
  let age = on.y - dob.y
  if (on.m < dob.m || (on.m === dob.m && on.d < dob.d)) age -= 1
  return age
}

/** Today in Singapore, as a calendar date. The server clock is UTC, up to 8 hours behind. */
export function todaySGT(): CalendarDate {
  const t = new Date(Date.now() + 8 * 3600_000)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

export function fromDate(dt: Date): CalendarDate {
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() }
}
