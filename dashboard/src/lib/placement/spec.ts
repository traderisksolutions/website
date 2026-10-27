import { SPEC_KEYS, SPEC_LABEL, type Spec } from './types'

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '').replace(/\s+/g, ' ')

/** A spec with blank fields dropped and whitespace normalised, so two specs compare by content. */
export function normaliseSpec(raw: unknown): Spec {
  const out: Spec = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of SPEC_KEYS) {
    const v = clean((raw as Record<string, unknown>)[k])
    if (v) out[k] = v
  }
  return out
}

export type SpecChange = { field: keyof Spec; label: string; from: string | null; to: string | null }

/** Field-by-field difference between two specs. Empty when nothing changed. */
export function specDiff(prev: Spec, next: Spec): SpecChange[] {
  const a = normaliseSpec(prev), b = normaliseSpec(next)
  const out: SpecChange[] = []
  for (const k of SPEC_KEYS) {
    const from = a[k] ?? null, to = b[k] ?? null
    if (from !== to) out.push({ field: k, label: SPEC_LABEL[k], from, to })
  }
  return out
}

/** "Limit: S$1M → S$2M; Excess: added S$5,000" — the change in one line, for the round and the log. */
export function describeChanges(changes: SpecChange[]): string {
  return changes.map(c => {
    if (c.from && c.to) return `${c.label}: ${c.from} → ${c.to}`
    if (c.to) return `${c.label}: added ${c.to}`
    return `${c.label}: removed (was ${c.from})`
  }).join('; ')
}

/** The spec as lines for an email or a prompt. Only filled fields appear. */
export function specLines(spec: Spec): string[] {
  const s = normaliseSpec(spec)
  return SPEC_KEYS.filter(k => s[k]).map(k => `${SPEC_LABEL[k]}: ${s[k]}`)
}

// ── Money read off a quote ──────────────────────────────────────────────────────────────────

const CURRENCY: [RegExp, string][] = [
  [/\bSGD\b|S\$/i, 'SGD'], [/\bUSD\b|US\$/i, 'USD'], [/\bMYR\b|RM\b/i, 'MYR'], [/\bIDR\b|Rp\b/i, 'IDR'],
  [/\bEUR\b|€/, 'EUR'], [/\bGBP\b|£/, 'GBP'], [/\bAUD\b|A\$/i, 'AUD'], [/\bHKD\b|HK\$/i, 'HKD'],
]

/**
 * "S$2,350.00 per annum (excl. GST)" → { amount: 2350, currency: 'SGD' }. A bare "$" is taken as
 * SGD, the firm's working currency. "1M" and "1.5m" read as millions, "500k" as thousands. Null
 * when no number can be read, never a guess.
 */
export function parseMoney(text: string | null | undefined, fallbackCurrency = 'SGD'): { amount: number; currency: string } | null {
  if (!text) return null
  const t = text.replace(/ /g, ' ')
  let currency: string | null = null
  for (const [re, code] of CURRENCY) if (re.test(t)) { currency = code; break }
  if (!currency && /\$/.test(t)) currency = fallbackCurrency
  const m = t.match(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(m|mil|million|k|thousand)?\b/i)
  if (!m) return null
  let amount = Number(m[1].replace(/,/g, '') + (m[2] ? `.${m[2]}` : ''))
  const unit = (m[3] ?? '').toLowerCase()
  if (unit.startsWith('m')) amount *= 1_000_000
  else if (unit === 'k' || unit === 'thousand') amount *= 1_000
  if (!Number.isFinite(amount)) return null
  return { amount, currency: currency ?? fallbackCurrency }
}
