/**
 * The Company page's facts line and rail figures, from the company's policies. Pure; tested in
 * src/__tests__/company-facts.test.ts.
 */
type P = { label: string | null; product_line: string | null; lifecycle: string; start_date: string | null; end_date: string | null; renewal_date: string | null; currency: string; premium: number | null }

const HELD = new Set(['live', 'bound', 'renewal_due'])
/** A renewal shows on the rail this many days ahead. */
export const RENEWAL_WINDOW_DAYS = 60

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export type CompanyFacts = {
  /** Policies held today: live, bound or renewal due. */
  held: number
  /** Sum of held policies' premium, SGD only; null when none carries one. */
  annualPremium: number | null
  /** Earliest start date of any policy, YYYY-MM-DD. */
  clientSince: string | null
  /** Held policies ending within RENEWAL_WINDOW_DAYS, soonest first. */
  renewals: { label: string; date: string; days: number }[]
}

export function companyFacts(policies: P[], today: string): CompanyFacts {
  const held = policies.filter(p => HELD.has(p.lifecycle))
  const sgd = held.filter(p => p.currency === 'SGD' && p.premium != null)
  const starts = policies.map(p => p.start_date).filter((d): d is string => !!d).sort()
  const renewals = held
    .map(p => ({ label: p.label ?? p.product_line ?? 'Policy', date: p.renewal_date ?? p.end_date }))
    .filter((r): r is { label: string; date: string } => !!r.date)
    .map(r => ({ ...r, days: days(today, r.date) }))
    .filter(r => r.days >= 0 && r.days <= RENEWAL_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days)
  return {
    held: held.length,
    annualPremium: sgd.length ? sgd.reduce((s, p) => s + (p.premium ?? 0), 0) : null,
    clientSince: starts[0] ?? null,
    renewals,
  }
}
