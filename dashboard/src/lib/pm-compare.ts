/**
 * Pricing Matrix v2 — Level 2: compare what's actually covered across insurers (not just price).
 * Terms are insurer-specific (no fixed taxonomy yet — see pm-benefits-extract.ts) so we align them
 * the same way pm-quote.ts aligns coverage lines: by normalised (category + label), grouping each
 * insurer's own wording under one row per benefit so a client can see "why pick A over B" directly.
 */
import type { BenefitTerm } from '@/lib/pm-benefits-extract'

export type CompareInsurer = { calculator_id: string; insurer_name: string; terms: BenefitTerm[] }
export type CompareRow = { key: string; category: string; label: string; per_insurer: Record<string, string> }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** One row per (category, label) seen across any insurer; each insurer's own value(s) land in
 *  per_insurer[calculator_id] — joined with " / " when an insurer has more than one plan tier
 *  under the same label, annotated with that tier's plan code. */
export function alignTerms(insurers: CompareInsurer[]): CompareRow[] {
  const rows: CompareRow[] = []
  const byKey = new Map<string, number>()
  for (const ins of insurers) {
    for (const t of ins.terms) {
      if (!t.category && !t.label) continue
      const key = `${norm(t.category)}|${norm(t.label)}`
      let idx = byKey.get(key)
      if (idx === undefined) { idx = rows.length; byKey.set(key, idx); rows.push({ key, category: t.category, label: t.label, per_insurer: {} }) }
      const entry = t.plan_code ? `${t.value} (${t.plan_code})` : t.value
      const cur = rows[idx].per_insurer[ins.calculator_id]
      rows[idx].per_insurer[ins.calculator_id] = cur ? `${cur} / ${entry}` : entry
    }
  }
  return rows
}

/** Rows where insurers actually differ (or one has it and another doesn't) — the interesting rows
 *  for "why choose A over B". Rows where every insurer that has a value has the SAME value are
 *  omitted. */
export function differingRows(rows: CompareRow[], insurerIds: string[]): CompareRow[] {
  return rows.filter(r => {
    const values = insurerIds.map(id => r.per_insurer[id]).filter((v): v is string => v !== undefined)
    return new Set(values.map(v => v.toLowerCase().trim())).size > 1 || values.length < insurerIds.length
  })
}
