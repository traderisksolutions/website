/**
 * Group Benefits quote computation (Phase 2) — pure functions so they're unit-tested.
 * Runs a census across selected approved rate tables and returns per-insurer totals.
 */
import { runGbComputationRules } from '@/lib/gb-compute-rules'
import type { RuleStep } from '@/lib/pm-rules-extract'
import { parseCalendarDate, ageLastBirthday } from '@/lib/dates/dob'
import { resolveProduct } from '@/lib/gb/resolve'

export type Relationship = 'self' | 'spouse' | 'child' | string
export type Member = { name: string; category: string; relationship: Relationship; dob?: string | null; age?: number | null; occupation_class?: string | null }

export type RateRow = {
  product_code: string; member_type?: string | null; plan_code: string; band_label: string
  age_min: number | null; age_max: number | null; premium: number; renewal_only?: boolean
  /** Member attributes the rate depends on that the broker does not choose — today only
   *  occupation_class, which personal accident is priced by at both QBE and Income. A row with
   *  no dimensions applies to every member. */
  dimensions?: { occupation_class?: string | number | null } | Record<string, unknown> | null
}

export type QuoteBasis = 'new_business' | 'renewal'

// Rules extracted from the insurer's Excel calculator (Phase C). All fields optional and
// may be unstructured strings (unconfirmed) — applied defensively, only in their structured
// form. Extra keys from the compiler dict (age_basis, rider_dependencies) are ignored here.
export type GroupTier = { min_lives: number; factor: number }   // factor is a MULTIPLIER (1.5 = +50%, 0.95 = -5%)
export type AppliedRules = {
  gst_treatment?: { treatment?: string; conversion_factor?: number | null } | string | null
  group_size_discount?: { tiers?: GroupTier[] } | string | null
  renewal_only_bands?: Array<{ band?: [number, number] | null }> | string | null
  occupation_class_rules?: { excluded_classes?: Array<number | string> } | string | null
  /** Ages the insurer will cover, by relationship. Income's calculator refuses children over 24
   *  and employees or spouses over 75 or under 16 (Working!C4); without this the engine would
   *  price people the insurer would not accept. */
  eligibility?: { child_max_age?: number; adult_min_age?: number; adult_max_age?: number } | null
}

// A member's relationship maps to which premium table applies (employee vs dependant).
export const memberTypeFor = (relationship: string): 'employee' | 'dependant' =>
  /spouse|child|dependa|dependent|son|daughter|wife|husband|partner/i.test(relationship) ? 'dependant' : 'employee'
export type RateTableInfo = {
  rate_table_id: string; insurer_id?: string | null; insurer_name: string
  age_basis: 'next_birthday' | 'last_birthday'; rates: RateRow[]; rules?: AppliedRules | null
  /** Approved gb_computation_rules.rules (Sales Loop v2, Phase 6d) — set ONLY when an
   *  administrator has explicitly approved a richer rule set for this table; every table
   *  without one keeps running the AppliedRules path below completely unchanged. When set,
   *  `rules` (AppliedRules) is ignored for this table — the rich rules already encode
   *  loading/GST wherever the calculator's own formulas apply them, so applying both would
   *  double-count. See gb-compute-rules.ts's header comment. */
  richRules?: RuleStep[] | null
}

// ── Rule appliers (defensive: no-op unless the rule is in its structured form) ──────
export function groupFactor(rules: AppliedRules | null | undefined, lives: number): number {
  const g = rules?.group_size_discount
  if (!g || typeof g === 'string' || !Array.isArray(g.tiers)) return 1
  const tier = g.tiers.filter(t => typeof t?.min_lives === 'number' && lives >= t.min_lives)
                      .sort((a, b) => b.min_lives - a.min_lives)[0]
  return tier && typeof tier.factor === 'number' ? tier.factor : 1
}
export function netOfGst(premium: number, rules: AppliedRules | null | undefined): number {
  const g = rules?.gst_treatment
  if (!g || typeof g === 'string') return premium
  if (g.treatment === 'inclusive') {
    // Strip inclusive GST -> net. When the calculator said "inclusive" but no factor was
    // captured (text-only detection), default to Singapore's 9% GST (÷1.09).
    const f = typeof g.conversion_factor === 'number' && g.conversion_factor > 0 ? g.conversion_factor : 1.09
    return premium / f
  }
  return premium
}
export function inRenewalBand(rules: AppliedRules | null | undefined, age: number | null): boolean {
  const rb = rules?.renewal_only_bands
  if (age == null || !Array.isArray(rb)) return false
  return rb.some(b => Array.isArray(b?.band) && b.band.length === 2 && age >= b.band[0] && age <= b.band[1])
}
/** Why this member is outside the ages the insurer covers, or null when they are inside them. */
export function eligibilityNote(rules: AppliedRules | null | undefined, relationship: string, age: number | null): string | null {
  const e = rules?.eligibility
  if (!e || age == null) return null
  const child = /child|son|daughter/i.test(relationship)
  if (child) return e.child_max_age != null && age > e.child_max_age ? `child over ${e.child_max_age} not eligible` : null
  if (e.adult_max_age != null && age > e.adult_max_age) return `over ${e.adult_max_age} not eligible`
  if (e.adult_min_age != null && age < e.adult_min_age) return `under ${e.adult_min_age} not eligible`
  return null
}

export function classExcluded(rules: AppliedRules | null | undefined, cls: string | number | null | undefined): boolean {
  const oc = rules?.occupation_class_rules
  if (cls == null || cls === '' || !oc || typeof oc === 'string' || !Array.isArray(oc.excluded_classes)) return false
  return oc.excluded_classes.map(String).includes(String(cls))
}
// { [rate_table_id]: { [product_code]: { [category]: plan_code } } }
export type CategoryMap = Record<string, Record<string, Record<string, string>>>

export type QuoteLine = {
  member_index: number; member_name: string; relationship: Relationship; category: string; age: number | null
  rate_table_id: string; insurer_id: string | null; insurer_name: string; product_code: string; plan_code: string | null; premium: number | null; note: string | null
}
export type InsurerResult = {
  rate_table_id: string; insurer_id: string | null; insurer_name: string
  by_product: Record<string, number>; subtotal: number; gst: number; total: number
  missing: number   // lines with no premium (flag for the broker)
  applied?: { group_factor: number; gst_treatment: string | null }   // Phase C: rules that shaped these numbers
}
export type QuoteResult = { per_insurer: InsurerResult[]; lines: QuoteLine[] }

// Age at the effective date on the given basis. "next birthday" = age they turn next = last + 1.
export function ageAt(dob: string, effDate: string, basis: 'next_birthday' | 'last_birthday'): number | null {
  // Day-first or ISO only. `new Date(dob)` read Singapore's 24/12/1971 month-first — invalid —
  // and 12/09/1972 as 9 December; see src/lib/dates/dob.ts for what that did to a quotation.
  const d = parseCalendarDate(dob), e = parseCalendarDate(effDate)
  if (!d || !e) return null
  const last = ageLastBirthday(d, e)
  return basis === 'last_birthday' ? last : last + 1
}

// The age to look up for a member against a table: from DOB per the table's basis, else the
// explicitly-provided age (basis unknown — used as-is).
export function memberAge(m: Member, effDate: string, basis: 'next_birthday' | 'last_birthday'): number | null {
  // A date that will not parse falls back to the stated age rather than dropping the member:
  // a dropped member vanishes from the total with no more than a count in the footer.
  const fromDob = m.dob ? ageAt(m.dob, effDate, basis) : null
  if (fromDob != null) return fromDob
  if (m.age != null && isFinite(m.age)) return Math.floor(m.age)
  return null
}

export function findRate(
  rates: RateRow[], product: string, plan: string | null, age: number | null,
  memberType?: 'employee' | 'dependant', ctx?: { occupationClass?: string | number | null },
): { premium: number | null; note: string | null } {
  if (!plan) return { premium: null, note: 'no plan mapped' }
  if (age == null) return { premium: null, note: 'no age' }
  let cand = rates.filter(r => r.product_code === product && r.plan_code === plan)
  if (!cand.length) return { premium: null, note: 'plan not in rate table' }

  // Rows priced by occupation class. Without the member's class there is no right answer, so say
  // so rather than taking the first row — class 3 costs half as much again as class 1.
  const classOf = (r: RateRow) => (r.dimensions as { occupation_class?: unknown } | null | undefined)?.occupation_class
  if (cand.some(r => classOf(r) != null)) {
    const want = ctx?.occupationClass
    if (want == null || want === '') return { premium: null, note: 'occupation class needed' }
    cand = cand.filter(r => classOf(r) == null || String(classOf(r)) === String(want))
    if (!cand.length) return { premium: null, note: `class ${want} not priced` }
  }

  const typed   = memberType ? cand.filter(r => (r.member_type ?? null) === memberType) : []
  const untyped = cand.filter(r => (r.member_type ?? null) === null)
  // A table that splits employee from dependant and has no rows for THIS member type is a
  // genuine gap, and must read as one. The previous fallback dropped through to whatever rows
  // existed, so a spouse on a table with employee rates only was quoted at employee rates with
  // no flag — a wrong number that looked like a right one. Income and QBE both hold employee
  // rates only, so every dependant on their tables was affected.
  const splitsByMemberType = cand.some(r => (r.member_type ?? null) !== null)
  if (memberType && splitsByMemberType && !typed.length && !untyped.length) {
    return { premium: null, note: `no ${memberType} rates in this table` }
  }
  // Tables that do not split by member type price everybody off the same rows.
  const pool = typed.length ? typed : untyped.length ? untyped : cand
  const match = pool.find(r => age >= (r.age_min ?? 0) && (r.age_max == null || age <= r.age_max))
  if (!match) return { premium: null, note: `no band for age ${age}` }
  return { premium: match.premium, note: match.renewal_only ? 'renewal-only band' : null }
}

/**
 * Whether GST applies to this product's premium.
 *
 * Life insurance is an exempt supply in Singapore; health and accident cover are standard-rated.
 * So term life and critical illness carry no GST, while hospital, outpatient, dental and personal
 * accident do. This used to be one setting per insurer, which got both directions wrong: Income's
 * calculator states its rates "inclusive of 9% GST", and the engine stripped 9% from its term life
 * and critical illness rates as well — S$375 shown as S$344.04 plus GST that does not exist — and
 * for an insurer with no GST rule it added 9% to term life premiums that carry none. TRS's own
 * comparison workbook (V1.2) prices them GST-free; it agreed with the insurers' calculators on
 * every other one of 578 rows checked.
 *
 * Read from the canonical product, so a bundle label like AIA's "GTL + GACI" is recognised as life
 * cover without anybody maintaining a list per insurer.
 */
const GST_EXEMPT = new Set(['GTL', 'GCI'])
export function gstApplies(productCode: string): boolean {
  const codes = resolveProduct(productCode).codes
  return !(codes.length > 0 && codes.every(c => GST_EXEMPT.has(c)))
}

export function computeQuote(
  members: Member[], tables: RateTableInfo[], categoryMap: CategoryMap, products: string[], gstRate: number, effDate: string,
  opts?: { basis?: QuoteBasis },
): QuoteResult {
  const lines: QuoteLine[] = []
  const per_insurer: InsurerResult[] = []
  const basis = opts?.basis ?? 'new_business'

  for (const table of tables) {
    const tMap = categoryMap[table.rate_table_id] ?? {}
    const rules = table.rules ?? null            // Phase C rules apply only when present (approved)
    const gFactor = groupFactor(rules, members.length)
    const byProduct: Record<string, number> = {}
    let subtotal = 0, missing = 0, taxable = 0

    members.forEach((m, i) => {
      const age = memberAge(m, effDate, table.age_basis)

      // Sales Loop v2, Phase 6d: an approved richer rule set replaces BOTH the flat findRate
      // lookup and the AppliedRules pass below for every product on this table — the rules
      // already encode whatever loading/GST/eligibility the calculator's own formulas apply.
      if (table.richRules?.length && age != null) {
        const selection = Object.fromEntries(products.map(p => [p, tMap[p]?.[m.category] ?? undefined]))
        const result = runGbComputationRules(table.richRules, table.rates, { age, relationship: m.relationship, selection, headcount: members.length })
        for (const product of products) {
          const plan = tMap[product]?.[m.category] ?? null
          if (!plan) continue
          const premium = result[product] ?? null
          const note = premium == null ? 'not covered by approved rules' : null
          lines.push({ member_index: i, member_name: m.name, relationship: m.relationship, category: m.category, age, rate_table_id: table.rate_table_id, insurer_id: table.insurer_id ?? null, insurer_name: table.insurer_name, product_code: product, plan_code: plan, premium, note })
          if (premium == null) { missing++; continue }
          byProduct[product] = round2((byProduct[product] ?? 0) + premium)
          subtotal = round2(subtotal + premium)
          if (gstApplies(product)) taxable = round2(taxable + premium)
        }
        return
      }

      const ineligible = eligibilityNote(rules, m.relationship, age)
      for (const product of products) {
        const plan = tMap[product]?.[m.category] ?? null
        // Skip products the category isn't mapped to (e.g. staff without a GOS rider).
        if (!plan) continue
        let { premium, note } = ineligible
          ? { premium: null as number | null, note: ineligible as string | null }
          : findRate(table.rates, product, plan, age, memberTypeFor(m.relationship), { occupationClass: m.occupation_class })
        // Apply the insurer's calculator rules (guarded — no-op when the table has no rules).
        if (rules && premium != null) {
          if (classExcluded(rules, m.occupation_class)) {
            premium = null; note = `class ${m.occupation_class} not eligible`
          } else if (basis === 'new_business' && (note === 'renewal-only band' || inRenewalBand(rules, age))) {
            premium = null; note = 'renewal-only (new business)'
          } else {
            // Net of GST — only where GST applies; a life premium never had any to strip.
            premium = round2((gstApplies(product) ? netOfGst(premium, rules) : premium) * gFactor)
          }
        }
        lines.push({ member_index: i, member_name: m.name, relationship: m.relationship, category: m.category, age, rate_table_id: table.rate_table_id, insurer_id: table.insurer_id ?? null, insurer_name: table.insurer_name, product_code: product, plan_code: plan, premium, note })
        if (premium == null) { missing++; continue }
        byProduct[product] = round2((byProduct[product] ?? 0) + premium)
        subtotal = round2(subtotal + premium)
        if (gstApplies(product)) taxable = round2(taxable + premium)
      }
    })

    // GST on the standard-rated cover only; term life and critical illness are exempt.
    const gst = round2(taxable * gstRate)
    // richRules bypasses AppliedRules entirely (see the branch above) — report that plainly
    // rather than showing gFactor/rules.gst_treatment values that were never actually applied.
    const applied = table.richRules?.length
      ? { group_factor: 1, gst_treatment: 'approved computation rules' }
      : rules ? { group_factor: gFactor, gst_treatment: typeof rules.gst_treatment === 'object' && rules.gst_treatment ? rules.gst_treatment.treatment ?? null : null } : undefined
    per_insurer.push({ rate_table_id: table.rate_table_id, insurer_id: table.insurer_id ?? null, insurer_name: table.insurer_name, by_product: byProduct, subtotal, gst, total: round2(subtotal + gst), missing, applied })
  }

  per_insurer.sort((a, b) => a.total - b.total)   // cheapest first
  return { per_insurer, lines }
}

const round2 = (n: number) => Math.round(n * 100) / 100
