/**
 * Pricing Matrix v2 — Level 2: compare what's actually covered across insurers (not just price).
 * Terms are insurer-specific (no fixed taxonomy yet — see pm-benefits-extract.ts) so we align them
 * the same way pm-quote.ts aligns coverage lines: by normalised (category + label), grouping each
 * insurer's own wording under one row per benefit so a client can see "why pick A over B" directly.
 */
import type { BenefitTerm } from '@/lib/pm-benefits-extract'
import type { RateTable } from '@/lib/pm-rates'
import type { Selection } from '@/lib/pm-quote'

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

const normCat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Best-effort match of a benefit term's freeform category to the coverage code it's about, by
 *  normalised category vs that coverage's full_name/code (substring either direction) — terms
 *  don't carry an explicit coverage link (see pm-benefits-extract.ts), so this is the same signal
 *  a human reviewer would use. Picks the longest/most specific label match. */
function coverageForCategory(rt: RateTable, category: string): string | null {
  const c = normCat(category)
  if (!c) return null
  let best: { code: string; len: number } | null = null
  for (const cov of rt.coverages ?? []) {
    for (const label of [cov.full_name, cov.code]) {
      if (!label) continue
      const l = normCat(label)
      if (!l) continue
      if (c === l || c.includes(l) || l.includes(c)) {
        if (!best || l.length > best.len) best = { code: cov.code, len: l.length }
      }
    }
  }
  return best?.code ?? null
}

export type SelectedCompareInsurer = { calculator_id: string; insurer_name: string; rate_table: RateTable; terms: BenefitTerm[] }

/** Prefix marker for a term whose plan-tier match couldn't be confirmed — see alignSelectedTerms.
 *  Exported so renderers (PDF, live preview) can key a legend/caveat off it. */
export const UNCONFIRMED_TAG = '[unconfirmed] '

/** Same alignment as alignTerms, but scoped to what was actually SELECTED for this quote:
 *  - A term whose category CAN be matched to a coverage keeps only the value for the plan
 *    actually selected under that coverage — a confirmed wrong-tier value is dropped outright.
 *  - A term whose category CAN'T be confidently matched to any coverage is still shown (rather
 *    than silently disappearing), tagged with UNCONFIRMED_TAG so the reviewer can see it exists
 *    but hasn't been verified against the selected tier.
 *  - Policy-wide terms (no plan_code) are always kept as-is. */
export function alignSelectedTerms(insurers: SelectedCompareInsurer[], selections: Record<string, Selection>): CompareRow[] {
  const scoped: CompareInsurer[] = insurers.map(ins => {
    const sel = selections[ins.calculator_id] ?? {}
    const terms = ins.terms.flatMap((t): BenefitTerm[] => {
      if (!t.plan_code) return [t]
      const covCode = coverageForCategory(ins.rate_table, t.category)
      if (!covCode) return [{ ...t, value: `${UNCONFIRMED_TAG}${t.value}` }]
      const selectedPlan = sel[covCode]?.plan
      return selectedPlan === t.plan_code ? [t] : []
    })
    return { calculator_id: ins.calculator_id, insurer_name: ins.insurer_name, terms }
  })
  return alignTerms(scoped)
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
