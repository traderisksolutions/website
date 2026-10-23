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
