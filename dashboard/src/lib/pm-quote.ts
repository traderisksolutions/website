/**
 * Pricing Matrix — quote assembly (pure helpers).
 *
 * A quote runs one census through several approved calculators. For each calculator we build the
 * per-life `members` pm-calc.ts prices (census × the insurer's plan selection), then assemble the
 * per-insurer results into a side-by-side comparison. Pricing itself happens in pm-calc.ts; this
 * module only shapes inputs and aligns outputs.
 */
import type { RateTable } from '@/lib/pm-rates'
import type { BenefitTerm } from '@/lib/pm-benefits-extract'
import type { RuleStep } from '@/lib/pm-rules-extract'

/** One approved calculator as returned by GET /api/pricing-matrix/quote/available — everything the
 *  quote wizard (and quote-editing) needs to render plan-selection controls and price/compare
 *  client-side: coverage_lines/dropdowns for the UI, rate_table/benefit_terms/computation_rules for
 *  live compute (computation_rules is null unless an approved rule set exists — see pm-calc.ts). */
export type AvailableCalculator = {
  id: string; insurer_name: string; effective_date: string | null; version: number
  coverage_lines: { code: string; label: string; fields: string[] }[]
  dropdowns: Record<string, string[]>
  rate_table: RateTable | null
  benefit_terms: BenefitTerm[]
  computation_rules: RuleStep[] | null
}

export type CensusMember = {
  name?: string
  date_of_birth?: string | null
  age?: number | null
  relationship?: string | null   // Self / Spouse / Child
  category?: string | null       // Employee / Dependent (derived from relationship if absent)
  /** Job-grade tag (e.g. Management/Employee, or a broker-defined custom value) — distinct from
   *  `category` above. Purely descriptive unless a calculator's category_overrides gives this
   *  value a different plan-tier selection than the default (see buildMembers). */
  employee_category?: string | null
}

/** Per-insurer plan selection: coverage_code -> field -> value, applied to every census member. */
export type Selection = Record<string, Record<string, string>>

/** Per-insurer, optional plan-tier override keyed by employee_category — only the coverage codes
 *  present for a category override the default Selection; anything absent falls back to it. */
export type CategoryOverrides = Record<string, Selection>

/** A per-life member row for pm-calc.ts to price. */
export type EngineMember = {
  name: string
  category?: string
  relationship?: string
  date_of_birth?: string | null
  age?: number | null
  coverage: Record<string, Record<string, string>>
}

/** Employee vs Dependent from the relationship (Self => Employee). */
export function categoryFor(m: CensusMember): string {
  if (m.category) return m.category
  const rel = (m.relationship || 'Self').toLowerCase()
  return rel === 'self' ? 'Employee' : 'Dependent'
}

/** Build the per-life member rows for one calculator: census × that insurer's selection, with an
 *  optional per-employee_category override layered on top of the default Selection — a category
 *  override only needs to set the coverage codes it wants to differ; everything else still comes
 *  from the default `selection`, and a member with no employee_category (or one with no override
 *  defined) prices exactly as if categoryOverrides were absent. */
export function buildMembers(
  census: CensusMember[], selection: Selection, codes: string[], categoryOverrides?: CategoryOverrides,
): EngineMember[] {
  return census
    .filter(m => (m.name ?? '').trim() || m.date_of_birth || m.age != null)
    .map(m => {
      const override = m.employee_category ? categoryOverrides?.[m.employee_category] : undefined
      const coverage: Record<string, Record<string, string>> = {}
      for (const code of codes) {
        const sel = override?.[code] ?? selection?.[code]
        if (sel && Object.keys(sel).length) coverage[code] = { ...sel }
      }
      return {
        name: (m.name ?? '').trim() || 'Unnamed',
        category: categoryFor(m),
        relationship: m.relationship ?? 'Self',
        date_of_birth: m.date_of_birth ?? null,
        age: m.age ?? null,
        coverage,
      }
    })
}

// ── Result shapes ────────────────────────────────────────────────────────────────
export type RunMember = { row: number; name: string | null; lines: Record<string, number | null>; subtotal: number }

/** The deterministic "why" behind a computed premium — which rules actually fired and why, surfaced
 *  from values pm-calc.ts already computes internally. Pure data, no AI — powers the quote audit
 *  trail (pm-quote-audit.ts) without re-deriving anything. */
export type QuoteAudit = {
  age_basis: 'ANB' | 'ALB' | null
  quote_basis: 'new_business' | 'renewal'
  effective_date: string
  headcount: number
  loading: { pct: number; excluded_codes: string[] } | null
  gst: { inclusive: boolean; rate: number } | null
  basis_excluded_bands: string[] | null
}

export type InsurerResult = {
  calculator_id: string
  insurer_name: string
  effective_date: string | null
  coverage_lines: { code: string; label: string; canonical_category?: string }[]
  by_line: Record<string, number | null>
  grand: number | null
  member_count: number
  avg_per_life: number | null
  members: RunMember[]
  audit?: QuoteAudit
  error?: string
}
export type QuoteResult = {
  insurers: InsurerResult[]
  /** Union of coverage lines across insurers (aligned by normalised label) for the table rows. */
  lines_union: { key: string; label: string; per_insurer: Record<string, string> }[]
  census_size: number
}

const normLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Align coverage lines across insurers by canonical_category when set (fixed taxonomy — see
 *  pm-canonical-categories.ts), so equivalent benefits merge into one row even when insurers word
 *  them differently. Falls back to normalised-label matching for anything not yet classified (or
 *  classified "Other") — same behavior as before this field existed, so nothing regresses.
 *  Returns rows with each insurer's coverage CODE for that benefit (or '' if the insurer lacks it). */
export function alignLines(insurers: InsurerResult[]): QuoteResult['lines_union'] {
  const rows: { key: string; label: string; per_insurer: Record<string, string> }[] = []
  const byKey = new Map<string, number>()
  for (const ins of insurers) {
    for (const l of ins.coverage_lines) {
      const cat = l.canonical_category && l.canonical_category !== 'Other' ? l.canonical_category : null
      const key = cat ? `cat:${normLabel(cat)}` : normLabel(l.label || l.code)
      let idx = byKey.get(key)
      if (idx === undefined) {
        idx = rows.length
        byKey.set(key, idx)
        rows.push({ key, label: l.label || l.code, per_insurer: {} })
      }
      rows[idx].per_insurer[ins.calculator_id] = l.code
    }
  }
  return rows
}

export function avgPerLife(grand: number | null, count: number): number | null {
  if (grand == null || count <= 0) return null
  return Math.round((grand / count) * 100) / 100
}

/** Cheapest/most-expensive/spread across a set of computed insurer results — the "lead with the
 *  number" KPI row above the live comparison table in the quote wizard/edit page. Ignores insurers
 *  with no ratable total (error, or nothing selected yet). */
export function quoteSpreadStats(insurers: InsurerResult[]): { cheapest: InsurerResult | null; priciest: InsurerResult | null; spread: number | null } {
  const priced = insurers.filter((i): i is InsurerResult & { grand: number } => typeof i.grand === 'number')
  if (!priced.length) return { cheapest: null, priciest: null, spread: null }
  const cheapest = priced.reduce((a, b) => (b.grand < a.grand ? b : a))
  const priciest = priced.reduce((a, b) => (b.grand > a.grand ? b : a))
  return { cheapest, priciest, spread: priced.length > 1 ? Math.round((priciest.grand - cheapest.grand) * 100) / 100 : null }
}

/** Assemble one insurer's computed run into an InsurerResult. */
export function toInsurerResult(
  calculator_id: string, insurer_name: string, effective_date: string | null,
  coverage_lines: { code: string; label: string; canonical_category?: string }[],
  run: { members: RunMember[]; totals: { by_line: Record<string, number | null>; grand: number | null } },
  audit?: QuoteAudit,
): InsurerResult {
  const count = run.members.length
  return {
    calculator_id, insurer_name, effective_date,
    coverage_lines,
    by_line: run.totals?.by_line ?? {},
    grand: run.totals?.grand ?? null,
    member_count: count,
    avg_per_life: avgPerLife(run.totals?.grand ?? null, count),
    members: run.members ?? [],
    ...(audit ? { audit } : {}),
  }
}
