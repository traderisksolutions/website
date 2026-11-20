/**
 * The company Policies tab carries the renewals (the Renewals tab was folded in, 20 Nov 2026):
 * policies in force come first, the soonest end date first; the rest follow, newest start first.
 * Pure.
 */
const IN_FORCE = new Set(['bound', 'live', 'renewal_due'])

type P = { lifecycle: string; start_date?: string | null; end_date?: string | null }

export function byRenewal<T extends P>(policies: readonly T[]): T[] {
  return [...policies].sort((a, b) => {
    const fa = IN_FORCE.has(a.lifecycle) && !!a.end_date, fb = IN_FORCE.has(b.lifecycle) && !!b.end_date
    if (fa !== fb) return fa ? -1 : 1
    if (fa && fb) return String(a.end_date).localeCompare(String(b.end_date))
    return (b.start_date ?? b.end_date ?? '').localeCompare(a.start_date ?? a.end_date ?? '')
  })
}

/** "in 12 days", "today", "ended 3 days ago" for a policy in force; null otherwise. */
export function renewsIn(p: P, today: string): string | null {
  if (!IN_FORCE.has(p.lifecycle) || !p.end_date) return null
  const days = Math.round((Date.parse(p.end_date.slice(0, 10)) - Date.parse(today)) / 86_400_000)
  if (!Number.isFinite(days)) return null
  if (days === 0) return 'today'
  return days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `ended ${-days} day${days === -1 ? '' : 's'} ago`
}
