/**
 * One definition of "how soon is this renewal", shared by the Companies table, the company
 * drawer and the Calendar, so the same policy is never called two different things.
 *
 * Buckets are mutually exclusive and labelled as bands so nobody has to guess whether
 * "30 days" includes the first week. Dates are plain YYYY-MM-DD in Singapore time.
 */

export type RenewalBucket =
  | 'overdue' | 'within_7' | 'within_30' | 'within_60' | 'within_90' | 'beyond_90' | 'no_date' | 'renewed'

export const RENEWAL_BUCKETS: RenewalBucket[] = ['overdue', 'within_7', 'within_30', 'within_60', 'within_90', 'beyond_90', 'no_date']

export const RENEWAL_LABEL: Record<RenewalBucket, string> = {
  overdue:   'Overdue',
  within_7:  '0–7 days',
  within_30: '8–30 days',
  within_60: '31–60 days',
  within_90: '61–90 days',
  beyond_90: 'Beyond 90 days',
  no_date:   'No renewal date',
  renewed:   'Renewed',
}

/** The short form for a badge in a table cell; the tooltip carries the long form. */
export const RENEWAL_SHORT: Record<RenewalBucket, string> = {
  overdue: 'Overdue', within_7: '7d', within_30: '30d', within_60: '60d', within_90: '90d', beyond_90: '90d+', no_date: 'No date', renewed: 'Renewed',
}

export type RenewalTone = 'red' | 'orange' | 'amber' | 'blue' | 'green' | 'neutral'
export const RENEWAL_TONE: Record<RenewalBucket, RenewalTone> = {
  overdue: 'red', within_7: 'red', within_30: 'orange', within_60: 'amber', within_90: 'amber', beyond_90: 'neutral', no_date: 'neutral', renewed: 'green',
}

export function daysBetweenIso(from: string, to: string): number {
  const [y1, m1, d1] = from.slice(0, 10).split('-').map(Number)
  const [y2, m2, d2] = to.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

export function renewalBucket(renewalDate: string | null | undefined, today: string, status?: string | null): RenewalBucket {
  if (status === 'renewed') return 'renewed'
  if (!renewalDate) return 'no_date'
  const d = daysBetweenIso(today, renewalDate)
  if (d < 0) return 'overdue'
  if (d <= 7) return 'within_7'
  if (d <= 30) return 'within_30'
  if (d <= 60) return 'within_60'
  if (d <= 90) return 'within_90'
  return 'beyond_90'
}

/** "Due tomorrow", "Due in 94 days", "12 days overdue". */
export function renewalText(renewalDate: string | null | undefined, today: string): string {
  if (!renewalDate) return 'No renewal date'
  const d = daysBetweenIso(today, renewalDate)
  if (d < -1) return `${-d} days overdue`
  if (d === -1) return '1 day overdue'
  if (d === 0) return 'Due today'
  if (d === 1) return 'Due tomorrow'
  return `Due in ${d} days`
}

/**
 * The cumulative filters a person actually reaches for: "everything due within 30 days"
 * includes the 7-day band. The tab strip on Companies uses these; the bands above are for
 * labelling a single policy.
 */
export type RenewalWindow = 'all' | 'w90' | 'w60' | 'w30' | 'w7' | 'overdue' | 'none'
export const RENEWAL_WINDOWS: { key: RenewalWindow; label: string; hint: string }[] = [
  { key: 'all',     label: 'All policies',     hint: 'Every client, whatever the renewal date' },
  { key: 'w90',     label: 'Within 90 days',   hint: 'Due today through 90 calendar days from today' },
  { key: 'w60',     label: 'Within 60 days',   hint: 'Due today through 60 calendar days from today' },
  { key: 'w30',     label: 'Within 30 days',   hint: 'Due today through 30 calendar days from today' },
  { key: 'w7',      label: 'Within 7 days',    hint: 'Due today through 7 calendar days from today' },
  { key: 'overdue', label: 'Overdue',          hint: 'Renewal date has passed and the policy is not marked renewed' },
  { key: 'none',    label: 'No renewal date',  hint: 'No policy on file with an end date' },
]

export function inRenewalWindow(renewalDate: string | null | undefined, today: string, w: RenewalWindow): boolean {
  if (w === 'all') return true
  if (w === 'none') return !renewalDate
  if (!renewalDate) return false
  const d = daysBetweenIso(today, renewalDate)
  if (w === 'overdue') return d < 0
  const max = w === 'w7' ? 7 : w === 'w30' ? 30 : w === 'w60' ? 60 : 90
  return d >= 0 && d <= max
}
