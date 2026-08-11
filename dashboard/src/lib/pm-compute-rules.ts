/**
 * Pricing Matrix v3 — the deterministic executor for an approved pm_computation_rules.rules
 * (RuleStep[], see pm-rules-extract.ts). Pure TypeScript, no network/AI call, no Python — same
 * purity discipline as pm-calc.ts's priceLine(), which this supplements rather than replaces:
 * computeInsurerQuote() only takes this branch when an APPROVED, non-empty rule set exists for the
 * calculator; every calculator without one keeps running the flat age-band lookup unchanged.
 *
 * Interpretation notes (the RuleStep vocabulary is a bounded, human-reviewable set of primitives,
 * not a full expression VM — these are the deliberate, documented choices for resolving it):
 *  - Each age_band_lookup/flat_rate step's `output` is tracked as that coverage's CURRENT running
 *    total. A percentage_loading or gst_adjustment step that names a coverage (via `applies_to` /
 *    resolving to a tracked coverage's output) updates that coverage's running total IN PLACE,
 *    rather than requiring every step to explicitly chain the previous step's output name — this
 *    matches how these steps read in a real workbook (a loading formula multiplies the base rate
 *    cell, it doesn't invent a new named cell for every insurer).
 *  - Because the rules already encode loading/GST where the workbook actually applies them, THIS
 *    output is the coverage's FINAL premium line — pm-calc.ts must not additionally apply
 *    rt.rules.group_size_loading / rt.rules.gst on top when this branch is used (would double-count
 *    for calculators whose rules already cover it, or apply loading a calculator's rules
 *    deliberately excluded a coverage from). See computeInsurerQuote's branch in pm-calc.ts.
 */
import type { RuleStep } from '@/lib/pm-rules-extract'
import type { RateTable } from '@/lib/pm-rates'
import { bandContains, coverageCodes } from '@/lib/pm-rates'
import { coverageFor } from '@/lib/pm-calc'

export type RuleContext = {
  age: number
  category?: string
  /** Per-coverage-code selected plan field (from the census member's selection), e.g. { GHS: { plan: 'Plan 1' } }. */
  selection: Record<string, { plan?: string } | undefined>
  headcount: number
  /** Named inputs beyond age/headcount a percentage_loading/conditional_tier_selection step may
   *  reference by name (pm_computation_rules.variables documents what a calculator's rules expect). */
  variables?: Record<string, number | string>
}

const round2 = (v: number) => Math.round(v * 100) / 100

function resolveNumber(ref: string | number, vars: Map<string, number | string>): number | null {
  if (typeof ref === 'number') return ref
  const parsed = parseFloat(ref)
  if (!isNaN(parsed)) return parsed
  const v = vars.get(ref)
  return typeof v === 'number' ? v : null
}

function loadingPct(step: Extract<RuleStep, { type: 'percentage_loading' }>, ctx: RuleContext): number {
  const basisValue = step.basis === 'headcount' ? ctx.headcount : Number(ctx.variables?.[step.variable ?? ''] ?? NaN)
  if (isNaN(basisValue)) return 0
  for (const b of step.bands) if (basisValue >= b.min && (b.max === null || basisValue <= b.max)) return b.pct
  return 0
}

function evalCondition(cond: { field: string; op: string; value: unknown }, ctx: RuleContext): boolean {
  const actual = cond.field === 'age' ? ctx.age : cond.field === 'headcount' ? ctx.headcount : ctx.variables?.[cond.field]
  if (actual === undefined) return false
  switch (cond.op) {
    case 'eq': return String(actual) === String(cond.value)
    case 'gte': return Number(actual) >= Number(cond.value)
    case 'lte': return Number(actual) <= Number(cond.value)
    case 'in': return Array.isArray(cond.value) && cond.value.map(String).includes(String(actual))
    case 'between': { const [lo, hi] = cond.value as [number, number]; return Number(actual) >= lo && Number(actual) <= hi }
    default: return false
  }
}

/** Runs one member's approved rule set against the approved rate table, returning the FINAL
 *  per-coverage premium lines (loading/GST already applied per the rules) — or null if the rule
 *  set produced nothing ratable, in which case the caller should not silently fall back (an
 *  approved, empty result is a real "not ratable for this member" outcome, not an error). */
export function runComputationRules(rules: RuleStep[], rt: RateTable, ctx: RuleContext): Record<string, number> {
  const vars = new Map<string, number | string>()
  // Which output variable currently represents each coverage code's running total — updated in
  // place by loading/GST steps that name that coverage, so a coverage's final line is always
  // whatever its tracked output holds after every step has run.
  const coverageOutput = new Map<string, string>()

  for (const step of rules) {
    switch (step.type) {
      case 'age_band_lookup': {
        const planCode = ctx.selection[step.coverage_code]?.plan
        if (!planCode) break
        const cov = coverageFor(rt, step.coverage_code, ctx.category)
        const row = cov?.rates.find(r => bandContains(r.band, ctx.age))
        const v = row?.by_plan?.[planCode]
        if (typeof v === 'number') { vars.set(step.output, v); coverageOutput.set(step.coverage_code, step.output) }
        break
      }
      case 'flat_rate': {
        const v = resolveNumber(step.value_ref, vars)
        if (v !== null) { vars.set(step.output, v); coverageOutput.set(step.coverage_code, step.output) }
        break
      }
      case 'percentage_loading': {
        const pct = loadingPct(step, ctx)
        if (!pct) break
        const targets = step.applies_to === 'all' ? Array.from(coverageOutput.keys()) : step.applies_to
        for (const code of targets) {
          if (step.excludes?.includes(code)) continue
          const outName = coverageOutput.get(code)
          const base = outName ? vars.get(outName) : undefined
          if (typeof base !== 'number') continue
          const loaded = round2(base * (1 + pct / 100))
          vars.set(outName!, loaded)
        }
        break
      }
      case 'conditional_tier_selection': {
        const hit = step.when.find(w => evalCondition(w.if, ctx))
        const value = hit ? hit.then : step.else
        if (value !== undefined) vars.set(step.output, value)
        break
      }
      case 'combine': {
        const nums = step.inputs.map(name => vars.get(name)).filter((v): v is number => typeof v === 'number')
        if (nums.length !== step.inputs.length) break
        const result = step.op === 'add' ? nums.reduce((a, b) => a + b, 0)
          : step.op === 'subtract' ? nums.reduce((a, b) => a - b)
          : nums.reduce((a, b) => a * b, 1)
        vars.set(step.output, round2(result))
        break
      }
      case 'gst_adjustment': {
        const base = vars.get(step.input_ref)
        if (typeof base !== 'number' || !step.inclusive || step.rate <= 0) break
        const adjusted = round2(base / (1 + step.rate))
        vars.set(step.output, adjusted)
        // If input_ref was itself a tracked coverage output, the adjusted value replaces it as
        // that coverage's final line; otherwise this is a standalone computed value only.
        coverageOutput.forEach(outName => { if (outName === step.input_ref) vars.set(outName, adjusted) })
        break
      }
    }
  }

  const lines: Record<string, number> = {}
  for (const { code } of coverageCodes(rt)) {
    const outName = coverageOutput.get(code)
    const v = outName ? vars.get(outName) : undefined
    if (typeof v === 'number') lines[code] = round2(v)
  }
  return lines
}
