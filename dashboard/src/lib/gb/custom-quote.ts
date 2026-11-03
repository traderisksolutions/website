/**
 * Employee-benefits arithmetic the package cards do not cover. Pure; tested in
 * src/__tests__/gb-custom-quote.test.ts. Every rule below reproduced TRS's quotes exactly in the
 * 4 Nov 2026 reverse-engineering (30 cases, Jun–Nov 2026); the case is named on each.
 *
 *   custom per-head quotes   above the package sizes the insurer gives a rate per head:
 *                            Income prices by family tier (employee only; with spouse or children
 *                            2.5×; family 3.5×: Genscript GHS S$93,394.50); QBE per life, a child
 *                            at 0.8× (Genscript S$568 → S$454)
 *   sum assured              term life and personal accident at a rate per S$1,000 of sum assured,
 *                            flat or a multiple of salary (Genscript GPA S$0.20 × S$7.7m = S$1,540)
 *   renewal load             expiring rate × (1 + load), to whole dollars (Aureus GHS +15%: 187 → 215)
 *   year-end adjustment      a headcount-rated policy (FWMI, GPA) settles on the average change:
 *                            (end − start) / 2 × rate, plus GST
 *   insurer arithmetic       an insurer's stated premium checked against its own rate and basis
 *                            (Genscript GTL: S$1.00 × S$7.7m = S$7,700, billed S$28,962.50)
 */
/** To the cent, half up: 508.545 is 508.55, not the 508.54 binary floating point gives. */
const r2 = (n: number) => Math.round((n + Math.sign(n) * 1e-9) * 100) / 100

export type FamilyTier = 'EO' | 'ES' | 'EC' | 'EF'
/** Income's custom quotes: one employee-only rate per plan, the other tiers by multiple. */
export const INCOME_TIER_MULTIPLE: Record<FamilyTier, number> = { EO: 1, ES: 2.5, EC: 2.5, EF: 3.5 }
/** QBE's custom quotes: a rate per life; a spouse as an employee, a child at 0.8. */
export const QBE_LIFE_MULTIPLE = { employee: 1, spouse: 1, child: 0.8 } as const

export type TierLine = { plan: string; tier: FamilyTier; count: number }
/** Income custom quote: Σ count × employee-only rate of the plan × the tier's multiple. */
export function familyTierPremium(eoRate: Record<string, number>, lines: TierLine[]): { net: number; byPlan: Record<string, number>; missing: string[] } {
  const byPlan: Record<string, number> = {}, missing: string[] = []
  for (const l of lines) {
    const r = eoRate[l.plan]
    if (r == null) { missing.push(l.plan); continue }
    byPlan[l.plan] = r2((byPlan[l.plan] ?? 0) + l.count * r * INCOME_TIER_MULTIPLE[l.tier])
  }
  return { net: r2(Object.values(byPlan).reduce((a, b) => a + b, 0)), byPlan, missing }
}

/** QBE per-life rates from the employee rate: a child is 0.8 of it, to whole dollars. */
export function perLifeRates(employeeRate: number): Record<keyof typeof QBE_LIFE_MULTIPLE, number> {
  return { employee: employeeRate, spouse: employeeRate, child: Math.floor(employeeRate * QBE_LIFE_MULTIPLE.child) }
}

/** Sum assured for one person: flat, or a multiple of annual salary, capped when the plan caps it. */
export function sumAssured(basis: { flat: number } | { salaryMultiple: number; annualSalary: number; cap?: number }): number {
  if ('flat' in basis) return basis.flat
  const v = basis.salaryMultiple * basis.annualSalary
  return basis.cap != null ? Math.min(v, basis.cap) : v
}

/** Premium for a rate per S$1,000 of sum assured over the total sum assured. */
export const perMillePremium = (ratePerThousand: number, totalSumAssured: number): number => r2(ratePerThousand * totalSumAssured / 1000)

/** Renewal rate: the expiring rate with the insurer's load, to whole dollars as insurers state them. */
export const renewalRate = (expiring: number, load: number): number => Math.round(expiring * (1 + load))

/** Year-end settlement of a headcount-rated policy: half the change in heads over the year at the annual rate, plus GST. */
export function yearEndAdjustment(startHeads: number, endHeads: number, annualRate: number, gstRate = 0.09): { net: number; gst: number; total: number } {
  const net = r2((endHeads - startHeads) / 2 * annualRate)
  const gst = r2(net * gstRate)
  return { net, gst, total: r2(net + gst) }
}

export type ArithmeticCheck = { ok: boolean; expected: number; stated: number; diff: number; pct: number; note: string | null }
/** The insurer's stated premium against its own basis; more than 2% (or S$5) apart is flagged. */
export function checkStated(stated: number, expected: number, what: string): ArithmeticCheck {
  const diff = r2(stated - expected)
  const pct = expected ? diff / expected : 0
  const ok = Math.abs(diff) <= Math.max(5, Math.abs(expected) * 0.02)
  return { ok, expected, stated, diff, pct, note: ok ? null : `${what}: the insurer's own basis gives S$${expected.toLocaleString('en-SG', { minimumFractionDigits: 2 })}, it states S$${stated.toLocaleString('en-SG', { minimumFractionDigits: 2 })} (${diff > 0 ? '+' : ''}${Math.round(pct * 100)}%). Ask the insurer before sending it to the client` }
}

const MONEY = String.raw`(?:s\$|sgd)\s*([\d,]+(?:\.\d+)?)\s*(m|million|k)?`
const unit = (n: string, u?: string) => Number(n.replace(/,/g, '')) * (u ? (/^m/i.test(u) ? 1e6 : 1e3) : 1)

/**
 * Reads "S$1.00 per S$1,000 sum assured" and a total sum assured out of an insurer's quote text and
 * checks the stated premium against them. Null when the text does not give the basis.
 */
export function checkPerMilleText(text: string, statedPremium: number | null): ArithmeticCheck | null {
  if (statedPremium == null) return null
  const rate = new RegExp(String.raw`${MONEY}\s*(?:per|/|for every)\s*(?:s\$|sgd)?\s*1,?000\b`, 'i').exec(text)
  const total = new RegExp(String.raw`total (?:sum (?:assured|insured)|sa|si)\D{0,30}?${MONEY}`, 'i').exec(text)
  if (!rate || !total) return null
  return checkStated(statedPremium, perMillePremium(unit(rate[1]), unit(total[1], total[2])), 'Rate per S$1,000 × total sum assured')
}

// ── Custom rates entered for a census ──────────────────────────────────────────────────────

type CensusMember = { category: string; relationship: string }
const isEmployee = (rel: string) => /^(self|employee|ee|staff)$/i.test(rel)
const isSpouse = (rel: string) => /spouse|wife|husband|partner/i.test(rel)

export type CensusCounts = {
  plans: string[]
  /** Employees by plan and family tier: EO alone, ES with a spouse, EC with children, EF both. */
  tiers: Record<string, Record<FamilyTier, number>>
  /** Lives by plan and member type. */
  lives: Record<string, { employee: number; spouse: number; child: number }>
  employees: number
  total: number
}

/** Counts from a census in which each employee is followed by their dependants (src/lib/hr/types.ts toCensus). */
export function censusCounts(census: CensusMember[]): CensusCounts {
  const tiers: CensusCounts['tiers'] = {}, lives: CensusCounts['lives'] = {}
  let cur: { plan: string; spouse: boolean; child: boolean } | null = null
  const close = () => { if (!cur) return; const t: FamilyTier = cur.spouse && cur.child ? 'EF' : cur.spouse ? 'ES' : cur.child ? 'EC' : 'EO'; tiers[cur.plan] ??= { EO: 0, ES: 0, EC: 0, EF: 0 }; tiers[cur.plan][t]++ }
  for (const m of census) {
    const plan = m.category || 'Staff'
    lives[plan] ??= { employee: 0, spouse: 0, child: 0 }
    if (isEmployee(m.relationship)) { close(); cur = { plan, spouse: false, child: false }; lives[plan].employee++; continue }
    if (isSpouse(m.relationship)) { lives[plan].spouse++; if (cur) cur.spouse = true } else { lives[plan].child++; if (cur) cur.child = true }
  }
  close()
  const plans = Object.keys(lives)
  for (const p of plans) tiers[p] ??= { EO: 0, ES: 0, EC: 0, EF: 0 }
  const employees = plans.reduce((s, p) => s + lives[p].employee, 0)
  return { plans, tiers, lives, employees, total: census.length }
}

/**
 * How an insurer prices one product in a custom quote:
 *   tier       a rate per employee by family tier; EO given, others by multiple (Income)
 *   life       a rate per life by member type; spouse as employee, child by multiple (QBE)
 *   per_life   one rate for every life, dependants included (QBE GP+SP, dental)
 *   per_employee  one rate per employee
 *   per_mille  a rate per S$1,000 of the total sum assured (GTL, GPA)
 */
export type ProductRate =
  | { product: string; method: 'tier'; rates: Record<string, number>; multiples?: Partial<Record<FamilyTier, number>> }
  | { product: string; method: 'life'; rates: Record<string, number>; childMultiple?: number }
  | { product: string; method: 'per_life' | 'per_employee'; rate: number }
  | { product: string; method: 'per_mille'; ratePerThousand: number; totalSumAssured: number }

export type CustomQuoteResult = { byProduct: Record<string, number>; net: number; gst: number; total: number; missing: string[] }

/** GST applies to medical and accident cover; term life and critical illness are exempt. */
const GST_FREE = /^(gtl|gci|term life|critical illness|life)\b/i

export function customQuoteTotal(rates: ProductRate[], counts: CensusCounts, gstRate = 0.09): CustomQuoteResult {
  const byProduct: Record<string, number> = {}, missing: string[] = []
  let gstBase = 0
  for (const r of rates) {
    let v = 0
    if (r.method === 'tier') {
      for (const p of counts.plans) {
        const eo = r.rates[p]
        const t = counts.tiers[p]
        if (eo == null) { if (counts.lives[p].employee) missing.push(`${r.product} ${p}`); continue }
        for (const k of ['EO', 'ES', 'EC', 'EF'] as FamilyTier[]) v += t[k] * eo * (r.multiples?.[k] ?? INCOME_TIER_MULTIPLE[k])
      }
    } else if (r.method === 'life') {
      for (const p of counts.plans) {
        const e = r.rates[p]
        const l = counts.lives[p]
        if (e == null) { if (l.employee + l.spouse + l.child) missing.push(`${r.product} ${p}`); continue }
        v += (l.employee + l.spouse) * e + l.child * Math.floor(e * (r.childMultiple ?? QBE_LIFE_MULTIPLE.child))
      }
    } else if (r.method === 'per_mille') v = perMillePremium(r.ratePerThousand, r.totalSumAssured)
    else v = r.rate * (r.method === 'per_life' ? counts.total : counts.employees)
    byProduct[r.product] = r2(v)
    if (!GST_FREE.test(r.product)) gstBase += v
  }
  const net = r2(Object.values(byProduct).reduce((a, b) => a + b, 0))
  const gst = r2(gstBase * gstRate)
  return { byProduct, net, gst, total: r2(net + gst), missing }
}

// ── Request parsing ─────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e9 ? v : null
const label = (v: unknown, max = 60): string | null => typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null

/** One product's rates from the request, or the reason it is not valid. */
export function parseProductRate(v: unknown): ProductRate | string {
  if (!v || typeof v !== 'object') return 'Each product needs its rates'
  const o = v as Record<string, unknown>
  const product = label(o.product, 40)
  if (!product) return 'Each product needs a name'
  const plans = (x: unknown): Record<string, number> | null => {
    if (!x || typeof x !== 'object') return null
    const out: Record<string, number> = {}
    for (const [k, r] of Object.entries(x as Record<string, unknown>)) { const n = num(r); const p = label(k, 80); if (p && n != null) out[p] = n }
    return Object.keys(out).length ? out : null
  }
  switch (o.method) {
    case 'tier': { const rates = plans(o.rates); return rates ? { product, method: 'tier', rates } : `${product}: enter a rate for each plan` }
    case 'life': { const rates = plans(o.rates); const c = o.child_multiple == null ? undefined : num(o.child_multiple) ?? undefined; return rates ? { product, method: 'life', rates, childMultiple: c } : `${product}: enter a rate for each plan` }
    case 'per_life': case 'per_employee': { const rate = num(o.rate); return rate != null ? { product, method: o.method, rate } : `${product}: enter the rate` }
    case 'per_mille': { const r = num(o.rate_per_thousand), t = num(o.total_sum_assured); return r != null && t ? { product, method: 'per_mille', ratePerThousand: r, totalSumAssured: t } : `${product}: enter the rate per S$1,000 and the total sum assured` }
    default: return `${product}: choose how it is priced`
  }
}

