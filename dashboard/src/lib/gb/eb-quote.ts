/**
 * Employment Benefits quotation by category (Jarod, 17 Nov 2026): the census in up to four
 * categories, a cover design per category (one tier below today first, today second), then every
 * product priced per category from the house workbook, by the same rules as Compare cover
 * (compare-cover.ts: matchPlan, priceCover).
 *
 * Headcount is employees only; spouses and children are counted apart and priced on the medical
 * covers. Term life is not in the house workbook, so it is not designed or priced here.
 *
 * Browser-safe: the census and design here; pricing in eb-price.ts (server).
 * Tested in src/__tests__/gb-eb-quote.test.ts.
 */
import type { Member } from '@/lib/gb-quote'
import type { CategoryFacts, LastYear, LastYearCategory } from './last-year'
import type { PlanRule } from './plan-pairs'
import type { COVERS, Workbook } from './workbook'

export const MAX_CATEGORIES = 4
export type CoverKey = 'hs' | 'mm' | 'gp' | 'sp' | 'gd' | 'pa'
type HospTier = { hospital: 'private' | 'government'; beds: number; limit: number; basis: 'per_disability' | 'annual' }

/** The tiers a broker chooses from, lowest first. `amount` null means not covered. */
export const TIERS: { key: CoverKey; cover: (typeof COVERS)[number]; label: string; tiers: { words: string; hosp?: HospTier; amount?: number | null }[] }[] = [
  { key: 'hs', cover: 'Hospital & Surgical', label: 'Hospital & Surgical', tiers: [
    { words: 'Government 4-bed · S$15,000 per disability', hosp: { hospital: 'government', beds: 4, limit: 15_000, basis: 'per_disability' } },
    { words: 'Government 1-bed · S$15,000 per disability', hosp: { hospital: 'government', beds: 1, limit: 15_000, basis: 'per_disability' } },
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
export const DEFAULT_DESIGN: Design = { hs: 2, mm: 0, gp: 1, sp: 2, gd: 2, pa: 0 }

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
  if (gov) return { hs: beds === 1 || beds === 2 ? 1 : 0 }
  return { hs: beds === 1 ? 4 : beds === 2 ? 3 : 2 }
}

/** The category a person is priced in: the census column, "All employees" where it has none. */
export function categoryName(m: Pick<Member, 'category'>): string {
  const k = (m.category || '').trim()
  return !k || k === 'Default' ? 'All employees' : k
}

/** The census in categories by its category column, employees counted apart from spouses and children. */
export function censusCategories(members: Member[]): CensusCategory[] {
  const by = new Map<string, Member[]>()
  for (const m of members) { const k = categoryName(m); by.set(k, [...(by.get(k) ?? []), m]) }
  return [...by.entries()].map(([name, ms]) => {
    const emp = ms.filter(m => m.relationship === 'self')
    const spouses = ms.filter(m => m.relationship !== 'self' && isSpouse(m.relationship)).length
    const counts = new Map<string, number>()
    for (const m of emp) { const v = m.plans?.GHS?.trim(); if (v) counts.set(v, (counts.get(v) ?? 0) + 1) }
    const plan = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return { name, employees: emp.length, spouses, children: ms.length - emp.length - spouses, lives: ms.length, plan, today: tiersFromPlan(plan), members: ms }
  }).sort((a, b) => seniority(a.name) - seniority(b.name) || b.employees - a.employees)
}

/** The starting design for a category: one tier below what it holds today, where today is known. */
export function startDesign(today: Partial<Design>): Design {
  const d = { ...DEFAULT_DESIGN }
  for (const t of TIERS) if (today[t.key] != null) d[t.key] = lowerTier(t.key, today[t.key]!)
  return d
}


const nearest = (key: CoverKey, want: number) => {
  const t = TIER_OF[key].tiers
  let best = -1, gap = Infinity
  t.forEach((x, i) => { if (x.amount == null) return; const g = Math.abs(Math.log((x.amount + 1) / (want + 1))); if (g < gap) { gap = g; best = i } })
  return best
}
/** Today's tiers from last year's policy, as read for one category: the nearest tier per cover; None where the policy has no such cover. */
export function tiersFromFacts(f: CategoryFacts, plans: LastYearCategory['plans']): Partial<Design> {
  const out: Partial<Design> = {}
  if (f.hospital && f.beds) {
    const hs = TIER_OF.hs.tiers
    let best = 0, score = Infinity
    hs.forEach((x, i) => {
      const h = x.hosp!
      const sc = (h.hospital !== f.hospital ? 100 : 0) + Math.abs(Math.log2(h.beds / f.beds!)) * 20 + (f.limitKind && h.basis !== f.limitKind ? 6 : 0) + (f.limit ? Math.abs(Math.log((h.limit + 1) / (f.limit + 1))) : 0)
      if (sc < score) { score = sc; best = i }
    })
    out.hs = best
  }
  const held = (c: string, v: number | null, key: CoverKey) => { if (v != null && v > 0) out[key] = nearest(key, v); else if (!(c in plans)) out[key] = 0 }
  held('EMM', f.gmm, 'mm'); held('GOSC', f.spLimit, 'sp'); held('GD', f.dentalLimit, 'gd'); held('GPA', f.pa, 'pa')
  if (f.gpCopay != null) out.gp = nearest('gp', f.gpCopay)
  return out
}
/** Last year's policy laid over the census: each census category takes the policy category of the same name, or the only one. */
export function todayFromLastYear(ly: LastYear, names: string[]): Record<string, Partial<Design>> {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').slice(0, 5)
  const out: Record<string, Partial<Design>> = {}
  for (const n of names) {
    const c = ly.categories.length === 1 ? ly.categories[0] : ly.categories.find(x => key(x.name) && key(x.name) === key(n))
    if (c) out[n] = tiersFromFacts(c.facts, c.plans)
  }
  return out
}
/** Last year's total premium, net of GST. */
export const lastYearNet = (ly: LastYear | null): number | null => {
  if (!ly) return null
  const t = ly.total ?? (Object.keys(ly.premiumByCover).length ? Object.values(ly.premiumByCover).reduce<number>((a, b) => a + (b ?? 0), 0) : null)
  return t == null ? null : Math.round((ly.gst === 'included' ? t / 1.09 : t) * 100) / 100
}

export type PlanOption = { plan: string; words: string; premium: number | null }
export type PricedCover = { options: PlanOption[]; pick: string; locked: boolean }
export type PricedCategory = { name: string; employees: number; lives: number; today: { words: Record<CoverKey, string>; premium: Record<CoverKey, number | null>; product: string | null }; products: Record<string, Record<CoverKey, PricedCover>> }
export type Priced = { products: string[]; categories: PricedCategory[]; notes: string[]; workbook: Workbook['file']; rules: PlanRule[] }

/** A product's premium for one category, from the plans picked per cover. */
export function categoryTotal(c: PricedCategory, product: string, picks: Record<CoverKey, string>): number {
  return TIERS.reduce((sum, t) => sum + (c.products[product][t.key].options.find(o => o.plan === picks[t.key])?.premium ?? 0), 0)
}


/** The five house insurers as /eb names them, in the Current insurer list. */
export const HOUSE_INSURERS = ['QBE (Steadfast MCare+)', 'Raffles Health (RCC Enhanced III)', 'Income (FlexCare)', 'Singlife (MyBenefits Plus)', 'AIA (Flexi Vital Care Plus)'] as const
const HOUSE_MATCH: [RegExp, (typeof HOUSE_INSURERS)[number]][] = [
  [/\bqbe\b|steadfast|mcare/i, HOUSE_INSURERS[0]], [/raffles|\brcc\b/i, HOUSE_INSURERS[1]], [/\bincome\b|ntuc|flexcare/i, HOUSE_INSURERS[2]],
  [/singlife|singapore life|mybenefits/i, HOUSE_INSURERS[3]], [/\baia\b|flexi vital/i, HOUSE_INSURERS[4]],
]
export const UNKNOWN_INSURER = 'Unknown: '
/** The house insurer a read names, or "Unknown: <the name read>" (Jarod, 20 Nov 2026): never a guess. '' when nothing was read. Pure. */
export function insurerOf(read: string | null | undefined): string {
  const s = String(read ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return HOUSE_MATCH.find(([re]) => re.test(s))?.[1] ?? `${UNKNOWN_INSURER}${s.slice(0, 80)}`
}
