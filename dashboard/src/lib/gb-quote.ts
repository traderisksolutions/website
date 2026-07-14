/**
 * Group Benefits quote computation (Phase 2) — pure functions so they're unit-tested.
 * Runs a census across selected approved rate tables and returns per-insurer totals.
 */

export type Relationship = 'self' | 'spouse' | 'child' | string
export type Member = { name: string; category: string; relationship: Relationship; dob?: string | null; age?: number | null }

export type RateRow = { product_code: string; plan_code: string; band_label: string; age_min: number | null; age_max: number | null; premium: number; renewal_only?: boolean }
export type RateTableInfo = { rate_table_id: string; insurer_id?: string | null; insurer_name: string; age_basis: 'next_birthday' | 'last_birthday'; rates: RateRow[] }
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

export function findRate(rates: RateRow[], product: string, plan: string | null, age: number | null): { premium: number | null; note: string | null } {
  if (!plan) return { premium: null, note: 'no plan mapped' }
  if (age == null) return { premium: null, note: 'no age' }
  const cand = rates.filter(r => r.product_code === product && r.plan_code === plan)
  if (!cand.length) return { premium: null, note: 'plan not in rate table' }
  const match = cand.find(r => age >= (r.age_min ?? 0) && (r.age_max == null || age <= r.age_max))
  if (!match) return { premium: null, note: `no band for age ${age}` }
  return { premium: match.premium, note: match.renewal_only ? 'renewal-only band' : null }
}

export function computeQuote(
  members: Member[], tables: RateTableInfo[], categoryMap: CategoryMap, products: string[], gstRate: number, effDate: string,
): QuoteResult {
  const lines: QuoteLine[] = []
  const per_insurer: InsurerResult[] = []

  for (const table of tables) {
    const tMap = categoryMap[table.rate_table_id] ?? {}
    const byProduct: Record<string, number> = {}
    let subtotal = 0, missing = 0

    members.forEach((m, i) => {
      const age = memberAge(m, effDate, table.age_basis)
      for (const product of products) {
        const plan = tMap[product]?.[m.category] ?? null
        // Skip products the category isn't mapped to (e.g. staff without a GOS rider).
        if (!plan) continue
        const { premium, note } = findRate(table.rates, product, plan, age)
        lines.push({ member_index: i, member_name: m.name, relationship: m.relationship, category: m.category, age, rate_table_id: table.rate_table_id, insurer_id: table.insurer_id ?? null, insurer_name: table.insurer_name, product_code: product, plan_code: plan, premium, note })
        if (premium == null) { missing++; continue }
        byProduct[product] = round2((byProduct[product] ?? 0) + premium)
        subtotal = round2(subtotal + premium)
      }
    })

    const gst = round2(subtotal * gstRate)
    per_insurer.push({ rate_table_id: table.rate_table_id, insurer_id: table.insurer_id ?? null, insurer_name: table.insurer_name, by_product: byProduct, subtotal, gst, total: round2(subtotal + gst), missing })
  }

  per_insurer.sort((a, b) => a.total - b.total)   // cheapest first
  return { per_insurer, lines }
}

const round2 = (n: number) => Math.round(n * 100) / 100
