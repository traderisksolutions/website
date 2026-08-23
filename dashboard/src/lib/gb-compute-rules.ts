/**
 * Group Benefits — the deterministic executor for an approved gb_computation_rules.rules
 * (RuleStep[], same vocabulary as Pricing Matrix's — see pm-rules-extract.ts). Pure TypeScript,
 * no network/AI call. Sales Loop v2, Phase 6d.
 *
 * NOT a call into pm-compute-rules.ts: that interpreter reads against PM's nested RateTable
 * (coverages[].rates[].by_plan) via pm-calc.ts's coverageFor() — a shape GB's flat RateRow[] +
 * gb-quote.ts's findRate() don't share (GB and PM's types diverged after forking apart in July,
 * same reason gb-recommend.ts/gb-plan-match.ts are parallel modules, not shared ones). This
 * duplicates the RuleStep step-type switch (small, mechanical) but plugs into GB's own
 * findRate()/memberTypeFor() lookup instead of reimplementing rate lookup.
 *
 * computeQuote() (gb-quote.ts) only takes this branch when an APPROVED, non-empty rule set
 * exists for a table — every table without one keeps running today's AppliedRules path
 * unchanged. Because the rules already encode loading/GST where the calculator's own formulas
 * apply them, this branch's output is each product's FINAL premium line — computeQuote() must
 * NOT additionally apply AppliedRules' groupFactor/netOfGst/classExcluded on top (would
 * double-count, or apply a loading the calculator's own rules deliberately excluded a product
 * from) — mirrors pm-compute-rules.ts's identical warning for pm-calc.ts.
 */
import type { RuleStep } from '@/lib/pm-rules-extract'
import type { RateRow, Relationship } from '@/lib/gb-quote'
import { findRate, memberTypeFor } from '@/lib/gb-quote'

export type GbRuleContext = {
  age: number
  relationship: Relationship
  /** product_code -> the plan_code this member's category is mapped to (gb-quote.ts's
   *  categoryMap resolved for one member) — omitted keys mean "not offered/selected." */
  selection: Record<string, string | undefined>
  headcount: number
  /** Named inputs beyond age/headcount a percentage_loading/conditional_tier_selection step may
   *  reference by name. GB has no variables-documentation column yet (unlike PM's
   *  pm_computation_rules.variables) — steps referencing an undocumented variable simply no-op,
   *  same as any other structurally-absent input. */
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

function loadingPct(step: Extract<RuleStep, { type: 'percentage_loading' }>, ctx: GbRuleContext): number {
  const basisValue = step.basis === 'headcount' ? ctx.headcount : Number(ctx.variables?.[step.variable ?? ''] ?? NaN)
  if (isNaN(basisValue)) return 0
  for (const b of step.bands) if (basisValue >= b.min && (b.max === null || basisValue <= b.max)) return b.pct
  return 0
}

function evalCondition(cond: { field: string; op: string; value: unknown }, ctx: GbRuleContext): boolean {
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

/** Runs one member's approved rule set against the rate table's rows, returning the FINAL
 *  per-product premium lines (loading/GST already applied per the rules), keyed by product_code
 *  (RuleStep's "coverage_code" maps onto GB's product_code — GB has no separate coverage-code
 *  concept, one product IS the coverage line). */
export function runGbComputationRules(rules: RuleStep[], rates: RateRow[], ctx: GbRuleContext): Record<string, number> {
  const vars = new Map<string, number | string>()
  const productOutput = new Map<string, string>()

  for (const step of rules) {
    switch (step.type) {
      case 'age_band_lookup': {
        const planCode = ctx.selection[step.coverage_code]
        if (!planCode) break
        const { premium } = findRate(rates, step.coverage_code, planCode, ctx.age, memberTypeFor(ctx.relationship))
        if (typeof premium === 'number') { vars.set(step.output, premium); productOutput.set(step.coverage_code, step.output) }
        break
      }
      case 'flat_rate': {
        const v = resolveNumber(step.value_ref, vars)
        if (v !== null) { vars.set(step.output, v); productOutput.set(step.coverage_code, step.output) }
        break
      }
      case 'percentage_loading': {
        const pct = loadingPct(step, ctx)
        if (!pct) break
        const targets = step.applies_to === 'all' ? Array.from(productOutput.keys()) : step.applies_to
        for (const code of targets) {
          if (step.excludes?.includes(code)) continue
          const outName = productOutput.get(code)
          const base = outName ? vars.get(outName) : undefined
          if (typeof base !== 'number') continue
          vars.set(outName!, round2(base * (1 + pct / 100)))
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
        productOutput.forEach(outName => { if (outName === step.input_ref) vars.set(outName, adjusted) })
        break
      }
    }
  }

  const lines: Record<string, number> = {}
  productOutput.forEach((outName, code) => {
    const v = vars.get(outName)
    if (typeof v === 'number') lines[code] = round2(v)
  })
  return lines
}
