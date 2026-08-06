/**
 * Pricing Matrix v2 — the normalized RATE TABLE.
 *
 * This is the one thing captured per insurer calculator (replaces the old CellMapProfile /
 * cell-map). AI extracts it from the xlsx + brochure (cross-checked, see pm-rates-extract.ts);
 * a human reviews and confirms it before it's usable in a live quote. pm-calc.ts computes every
 * quote from this data — no AI calls and no external engine at quote time.
 */

export type RatePlan = { code: string; label: string; attrs?: string }
export type RateRow = { band: string; by_plan: Record<string, number | string> }

/** One coverage line, scoped to a member type when the insurer prices Employee/Dependant
 *  differently (two Coverage entries share the same `code` in that case; pm-calc.ts picks the
 *  one matching each life). Unscoped (`member_type` unset) applies to every life. */
export type Coverage = {
  code: string
  full_name: string
  member_type?: string
  plans: RatePlan[]
  age_bands: string[]
  rates: RateRow[]
  derivation?: string
  notes?: string
}

export type LoadingBand = { min: number; max: number | null; loading_pct: number }

export type Rules = {
  /** Headcount-based loading/discount applied to the group's premium (e.g. +50% for 1 life,
   *  -5% for 5-9, -10% for 10+). */
  group_size_loading?: LoadingBand[]
  /** Coverage codes NOT subject to group_size_loading (e.g. Term Life, Critical Illness, PA are
   *  often excluded from the group discount even though medical lines get it). */
  loading_excludes?: string[]
  /** Age bands blanked out depending on quote basis (e.g. renewal-only bands don't price on a
   *  New Business quote, and vice versa). */
  quote_basis_exclusions?: { new_business?: string[]; renewal?: string[] }
  gst?: { inclusive: boolean; rate: number }
}

export type Accuracy = {
  extractors?: string[]
  total_rates?: number
  agreed?: number
  conflicts?: number
  adjudicated?: number
  single_source?: number
}

export type RateTable = {
  calculator_id: string
  age_basis: 'ANB' | 'ALB' | null
  coverages: Coverage[]
  rules: Rules
  accuracy?: Accuracy
}

/** One row in pm_reconciliation_issues — a single Opus-vs-Gemini disagreement (rule or benefit
 *  term) needing a human decision, with a real resolved_by/resolved_at trail instead of being
 *  overwritten in place. See pm-rates-extract.ts (RuleConflict) / pm-benefits-extract.ts
 *  (TermConflict) for how these get raised at extraction time. */
export type ReconciliationIssue = {
  id: string
  calculator_id: string
  kind: 'rule' | 'term'
  field?: string | null
  category?: string | null
  label?: string | null
  dedupe_key?: string | null
  opus_value?: unknown
  gemini_value?: unknown
  note?: string | null
  status: 'open' | 'resolved' | 'dismissed'
  resolution?: unknown
  resolved_by?: string | null
  resolved_at?: string | null
  created_at: string
}

/** Empty scaffold for a freshly-created row. */
export const EMPTY_RATE_TABLE: Omit<RateTable, 'calculator_id'> = {
  age_basis: null,
  coverages: [],
  rules: {},
}

/** Distinct coverage codes, one entry per code even when member-type variants share it — for
 *  building plan-selection UI / the quote wizard. */
export function coverageCodes(rt: RateTable | null | undefined): { code: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const c of rt?.coverages ?? []) if (!seen.has(c.code)) seen.set(c.code, c.full_name || c.code)
  return Array.from(seen, ([code, label]) => ({ code, label }))
}

/** Plan codes/labels offered under a coverage code (union across its member-type variants). */
export function plansFor(rt: RateTable | null | undefined, code: string): RatePlan[] {
  const seen = new Map<string, RatePlan>()
  for (const c of rt?.coverages ?? []) if (c.code === code) for (const p of c.plans ?? []) if (!seen.has(p.code)) seen.set(p.code, p)
  return Array.from(seen.values())
}

/** "26-30" -> {min:26,max:30}; "71+" / "71 and above" -> {min:71,max:null}; "0-25" -> {min:0,max:25}. */
export function parseBand(band: string): { min: number; max: number | null } {
  const s = band.trim()
  const plus = s.match(/^(\d+)\s*\+|^(\d+)\s*(?:and\s*above|and\s*over)/i)
  if (plus) return { min: Number(plus[1] ?? plus[2]), max: null }
  const range = s.match(/(\d+)\s*[-–to]+\s*(\d+)/i)
  if (range) return { min: Number(range[1]), max: Number(range[2]) }
  const single = s.match(/(\d+)/)
  if (single) return { min: Number(single[1]), max: Number(single[1]) }
  return { min: 0, max: null }
}

export function bandContains(band: string, age: number): boolean {
  const { min, max } = parseBand(band)
  return age >= min && (max === null || age <= max)
}

/** Human-readable reasons a rate table isn't ready to approve — empty when it is. Used both to
 *  gate Approve and to show the reviewer exactly what's missing (never a silent disabled button). */
export function runnableIssues(rt: RateTable | null | undefined): string[] {
  if (!rt) return ['No rate table extracted yet']
  const issues: string[] = []
  if (!rt.age_basis) issues.push('Age basis (ANB/ALB) is not set')
  if (!Array.isArray(rt.coverages) || rt.coverages.length === 0) issues.push('No coverages extracted')
  for (const c of rt.coverages ?? []) {
    const label = c.full_name || c.code || 'Untitled coverage'
    if (!Array.isArray(c.plans) || c.plans.length === 0) issues.push(`${label}: no plans`)
    else if (!Array.isArray(c.rates) || !c.rates.some(r => Object.values(r.by_plan ?? {}).some(v => typeof v === 'number')))
      issues.push(`${label}: no numeric rates`)
  }
  return issues
}

/** Minimal validity check gating "Approve" — every declared coverage has at least one plan with
 *  at least one numeric rate, and the age basis is set. */
export function rateTableIsRunnable(rt: RateTable | null | undefined): boolean {
  return runnableIssues(rt).length === 0
}
