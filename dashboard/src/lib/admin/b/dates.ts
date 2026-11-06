/** Date helpers for the Phase B agents. Plain YYYY-MM-DD strings in Singapore time. Pure. */

export const isoDay = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10)

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso.slice(0, 10)) + n * 86_400_000).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000)
}

/**
 * Singapore public holidays that fall on a working day, with the Monday off when one falls on a
 * Sunday. From MOM's lists; the Hari Raya dates stay provisional until MOM confirms them.
 * Add each new year when MOM publishes it (June of the year before).
 */
export const SG_PUBLIC_HOLIDAYS = new Set([
  '2026-01-01', '2026-02-17', '2026-02-18', '2026-04-03', '2026-05-01', '2026-05-27', '2026-06-01', '2026-08-10', '2026-11-09', '2026-12-25',
  '2027-01-01', '2027-02-08', '2027-03-10', '2027-03-26', '2027-05-17', '2027-05-20', '2027-08-09', '2027-10-28',
])

/** Monday to Friday, not a Singapore public holiday. */
export function isWorkingDay(iso: string): boolean {
  const day = iso.slice(0, 10)
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay()
  return wd !== 0 && wd !== 6 && !SG_PUBLIC_HOLIDAYS.has(day)
}

/** The date itself when it is a working day, otherwise the next one. */
export function rollToWorkingDay(iso: string): string {
  let day = iso.slice(0, 10)
  while (!isWorkingDay(day)) day = addDays(day, 1)
  return day
}

/** Working days between two dates, not counting `from`. */
export function workingDaysBetween(from: string, to: string): number {
  const start = Date.parse(from.slice(0, 10)), end = Date.parse(to.slice(0, 10))
  if (!(end > start)) return 0
  let n = 0
  for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
    if (isWorkingDay(new Date(t).toISOString())) n++
  }
  return n
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

/** Reads one written date: 18/09/2026, 18-9-26, 2026-09-18, 18 Sep 2026, Sep 18, 2026. Day first, as in Singapore. */
export function parseWrittenDate(s: string): string | null {
  const t = s.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1')
  let y: number, m: number, d: number
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (r) { y = +r[1]; m = +r[2]; d = +r[3] }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t))) { d = +r[1]; m = +r[2]; y = +r[3] }
  else if ((r = /^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{2,4})/.exec(t)) && MONTHS[r[2].slice(0, 3)]) { d = +r[1]; m = MONTHS[r[2].slice(0, 3)]; y = +r[3] }
  else if ((r = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})/.exec(t)) && MONTHS[r[1].slice(0, 3)]) { m = MONTHS[r[1].slice(0, 3)]; d = +r[2]; y = +r[3] }
  else return null
  if (y < 100) y += 2000
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return new Date(iso).toISOString().slice(0, 10) === iso ? iso : null
}
