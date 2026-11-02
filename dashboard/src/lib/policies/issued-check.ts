/**
 * The issued policy against what was bound. Pure.
 *
 * Nathan reads every policy document against the slip and catches what insurers mistype: a third
 * party limit issued as S$20m, a cover note dated 2016, effective dates a month out, a premium that
 * is not the one quoted. This compares the figures a filed document states with the bound quote and
 * the policy record, and names each difference in the broker's terms.
 */
import { parseMoney } from '@/lib/placement/spec'

export type IssuedDoc = { doc_type: string | null; policy_number: string | null; insurer_name: string | null; period_from: string | null; period_to: string | null; premium_text: string | null; sum_insured_text?: string | null }
export type Bound = { premium_amount: number | null; premium_text?: string | null; limit_text?: string | null; limit_amount?: number | null; insurer_name?: string | null; period_from?: string | null; period_to?: string | null; policy_number?: string | null; source: string }

export type Difference = { field: 'premium' | 'period' | 'insurer' | 'policy_number' | 'sum_insured'; issued: string; bound: string; basis: string }

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\b(insurance|assurance|singapore|pte|ltd|limited|company|co|general|group|the|branch)\b/g, ' ').replace(/[^a-z0-9]+/g, '')
const within = (a: number, b: number, tol = 0.015) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * tol)

/** Pure. Differences between a filed cover document and what was bound; empty when it all agrees or nothing can be compared. */
export function issuedDifferences(doc: IssuedDoc, bound: Bound): Difference[] {
  const out: Difference[] = []
  const p = parseMoney(doc.premium_text)?.amount ?? null
  // The premium: the quoted figure, allowing the GST and rounding the invoice adds.
  if (p != null && bound.premium_amount != null && !within(p, bound.premium_amount) && !within(p, bound.premium_amount * 1.09)) {
    out.push({ field: 'premium', issued: doc.premium_text ?? String(p), bound: bound.premium_text ?? String(bound.premium_amount), basis: `${bound.source}: premium ${bound.premium_text ?? bound.premium_amount}; issued ${doc.premium_text}` })
  }
  if (doc.period_from && bound.period_from && doc.period_from.slice(0, 10) !== bound.period_from.slice(0, 10)) {
    out.push({ field: 'period', issued: doc.period_from.slice(0, 10), bound: bound.period_from.slice(0, 10), basis: `${bound.source}: cover from ${bound.period_from.slice(0, 10)}; issued from ${doc.period_from.slice(0, 10)}` })
  } else if (doc.period_to && bound.period_to && doc.period_to.slice(0, 10) !== bound.period_to.slice(0, 10)) {
    out.push({ field: 'period', issued: doc.period_to.slice(0, 10), bound: bound.period_to.slice(0, 10), basis: `${bound.source}: cover to ${bound.period_to.slice(0, 10)}; issued to ${doc.period_to.slice(0, 10)}` })
  }
  if (doc.insurer_name && bound.insurer_name && norm(doc.insurer_name) && norm(bound.insurer_name) && !norm(doc.insurer_name).includes(norm(bound.insurer_name)) && !norm(bound.insurer_name).includes(norm(doc.insurer_name))) {
    out.push({ field: 'insurer', issued: doc.insurer_name, bound: bound.insurer_name, basis: `${bound.source}: bound with ${bound.insurer_name}; document issued by ${doc.insurer_name}` })
  }
  const si = parseMoney(doc.sum_insured_text)?.amount ?? null
  const bl = bound.limit_amount ?? parseMoney(bound.limit_text)?.amount ?? null
  if (si != null && bl != null && !within(si, bl, 0.005)) {
    out.push({ field: 'sum_insured', issued: doc.sum_insured_text ?? String(si), bound: bound.limit_text ?? String(bl), basis: `${bound.source}: sum insured ${bound.limit_text ?? bl}; issued ${doc.sum_insured_text}` })
  }
  if (doc.policy_number && bound.policy_number && doc.policy_number.replace(/\W/g, '').toUpperCase() !== bound.policy_number.replace(/\W/g, '').toUpperCase()) {
    out.push({ field: 'policy_number', issued: doc.policy_number, bound: bound.policy_number, basis: `${bound.source}: policy ${bound.policy_number}; document shows ${doc.policy_number}` })
  }
  // A year that is plainly wrong on a document: a cover note dated a decade off.
  for (const d of [doc.period_from, doc.period_to]) {
    const y = d ? Number(d.slice(0, 4)) : null
    if (y && (y < 2020 || y > 2035)) out.push({ field: 'period', issued: d!.slice(0, 10), bound: 'a current year', basis: `the document is dated ${d!.slice(0, 10)}, which cannot be this cover's period` })
  }
  return out
}

/** One line per difference, for the log and the case: "Premium: issued S$12,000, bound S$11,500 (quote)". */
export function differenceLines(ds: Difference[]): string[] {
  const label: Record<Difference['field'], string> = { premium: 'Premium', period: 'Period', insurer: 'Insurer', policy_number: 'Policy number', sum_insured: 'Sum insured' }
  return ds.map(d => `${label[d.field]}: issued ${d.issued}, bound ${d.bound}`)
}
