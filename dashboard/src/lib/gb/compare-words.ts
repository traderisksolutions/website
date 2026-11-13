/**
 * How the compare page and the client draft say a cover: in what it pays, never by plan number.
 * Pure, safe in the browser; tested in src/__tests__/gb-compare-cover.test.ts.
 */

/** An amount in a benefit cell: as charged is unlimited; "S$150/day (max 45 days)" is S$6,750. */
export function amountOf(t: string | null | undefined): number | null {
  if (!t) return null
  if (/as charged/i.test(t)) return Infinity
  const s = String(t).replace(/,/g, '')
  const per = s.match(/\$\s?(\d+(?:\.\d+)?)\s*\/\s*(?:day|visit)[^0-9]*(\d+)\s*(?:days|visits)/i)
  if (per) return Number(per[1]) * Number(per[2])
  const m = s.match(/\$\s?(\d+(?:\.\d+)?)\s*(k)?/i)
  return m ? Number(m[1]) * (m[2] ? 1000 : 1) : null
}

const sg = (t: string) => t.replace(/(^|[^S])\$/g, '$1S$')

/** A hospital plan in two parts: the ward ("Private 1-bed") and the limit ("S$150,000 a year · 20% co-insurance"). */
export function hospitalParts(b: Record<string, string>): { ward: string; limit: string } {
  const basis = /disab/i.test(b['ghs.limit_basis'] ?? '') ? 'per disability' : /annual/i.test(b['ghs.limit_basis'] ?? '') ? 'a year' : ''
  const lim = /as charged/i.test(b['ghs.annual_limit'] ?? '') ? 'As charged' : sg(b['ghs.annual_limit'] ?? '')
  const type = (b['ghs.hospital_type'] ?? '').replace(/Govt\/Restructured|Government\/Restructured|Restructured/i, 'Government')
  const co = b['ghs.copay'] && !/^0%|^nil/i.test(b['ghs.copay']) ? `${b['ghs.copay'].split(/[ (]/)[0]} co-insurance` : ''
  return { ward: `${type} ${b['ghs.room_board'] ?? ''}`.trim(), limit: [`${lim}${basis ? ` ${basis}` : ''}`.trim(), co].filter(Boolean).join(' · ') }
}

/** A cover in words: "Private 1-bed · S$200,000 a year", "No co-pay · non-panel S$35 / visit". */
export function coverWords(cover: string, plan: string, b: Record<string, string>): string {
  if (!plan) return 'None'
  if (cover === 'Hospital & Surgical') { const h = hospitalParts(b); return [h.ward, h.limit].filter(Boolean).join(' · ') }
  if (cover === 'Outpatient GP') return `${/nil|no co-pay/i.test(`${plan} ${b['gp.copay'] ?? ''}`) ? 'No co-pay' : `${sg(b['gp.copay'] ?? '')} co-pay`}${b['gp.nonpanel'] ? ` · non-panel ${sg(b['gp.nonpanel'])}` : ''}`
  const key: Record<string, string> = { 'Major Medical': 'gmm.annual_limit', 'Outpatient Specialist': 'sp.annual_limit', Dental: 'dental.annual_limit', 'Personal Accident': 'pa.death' }
  const v = b[key[cover]]
  return v ? sg(v) : plan
}

export type Change = { text: string; tone: 'up' | 'down' | 'same' }
/** The change against today: a percentage (and the multiple from 2x), more or less against as charged, same. */
export function changeOf(v: string, base: string, payer = false): Change {
  const norm = (x: string) => String(x).toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9%]/g, '')
  const flip = (c: Change): Change => payer && c.tone !== 'same' ? { ...c, tone: c.tone === 'up' ? 'down' : 'up' } : c
  if (norm(v) === norm(base)) return { text: 'same', tone: 'same' }
  const a = amountOf(v), b = amountOf(base)
  if (a != null && b != null) {
    if (a === b) return { text: 'same', tone: 'same' }
    if (!Number.isFinite(a)) return flip({ text: 'more', tone: 'up' })
    if (!Number.isFinite(b)) return flip({ text: 'less', tone: 'down' })
    if (b === 0) return flip({ text: 'new', tone: 'up' })
    const p = (a - b) / b * 100, x = a / b
    return flip({ text: `${p > 0 ? '+' : '−'}${Math.abs(Math.round(p)).toLocaleString('en-SG')}%${x >= 2 ? ` (${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}×)` : ''}`, tone: p > 0 ? 'up' : 'down' })
  }
  // Percentages (co-insurance): "Nil" is 0%.
  const pc = (x: string) => /^\s*nil\b/i.test(x) ? 0 : x.match(/(\d+(?:\.\d+)?)\s*%/) ? Number(x.match(/(\d+(?:\.\d+)?)\s*%/)![1]) : null
  const pa = pc(v), pb = pc(base)
  if (pa != null && pb != null) return pa === pb ? { text: 'same', tone: 'same' } : flip({ text: `${pa > pb ? '+' : '−'}${Math.abs(pa - pb)} points`, tone: pa > pb ? 'up' : 'down' })
  if (!v || v === '—') return { text: 'none', tone: 'down' }
  if (!base || base === '—') return { text: 'new', tone: 'up' }
  return { text: 'differs', tone: 'same' }
}
