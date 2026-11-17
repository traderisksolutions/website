/**
 * Employment Benefits quotation by category (Jarod, 17 Nov 2026): the census in up to four
 * categories, a cover design per category (one tier below today first, today second), then every
 * product priced per category from the house workbook, by the same rules as Compare cover
 * (compare-cover.ts: matchPlan, priceCover).
 *
 * Headcount is employees only; spouses and children are counted apart and priced on the medical
 * covers. Term life is not in the house workbook, so it is not designed or priced here.
 *
 * Pure apart from nothing: the route loads the workbook and rules and calls priceDesign.
 * Tested in src/__tests__/gb-eb-quote.test.ts.
 */
import type { Member } from '@/lib/gb-quote'
import { memberAge } from '@/lib/gb-quote'
import { amountOf, coverWords } from './compare-words'
import { indexRates, matchPlan, priceCover, productOf } from './compare-cover'
import { applyRules, type PlanRule } from './plan-pairs'
import { COVERS, PRODUCTS, type Workbook } from './workbook'

export const MAX_CATEGORIES = 4
export type CoverKey = 'hs' | 'mm' | 'gp' | 'sp' | 'gd' | 'pa'
type HospTier = { hospital: 'private' | 'government'; beds: number; limit: number; basis: 'per_disability' | 'annual' }

/** The tiers a broker chooses from, lowest first. `amount` null means not covered. */
export const TIERS: { key: CoverKey; cover: (typeof COVERS)[number]; label: string; tiers: { words: string; hosp?: HospTier; amount?: number | null }[] }[] = [
  { key: 'hs', cover: 'Hospital & Surgical', label: 'Hospital & Surgical', tiers: [
    { words: 'Government 4-bed · S$15,000 per disability', hosp: { hospital: 'government', beds: 4, limit: 15_000, basis: 'per_disability' } },
    { words: 'Private 4-bed · S$15,000 per disability', hosp: { hospital: 'private', beds: 4, limit: 15_000, basis: 'per_disability' } },
    { words: 'Private 2-bed · S$20,000 per disability', hosp: { hospital: 'private', beds: 2, limit: 20_000, basis: 'per_disability' } },
    { words: 'Private 1-bed · S$25,000 per disability', hosp: { hospital: 'private', beds: 1, limit: 25_000, basis: 'per_disability' } },
    { words: 'Private 1-bed · S$150,000 a year', hosp: { hospital: 'private', beds: 1, limit: 150_000, basis: 'annual' } },
  ] },
  { key: 'mm', cover: 'Major Medical', label: 'Major medical', tiers: [{ words: 'None', amount: null }, { words: 'S$30,000', amount: 30_000 }, { words: 'S$40,000', amount: 40_000 }, { words: 'S$60,000', amount: 60_000 }] },
  { key: 'gp', cover: 'Outpatient GP', label: 'Outpatient GP', tiers: [{ words: 'S$15 co-pay a visit', amount: 15 }, { words: 'S$10 co-pay a visit', amount: 10 }, { words: 'No co-pay', amount: 0 }] },
  { key: 'sp', cover: 'Outpatient Specialist', label: 'Outpatient specialist', tiers: [{ words: 'None', amount: null }, { words: 'S$800 a year', amount: 800 }, { words: 'S$1,000 a year', amount: 1_000 }, { words: 'S$1,500 a year', amount: 1_500 }] },
  { key: 'gd', cover: 'Dental', label: 'Dental', tiers: [{ words: 'None', amount: null }, { words: 'S$300 a year', amount: 300 }, { words: 'S$500 a year', amount: 500 }, { words: 'S$750 a year', amount: 750 }] },
  { key: 'pa', cover: 'Personal Accident', label: 'Personal accident', tiers: [{ words: 'None', amount: null }, { words: 'S$50,000', amount: 50_000 }, { words: 'S$100,000', amount: 100_000 }, { words: 'S$200,000', amount: 200_000 }] },
]
export const TIER_OF: Record<CoverKey, (typeof TIERS)[number]> = Object.fromEntries(TIERS.map(t => [t.key, t])) as Record<CoverKey, (typeof TIERS)[number]>
/** A design: the tier index per cover. */
export type Design = Record<CoverKey, number>
/** Where nothing on the census says what a category holds: a plain private 4-bed programme. */
export const DEFAULT_DESIGN: Design = { hs: 1, mm: 0, gp: 1, sp: 2, gd: 2, pa: 0 }

/** One tier below today; never down to None for a cover held today; today itself at the floor. */
export function lowerTier(key: CoverKey, today: number): number {
  const floor = TIER_OF[key].tiers[0].amount === null && key !== 'hs' && key !== 'gp' ? 1 : 0
  return today <= floor ? today : today - 1
}

export type CensusCategory = { name: string; employees: number; spouses: number; children: number; lives: number; plan: string | null; today: Partial<Design>; members: Member[] }

const isSpouse = (r: string) => /spouse|wife|husband|partner/i.test(r)
/** Most senior first: directors and founders, then management, then staff, then foreign workers. */
export function seniority(name: string): number {
  const n = name.toLowerCase()
  if (/\b(wp|sp|work\s*permit|s\s*pass|foreign|fw)\b/.test(n)) return 4
  if (/director|founder|partner|owner|c-?suite|\bceo\b|\bcfo\b|chair/.test(n)) return 0
  if (/senior|manag|mgt|mgmt|head|executive director|vp|associate director/.test(n)) return 1
  return 2
}

/** Today's tiers from a hospital plan as the census writes it: "Plan 1 (PTE 1-bed)", "GRH 4-bed". */
export function tiersFromPlan(plan: string | null | undefined): Partial<Design> {
  const s = String(plan ?? '')
  const gov = /\b(grh|gov|government|restructured|public)\b/i.test(s), pte = /\b(pte|private)\b/i.test(s)
  const beds = Number(s.match(/(\d)\s*-?\s*bed/i)?.[1] ?? NaN)
  if (!gov && !pte && !Number.isFinite(beds)) return {}
  if (gov) return { hs: 0 }
  return { hs: beds === 1 ? 3 : beds === 2 ? 2 : 1 }
}

/** The census in categories by its category column, employees counted apart from spouses and children. */
export function censusCategories(members: Member[]): CensusCategory[] {
  const by = new Map<string, Member[]>()
  for (const m of members) { const k = (m.category || 'Default').trim(); by.set(k, [...(by.get(k) ?? []), m]) }
  return [...by.entries()].map(([name, ms]) => {
    const emp = ms.filter(m => m.relationship === 'self')
    const spouses = ms.filter(m => m.relationship !== 'self' && isSpouse(m.relationship)).length
    const counts = new Map<string, number>()
    for (const m of emp) { const v = m.plans?.GHS?.trim(); if (v) counts.set(v, (counts.get(v) ?? 0) + 1) }
    const plan = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return { name: name === 'Default' ? 'All employees' : name, employees: emp.length, spouses, children: ms.length - emp.length - spouses, lives: ms.length, plan, today: tiersFromPlan(plan), members: ms }
  }).sort((a, b) => seniority(a.name) - seniority(b.name) || b.employees - a.employees)
}

/** The starting design for a category: one tier below what it holds today, where today is known. */
export function startDesign(today: Partial<Design>): Design {
  const d = { ...DEFAULT_DESIGN }
  for (const t of TIERS) if (today[t.key] != null) d[t.key] = lowerTier(t.key, today[t.key]!)
  return d
}

export type PlanOption = { plan: string; words: string; premium: number | null }
export type PricedCover = { options: PlanOption[]; pick: string; locked: boolean }
export type PricedCategory = { name: string; employees: number; lives: number; today: { words: Record<CoverKey, string>; premium: Record<CoverKey, number | null>; product: string | null }; products: Record<string, Record<CoverKey, PricedCover>> }
export type Priced = { products: string[]; categories: PricedCategory[]; notes: string[]; workbook: Workbook['file']; rules: PlanRule[] }

const target = (d: Partial<Design>) => {
  const h = d.hs != null ? TIER_OF.hs.tiers[d.hs].hosp! : null
  const amt = (k: CoverKey) => (d[k] != null ? TIER_OF[k].tiers[d[k]!].amount ?? null : null)
  return { hosp: h ? { hospital: h.hospital, beds: h.beds, limit: h.limit, basis: h.basis, coins: 0 } : null, gmm: amt('mm'), gpCopay: amt('gp'), spLimit: amt('sp'), dental: amt('gd') }
}

/** The plan at a product for one cover of a design; '' when the design has no such cover. */
function matchOne(benefitsOf: (c: string, p: string) => Record<string, string>, options: string[], key: CoverKey, d: Partial<Design>): string {
  const t = TIER_OF[key]
  if (d[key] == null) return ''
  if (key !== 'hs' && t.tiers[d[key]!].amount === null) return ''
  if (key === 'pa') {
    const want = t.tiers[d[key]!].amount!
    const scored = options.map(p => ({ p, a: amountOf(benefitsOf(t.cover, p)['pa.death']) })).filter(x => x.a != null)
    return scored.sort((x, y) => Math.abs(Math.log(x.a! / want)) - Math.abs(Math.log(y.a! / want)))[0]?.p ?? options[0] ?? ''
  }
  return matchPlan(benefitsOf, options, t.cover, target(d)).plan
}

/**
 * Every product priced for every category: each cover's plans with their premium for that
 * category's members, the plan matched to the design, and plan rules applied (Income's major
 * medical follows its hospital plan and is priced in it). Today is the current insurer's renewal of
 * the plans nearest today's cover, when the current insurer is one of the five products.
 */
export function priceDesign(input: {
  wb: Workbook; rules: PlanRule[]; effectiveDate: string; basis: 'renewal' | 'new_business'; currentInsurer: string | null
  categories: { name: string; members: Member[]; design: Partial<Design>; today: Partial<Design> }[]
}): Priced {
  const { wb } = input
  const idx = indexRates(wb)
  const benefits: Record<string, Record<string, string>> = {}
  for (const b of wb.benefits) (benefits[`${b.insurer}|${b.cover}|${b.plan}`] ??= {})[b.id] = b.value
  const benefitsOf = (p: string) => (c: string, plan: string) => benefits[`${p}|${c}|${plan}`] ?? {}
  const all = input.categories.flatMap(c => c.members)
  const employeesInCompany = all.filter(m => m.relationship === 'self').length
  const current = productOf(input.currentInsurer)
  const optionsOf = (p: string, cover: string) => (wb.lists[p]?.[cover] ?? []).filter(x => !/FW|WP\/S Pass|WP\/SP/i.test(x))
  const included = (p: string, cover: string) => input.rules.some(r => r.product === p && r.cover === cover && r.premium === 'included')
  const premium = (p: string, cover: string, plan: string, ms: Member[], renewal: boolean) =>
    !plan ? 0 : included(p, cover) ? 0 : priceCover(idx, p, cover, plan, ms, { effectiveDate: input.effectiveDate, renewal, employeesInCompany }).premium

  const categories: PricedCategory[] = input.categories.map(cat => {
    const products: PricedCategory['products'] = {}
    for (const p of PRODUCTS) {
      const renewal = input.basis === 'renewal' && p === current
      const picks: Record<string, string> = {}, opts: Record<string, string[]> = {}
      for (const t of TIERS) { opts[t.cover] = optionsOf(p, t.cover); picks[t.cover] = matchOne(benefitsOf(p), opts[t.cover], t.key, cat.design) }
      const ruled = applyRules(input.rules, p, picks, opts)
      products[p] = Object.fromEntries(TIERS.map(t => [t.key, {
        options: opts[t.cover].map(plan => ({ plan, words: coverWords(t.cover, plan, benefitsOf(p)(t.cover, plan)), premium: premium(p, t.cover, plan, cat.members, renewal) })),
        pick: ruled[t.cover] ?? '',
        locked: input.rules.some(r => r.product === p && r.cover === t.cover && r.required && r.match === 'same_plan'),
      }])) as Record<CoverKey, PricedCover>
    }
    const todayPremium = Object.fromEntries(TIERS.map(t => {
      if (!current || cat.today[t.key] == null) return [t.key, null]
      const plan = matchOne(benefitsOf(current), optionsOf(current, t.cover), t.key, cat.today)
      return [t.key, premium(current, t.cover, plan, cat.members, input.basis === 'renewal')]
    })) as Record<CoverKey, number | null>
    return {
      name: cat.name, employees: cat.members.filter(m => m.relationship === 'self').length, lives: cat.members.length,
      today: { words: Object.fromEntries(TIERS.map(t => [t.key, cat.today[t.key] != null ? t.tiers[cat.today[t.key]!].words : 'Not on the census'])) as Record<CoverKey, string>, premium: todayPremium, product: current },
      products,
    }
  })
  const notes = ['Term life is not in the house workbook and is not priced here.', 'AIA personal accident is not priced until its rate rule is confirmed.']
  if (!current) notes.push(input.currentInsurer ? `${input.currentInsurer} is not one of the five products; today shows the cover only.` : 'No current insurer stated; today shows the cover only.')
  const unpriced = all.filter(m => memberAge(m, input.effectiveDate, 'last_birthday') == null).length
  if (unpriced) notes.push(`${unpriced} ${unpriced === 1 ? 'life has' : 'lives have'} no date of birth or age and ${unpriced === 1 ? 'is' : 'are'} not priced.`)
  return { products: [...PRODUCTS], categories, notes, workbook: wb.file, rules: input.rules }
}

/** A product's premium for one category, from the plans picked per cover. */
export function categoryTotal(c: PricedCategory, product: string, picks: Record<CoverKey, string>): number {
  return TIERS.reduce((sum, t) => sum + (c.products[product][t.key].options.find(o => o.plan === picks[t.key])?.premium ?? 0), 0)
}

