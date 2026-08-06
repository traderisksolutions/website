/**
 * Pricing Matrix — client-facing "Coverage Comparison" document (pure data shaping, no I/O/AI).
 *
 * Assembles the three sections a broker hands to a client: pricing summary, plan selection, and
 * full benefit schedule — side by side across insurers. Every number here is copied from what
 * pm-calc.ts already computed for the quote (QuoteResult) or from the approved rate table/benefit
 * terms — nothing is re-derived, matching the rest of the export layer (pm-export.ts).
 */
import type { QuoteResult, Selection, CensusMember } from '@/lib/pm-quote'
import { categoryFor } from '@/lib/pm-quote'
import type { RateTable } from '@/lib/pm-rates'
import { plansFor } from '@/lib/pm-rates'
import type { BenefitTerm } from '@/lib/pm-benefits-extract'
import { alignSelectedTerms } from '@/lib/pm-compare'
import type { SelectedCompareInsurer } from '@/lib/pm-compare'

export type ComparisonDocInsurer = {
  calculator_id: string
  insurer_name: string
  rate_table: RateTable
  benefit_terms: BenefitTerm[]
  selection: Selection
}
export type ComparisonDocInput = {
  company: string | null
  quotation_date: string
  effective_date: string | null
  census: CensusMember[]
  insurers: ComparisonDocInsurer[]
  result: QuoteResult
}

export type ComparisonRow = { label: string; per_insurer: Record<string, string> }
export type ComparisonDoc = {
  company: string | null
  quotation_date: string
  effective_date: string | null
  lives: { employees: number; dependants: number }
  insurer_ids: string[]
  insurer_names: Record<string, string>
  pricing_rows: ComparisonRow[]
  total_rows: ComparisonRow[]
  plan_rows: ComparisonRow[]
  benefit_rows: { category: string; rows: ComparisonRow[] }[]
}

const money = (n: number | null | undefined): string => (n == null ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`)

export function buildComparisonDoc(input: ComparisonDocInput): ComparisonDoc {
  const priced = input.result.insurers.filter(i => !i.error)
  const insurer_ids = priced.map(i => i.calculator_id)
  const insurer_names = Object.fromEntries(priced.map(i => [i.calculator_id, i.insurer_name]))
  const byInsurer = new Map(input.insurers.map(i => [i.calculator_id, i]))

  const named = input.census.filter(m => (m.name ?? '').trim() || m.date_of_birth || m.age != null)
  const employees = named.filter(m => categoryFor(m) === 'Employee').length
  const dependants = named.length - employees

  // Pricing summary — one row per aligned coverage line, values straight from QuoteResult.
  const pricing_rows: ComparisonRow[] = input.result.lines_union.map(l => ({
    label: l.label,
    per_insurer: Object.fromEntries(priced.map(i => {
      const code = l.per_insurer[i.calculator_id]
      return [i.calculator_id, code ? money(i.by_line[code] ?? null) : 'n/a']
    })),
  }))
  const total_rows: ComparisonRow[] = [
    { label: 'TOTAL ANNUAL PREMIUM (exc GST)', per_insurer: Object.fromEntries(priced.map(i => [i.calculator_id, money(i.grand)])) },
    { label: 'Average per life', per_insurer: Object.fromEntries(priced.map(i => [i.calculator_id, money(i.avg_per_life)])) },
  ]

  // Plan selection — resolve each insurer's chosen plan_code to its label/attrs.
  const plan_rows: ComparisonRow[] = input.result.lines_union.map(l => ({
    label: l.label,
    per_insurer: Object.fromEntries(priced.map(i => {
      const code = l.per_insurer[i.calculator_id]
      const ins = byInsurer.get(i.calculator_id)
      if (!code || !ins) return [i.calculator_id, '']
      const planCode = ins.selection[code]?.plan
      const plan = planCode ? plansFor(ins.rate_table, code).find(p => p.code === planCode) : undefined
      return [i.calculator_id, plan ? [plan.label, plan.attrs ? `(${plan.attrs})` : ''].filter(Boolean).join(' ') : (planCode ?? '')]
    })),
  }))

  // Benefit schedule — every extracted term for the SELECTED tier only (alignSelectedTerms),
  // grouped by category in first-seen order.
  const scoped: SelectedCompareInsurer[] = input.insurers
    .filter(i => insurer_ids.includes(i.calculator_id))
    .map(i => ({ calculator_id: i.calculator_id, insurer_name: i.insurer_name, rate_table: i.rate_table, terms: i.benefit_terms }))
  const selections = Object.fromEntries(input.insurers.map(i => [i.calculator_id, i.selection]))
  const aligned = alignSelectedTerms(scoped, selections)
  const byCategory = new Map<string, ComparisonRow[]>()
  for (const r of aligned) {
    const cat = r.category || 'Other'
    const rows = byCategory.get(cat) ?? []
    rows.push({ label: r.label, per_insurer: Object.fromEntries(insurer_ids.map(id => [id, r.per_insurer[id] ?? '—'])) })
    byCategory.set(cat, rows)
  }
  const benefit_rows = Array.from(byCategory, ([category, rows]) => ({ category, rows }))

  return {
    company: input.company, quotation_date: input.quotation_date, effective_date: input.effective_date,
    lives: { employees, dependants }, insurer_ids, insurer_names, pricing_rows, total_rows, plan_rows, benefit_rows,
  }
}
