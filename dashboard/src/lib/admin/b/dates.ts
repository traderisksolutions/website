/** Date helpers for the Phase B agents. Plain YYYY-MM-DD strings in Singapore time. Pure. */

export const isoDay = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10)

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso.slice(0, 10)) + n * 86_400_000).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000)
}

/**
 * Monday to Friday between two dates, not counting `from`. Public holidays are not removed, so a
 * chase can come one day early in a holiday week; the person approving it sees the dates.
 */
export function workingDaysBetween(from: string, to: string): number {
  const start = Date.parse(from.slice(0, 10)), end = Date.parse(to.slice(0, 10))
  if (!(end > start)) return 0
  let n = 0
  for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
    const wd = new Date(t).getUTCDay()
    if (wd !== 0 && wd !== 6) n++
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
