/**
 * Renewals › Forecast, release 2 (docs/renewals.md). Pure and browser-safe; tested in
 * __tests__/forecast.test.ts.
 *
 * Each item is one policy term expiring: a renewal record, or a renewable policy whose record has
 * not opened yet (it counts as Open). Months run from the current month for 12 months.
 *
 *   Due     every item expiring in the month
 *   Won     closed as Renewed;  Lost  closed as Lost;  Open  the rest
 *   Gross retention   renewed expiring premium ÷ due expiring premium, for a month with nothing open
 */

export type ForecastItem = {
  expiry: string; premium: number | null; commission: number | null
  outcome: 'renewed' | 'lost' | null; line_code: string | null; owner: string | null
}
export type Sums = { count: number; premium: number; commission: number }
export type ForecastMonth = { month: string; due: Sums; won: Sums; open: Sums; lost: Sums; closed: boolean; retention: number | null }
export type Forecast = { months: ForecastMonth[]; total: Omit<ForecastMonth, 'month' | 'closed'> }

export const FORECAST_MONTHS = 12

/** 'YYYY-MM' for the month of today and the n − 1 after it. */
export function monthsFrom(today: string, n = FORECAST_MONTHS): string[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m + i, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

const zero = (): Sums => ({ count: 0, premium: 0, commission: 0 })
const r2 = (x: number) => Math.round(x * 100) / 100
function add(s: Sums, i: ForecastItem) {
  s.count++
  s.premium = r2(s.premium + (i.premium ?? 0))
  s.commission = r2(s.commission + (i.commission ?? 0))
}
const ratio = (won: number, due: number): number | null => (due > 0 ? Math.round((won / due) * 1000) / 1000 : null)

export function forecast(items: readonly ForecastItem[], today: string, f: { line?: string | null; owner?: string | null } = {}): Forecast {
  const months = monthsFrom(today)
  const by = new Map(months.map(m => [m, { month: m, due: zero(), won: zero(), open: zero(), lost: zero(), closed: false, retention: null as number | null }]))
  for (const i of items) {
    if (f.line && (f.line === 'none' ? i.line_code : i.line_code !== f.line)) continue
    if (f.owner && (f.owner === 'none' ? i.owner : i.owner !== f.owner.toLowerCase())) continue
    const row = by.get(i.expiry.slice(0, 7))
    if (!row) continue
    add(row.due, i)
    add(i.outcome === 'renewed' ? row.won : i.outcome === 'lost' ? row.lost : row.open, i)
  }
  const out = months.map(m => {
    const row = by.get(m)!
    row.closed = row.due.count > 0 && row.open.count === 0
    row.retention = row.closed ? ratio(row.won.premium, row.due.premium) : null
    return row
  })
  const total = { due: zero(), won: zero(), open: zero(), lost: zero(), retention: null as number | null }
  let closedWon = 0, closedDue = 0
  for (const row of out) {
    for (const k of ['due', 'won', 'open', 'lost'] as const) {
      total[k].count += row[k].count
      total[k].premium = r2(total[k].premium + row[k].premium)
      total[k].commission = r2(total[k].commission + row[k].commission)
    }
    if (row.closed) { closedWon += row.won.premium; closedDue += row.due.premium }
  }
  total.retention = ratio(closedWon, closedDue)
  return { months: out, total }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** '2027-05' → 'May 2027'; short → 'May 27'. */
export const monthName = (month: string, short = false): string =>
  `${MON[Number(month.slice(5, 7)) - 1] ?? month} ${short ? month.slice(2, 4) : month.slice(0, 4)}`
/** A bar's label: 155,415 → '155k', 8,029 → '8.0k', 97 → '97'. */
export const barLabel = (n: number): string =>
  n >= 100_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
/** 0.912 → '91.2%'. */
export const pct = (x: number | null): string => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
