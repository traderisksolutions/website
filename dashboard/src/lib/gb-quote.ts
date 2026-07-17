/**
 * Group Benefits quote computation (Phase 2) — pure functions so they're unit-tested.
 * Runs a census across selected approved rate tables and returns per-insurer totals.
 */

export type Relationship = 'self' | 'spouse' | 'child' | string
export type Member = { name: string; category: string; relationship: Relationship; dob?: string | null; age?: number | null; occupation_class?: string | null }

export type RateRow = { product_code: string; member_type?: string | null; plan_code: string; band_label: string; age_min: number | null; age_max: number | null; premium: number; renewal_only?: boolean }

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
}

// A member's relationship maps to which premium table applies (employee vs dependant).
export const memberTypeFor = (relationship: string): 'employee' | 'dependant' =>
  /spouse|child|dependa|dependent|son|daughter|wife|husband|partner/i.test(relationship) ? 'dependant' : 'employee'
export type RateTableInfo = { rate_table_id: string; insurer_id?: string | null; insurer_name: string; age_basis: 'next_birthday' | 'last_birthday'; rates: RateRow[]; rules?: AppliedRules | null }

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
  const f = g.conversion_factor
  if (g.treatment === 'inclusive' && typeof f === 'number' && f > 0) return premium / f  // strip inclusive GST -> net
  return premium
}
export function inRenewalBand(rules: AppliedRules | null | undefined, age: number | null): boolean {
  const rb = rules?.renewal_only_bands
  if (age == null || !Array.isArray(rb)) return false
  return rb.some(b => Array.isArray(b?.band) && b.band.length === 2 && age >= b.band[0] && age <= b.band[1])
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
  const d = new Date(dob), e = new Date(effDate)
  if (isNaN(d.getTime()) || isNaN(e.getTime())) return null
  let last = e.getFullYear() - d.getFullYear()
  const beforeBday = e.getMonth() < d.getMonth() || (e.getMonth() === d.getMonth() && e.getDate() < d.getDate())
  if (beforeBday) last -= 1
  return basis === 'last_birthday' ? last : last + 1
}

// The age to look up for a member against a table: from DOB per the table's basis, else the
// explicitly-provided age (basis unknown — used as-is).
export function memberAge(m: Member, effDate: string, basis: 'next_birthday' | 'last_birthday'): number | null {
  if (m.dob) return ageAt(m.dob, effDate, basis)
  if (m.age != null && isFinite(m.age)) return Math.floor(m.age)
  return null
}

export function findRate(rates: RateRow[], product: string, plan: string | null, age: number | null, memberType?: 'employee' | 'dependant'): { premium: number | null; note: string | null } {
  if (!plan) return { premium: null, note: 'no plan mapped' }
  if (age == null) return { premium: null, note: 'no age' }
  const cand = rates.filter(r => r.product_code === product && r.plan_code === plan)
  if (!cand.length) return { premium: null, note: 'plan not in rate table' }
  // Prefer rows for the member type (employee/dependant); fall back to untyped rows, then
  // any — so tables that don't split by member type still resolve.
  const typed   = memberType ? cand.filter(r => (r.member_type ?? null) === memberType) : []
  const untyped = cand.filter(r => (r.member_type ?? null) === null)
  const pool    = typed.length ? typed : untyped.length ? untyped : cand
  const match = pool.find(r => age >= (r.age_min ?? 0) && (r.age_max == null || age <= r.age_max))
  if (!match) return { premium: null, note: `no band for age ${age}` }
  return { premium: match.premium, note: match.renewal_only ? 'renewal-only band' : null }
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
    let subtotal = 0, missing = 0

    members.forEach((m, i) => {
      const age = memberAge(m, effDate, table.age_basis)
      for (const product of products) {
        const plan = tMap[product]?.[m.category] ?? null
        // Skip products the category isn't mapped to (e.g. staff without a GOS rider).
        if (!plan) continue
        let { premium, note } = findRate(table.rates, product, plan, age, memberTypeFor(m.relationship))
        // Apply the insurer's calculator rules (guarded — no-op when the table has no rules).
        if (rules && premium != null) {
          if (classExcluded(rules, m.occupation_class)) {
            premium = null; note = `class ${m.occupation_class} not eligible`
          } else if (basis === 'new_business' && (note === 'renewal-only band' || inRenewalBand(rules, age))) {
            premium = null; note = 'renewal-only (new business)'
          } else {
            premium = round2(netOfGst(premium, rules) * gFactor)   // net of GST, then group-size factor
          }
        }
        lines.push({ member_index: i, member_name: m.name, relationship: m.relationship, category: m.category, age, rate_table_id: table.rate_table_id, insurer_id: table.insurer_id ?? null, insurer_name: table.insurer_name, product_code: product, plan_code: plan, premium, note })
        if (premium == null) { missing++; continue }
        byProduct[product] = round2((byProduct[product] ?? 0) + premium)
        subtotal = round2(subtotal + premium)
      }
    })

    const gst = round2(subtotal * gstRate)
    per_insurer.push({ rate_table_id: table.rate_table_id, insurer_id: table.insurer_id ?? null, insurer_name: table.insurer_name, by_product: byProduct, subtotal, gst, total: round2(subtotal + gst), missing,
      applied: rules ? { group_factor: gFactor, gst_treatment: typeof rules.gst_treatment === 'object' && rules.gst_treatment ? rules.gst_treatment.treatment ?? null : null } : undefined })
  }

  per_insurer.sort((a, b) => a.total - b.total)   // cheapest first
  return { per_insurer, lines }
}

const round2 = (n: number) => Math.round(n * 100) / 100
