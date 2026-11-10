/**
 * Insurer names as brokers say them, and which insurers the dashboard prices.
 *
 * Rate tables carry the insurer's legal name ("QBE Insurance (Singapore) Pte Ltd"); a column header
 * or a picker wants "QBE". Local insurers are the five whose calculators are loaded: about 80% of
 * group benefits placements. Everyone else (Cigna, April) quotes on request, by email.
 */
const SHORT: [RegExp, string][] = [
  [/^aia\b/i, 'AIA'], [/^income\b/i, 'Income'], [/^qbe\b/i, 'QBE'],
  [/raffles/i, 'Raffles Health'], [/singapore life|singlife/i, 'Singlife'],
  [/cigna/i, 'Cigna'], [/^april\b/i, 'April'], [/zurich/i, 'Zurich'], [/^liberty\b/i, 'Liberty'],
]

export function shortInsurer(name: string | null | undefined): string {
  const s = (name ?? '').trim()
  for (const [re, short] of SHORT) if (re.test(s)) return short
  return s || 'Unknown insurer'
}

/**
 * Higher-tier plans quoted by email, one row each. Cigna Care Connect 1.0 and 2.0 are different
 * tiers with different benefit tables, so they are asked for separately.
 */
export type OnRequestPlan = { key: string; insurer: string; label: string; rates: string }
// Cigna Care Connect 1.0 left this list on 27 Oct 2026: its published 2025 rates are loaded as an
// approved rate table (Tier B), so the engine prices it like the five local insurers.
export const ON_REQUEST_PLANS: OnRequestPlan[] = [
  { key: 'cigna-ccc-2', insurer: 'Cigna', label: 'Cigna Care Connect 2.0', rates: 'On request' },
  { key: 'april-myhealth', insurer: 'April', label: 'April MyHEALTH', rates: 'On request' },
]

/** What derives a premium. Shown as a tooltip wherever a figure is priced (quotation, scenarios, plan builder). */
export const PRICE_DERIVATION = 'Each figure follows from five things. The census: each life\u2019s age on the insurer\u2019s age basis at the effective date (RCC age next birthday; Income, QBE, Singlife, AIA age last birthday), employee or dependant, occupation class for accident cover. The effective date and basis: they pick the rate card in force (QBE V11 before 2 Sep 2026, V12 from then for renewals). One plan per cover per category: hospital type, ward, limit tier, co-payment, sum assured. The insurer\u2019s rules: GST-inclusive cards (Income, AIA) netted at \u00f7 1.09, RCC\u2019s group-size factor on medical covers, renewal-only age bands, foreign-worker plans. Package size limits: above them (QBE 50, Income and Singlife 100 employees) the insurer quotes a custom rate and the card is not a price.'
