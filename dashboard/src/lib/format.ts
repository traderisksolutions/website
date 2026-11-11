/**
 * Money, numbers, dates and elapsed time, written once.
 *
 * Before 11 Nov 2026 `money` was written in 31 files, `fmtDate` in 16 and `timeAgo` in 7, each a
 * little different. These are the versions every screen uses. Dates are Singapore time whatever
 * the runtime's clock: a page rendered on the server at 02:00 SGT is still dated today.
 *
 * Client-safe: no server imports.
 */

export const DASH = '—'

const SG = 'Asia/Singapore'

/** "S$1,234.00"; another currency as "USD 1,234.00"; a negative keeps its sign; null is a dash. */
export function money(n: number | null | undefined, opts: { ccy?: string | null; dp?: number; empty?: string } = {}): string {
  const { ccy = 'SGD', dp = 2, empty = DASH } = opts
  if (n == null || !Number.isFinite(Number(n))) return empty
  const v = Number(n)
  const abs = Math.abs(v).toLocaleString('en-SG', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  const sign = v < 0 ? '-' : ''
  const code = (ccy || 'SGD').toUpperCase()
  return code === 'SGD' ? `${sign}S$${abs}` : `${sign}${code} ${abs}`
}

/** "1,234.50": thousands separators, fixed decimals, no currency. */
export function num(n: number | null | undefined, dp = 2, empty = DASH): string {
  if (n == null || !Number.isFinite(Number(n))) return empty
  return Number(n).toLocaleString('en-SG', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

function asDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "24 Dec 2026", Singapore time. */
export function fmtDate(iso: string | null | undefined, empty = DASH): string {
  const d = asDate(iso)
  return d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: SG }).format(d) : empty
}

/** "24 Dec", Singapore time. */
export function fmtDay(iso: string | null | undefined, empty = DASH): string {
  const d = asDate(iso)
  return d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: SG }).format(d) : empty
}

/** "24 Dec 2026 14:05", Singapore time. */
export function fmtDateTime(iso: string | null | undefined, empty = DASH): string {
  const d = asDate(iso)
  if (!d) return empty
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: SG }).format(d)
  return `${fmtDate(iso)} ${time}`
}

/** "just now", "5m ago", "3h ago", "2d ago", then the date ("24 Dec"). */
export function timeAgo(iso: string | null | undefined, empty = DASH, now = Date.now()): string {
  const d = asDate(iso)
  if (!d) return empty
  const m = Math.floor((now - d.getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return fmtDay(iso)
}
