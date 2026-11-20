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

/** "24 Dec 14:05", Singapore time: a message within the matter at hand, where the year is known. */
export function fmtDayTime(iso: string | null | undefined, empty = DASH): string {
  const d = asDate(iso)
  if (!d) return empty
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: SG }).format(d)
  return `${fmtDay(iso)} ${time}`
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

/** "Talent Trader Group Pte Ltd" and "TALENT TRADERS GROUP PTE. LTD" are one company. Client-safe. */
export function companyKey(name: string | null | undefined): string {
  return String(name ?? '').toLowerCase()
    .replace(/\b(pte|ltd|limited|private|sdn|bhd|berhad|llp|inc|co|company|the|group|holdings?|singapore|sg)\b\.?/g, ' ')
    .replace(/s\b/g, '').replace(/[^a-z0-9]+/g, '')
}

// Folded in from lib/crm/format.ts (20 Nov 2026): one formatting module.

export function fmtMoney(amount: number | null | undefined, currency = 'SGD', opts: { compact?: boolean } = {}): string {
  const n = Number(amount ?? 0)
  if (opts.compact && Math.abs(n) >= 10_000) {
    return `${currency} ${(n / 1000).toLocaleString('en-SG', { maximumFractionDigits: 1 })}k`
  }
  return `${currency} ${n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** "3 days ago", "in 12 days", "today". Rounds to the nearest whole day. */
export function fmtRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diffDays = Math.round((d.getTime() - now.getTime()) / 86_400_000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays === -1) return 'yesterday'
  if (diffDays > 0) return diffDays < 30 ? `in ${diffDays} days` : fmtDate(iso)
  return diffDays > -30 ? `${-diffDays} days ago` : fmtDate(iso)
}

/** Today's calendar date in Singapore as YYYY-MM-DD, independent of the server's timezone. */
export function todaySGT(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function personName(first: string | null | undefined, last: string | null | undefined, email?: string | null): string {
  const n = [first, last].filter(Boolean).join(' ').trim()
  return n || email || 'Unknown'
}

export function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z ]/g, '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
