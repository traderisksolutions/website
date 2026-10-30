/**
 * Rates, shares and brokerage on a quote, and whether the premium is the rate on its base.
 * Construction and property insurers quote "0.0575% on the sum insured" and a share "72.5% of
 * 100%"; a premium that is not rate × base is a typo somewhere (Dover Drive: S$10M off). Pure.
 */

/** "0.0575%" → 0.0575; "72.50% of 100%" → 72.5; "12.5" → 12.5. The first percentage written. */
export function parsePct(text: string | null | undefined): number | null {
  if (!text) return null
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*%/) ?? text.replace(/,/g, '').match(/^\s*(\d+(?:\.\d+)?)\s*$/)
  return m ? Number(m[1]) : null
}

/** Within 1% or S$1 of rate × base counts as the same figure. */
export const RATE_TOLERANCE = 0.01

export function rateCheck(i: { ratePct: number | null; base: number | null; premium: number | null }): { expected: number | null; check: 'ok' | 'mismatch' | null } {
  if (i.ratePct == null || i.base == null || i.premium == null || i.base <= 0) return { expected: null, check: null }
  const expected = Math.round(i.base * i.ratePct) / 100
  const ok = Math.abs(i.premium - expected) <= Math.max(1, expected * RATE_TOLERANCE)
  return { expected, check: ok ? 'ok' : 'mismatch' }
}

/** 'lead' / 'follow' as an insurer writes it ("lead 30%", "follow lead terms", "co-share"). */
export function roleOf(text: string | null | undefined): 'lead' | 'follow' | null {
  if (!text) return null
  if (/\blead(?:ing|er)?\b/i.test(text) && !/follow|subject to (?:the )?lead/i.test(text)) return 'lead'
  if (/follow|co-?share|co-?insur|subject to (?:the )?lead|\bri\b|reinsur/i.test(text)) return 'follow'
  return null
}
