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

/** YYYY-MM-DD for a date read day-first or ISO; null when it cannot be read without guessing. */
export function toIsoDate(raw: string | null | undefined): string | null {
  const d = parseCalendarDate(raw)
  return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null
}


/** "Sept" and "September" as well as "Sep"; anything else that is not a month is null. */
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december']
function monthOf(word: string): number | null {
  // A real month name or an abbreviation of one, at least three letters: "Jun", "June", "Sept".
  // "Junk" is not June.
  const w = word.toLowerCase()
  if (w.length < 3) return null
  const i = MONTH_NAMES.findIndex(n => n.startsWith(w))
  return i >= 0 ? i + 1 : null
}

/**
 * A date printed on an insurance document — a debit note, a schedule, a policy — read the way
 * Singapore insurers print them: "2-Jun-26", "02 June 2026", "02/06/2026", "2026-06-02".
 *
 * Broader than parseCalendarDate, which is for dates of birth: a document date may carry a month
 * name, and a two-digit year on a document is this century ("26" is 2026), which is not true of a
 * year of birth. Still never month-first: 02/06/2026 is the 2nd of June.
 */
export function parseDocumentDate(raw: string | null | undefined): CalendarDate | null {
  const s = String(raw ?? '').trim().replace(/,/g, ' ').replace(/\s+/g, ' ')
  if (!s) return null
  const strict = parseCalendarDate(s)
  if (strict) return strict
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))
  // 02/06/26, 2-6-26: day first, two-digit year
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/)
  if (m) return valid(year(m[3]), +m[2], +m[1])
  // 2-Jun-26, 02 June 2026, 2 Jun 2026
  m = s.match(/^(\d{1,2})[\s/.-]([A-Za-z]{3,9})\.?[\s/.-](\d{2}|\d{4})$/)
  if (m) { const mo = monthOf(m[2]); if (mo) return valid(year(m[3]), mo, +m[1]) }
  // June 2 2026, Jun 2 26 — the month is spelled out, so the order is not in doubt
  m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}) (\d{2}|\d{4})$/)
  if (m) { const mo = monthOf(m[1]); if (mo) return valid(year(m[3]), mo, +m[2]) }
  return null
}

export function toIsoDocumentDate(raw: string | null | undefined): string | null {
  const d = parseDocumentDate(raw)
  return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null
}
