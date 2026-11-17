/**
 * Every product priced for every category of an Employment Benefits quotation (eb-quote.ts), from
 * the house workbook by the Compare cover rules (compare-cover.ts: matchPlan, priceCover). Server
 * only. No model.
 */
import type { Member } from '@/lib/gb-quote'
import { memberAge } from '@/lib/gb-quote'
import { amountOf, coverWords } from './compare-words'
import { indexRates, matchPlan, priceCover, productOf } from './compare-cover'
import { applyRules, type PlanRule } from './plan-pairs'
import { PRODUCTS, type Workbook } from './workbook'
import { TIER_OF, TIERS, type CoverKey, type Design, type Priced, type PricedCategory, type PricedCover } from './eb-quote'

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

