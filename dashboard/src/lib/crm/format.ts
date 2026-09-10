/** Client-safe formatting helpers shared by every CRM screen. No server imports here. */

export function fmtMoney(amount: number | null | undefined, currency = 'SGD', opts: { compact?: boolean } = {}): string {
  const n = Number(amount ?? 0)
  if (opts.compact && Math.abs(n) >= 10_000) {
    return `${currency} ${(n / 1000).toLocaleString('en-SG', { maximumFractionDigits: 1 })}k`
  }
  return `${currency} ${n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
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
