/**
 * Every product priced for every category of an Employment Benefits quotation (eb-quote.ts), from
 * the house workbook. Server only. No model.
 *
 * For each product and category: every plan of every cover priced for that category's members
 * (priceCover), so any plan the broker picks reads a stored price; the Same tier picks and the
 * Lower tier picks (compare-cover.ts: sameTier, lowerTierOf), each with its reason, plan rules
 * applied (ruledTier). A cover a rule prices inside its partner (Income and AIA major medical)
 * costs nothing on its own; AIA major medical has no plan of its own and shows "In hospital
 * premium" (call note 21).
 *
 * The current premium is never estimated here (call note 23): it comes only from a premium or
 * debit note read on the page (currentFromLastYear in eb-quote.ts).
 */
import type { Member } from '@/lib/gb-quote'
import { memberAge } from '@/lib/gb-quote'
import { coverWords } from './compare-words'
import { indexRates, lowerTierOf, priceCover, productOf, ruledTier, sameTier } from './compare-cover'
import { IN_HOSPITAL, type PlanRule } from './plan-pairs'
import { COVERS, PRODUCTS, type Workbook } from './workbook'
import type { CategoryFacts } from './last-year'
import { targetOf, TIERS, type CoverKey, type Design, type Priced, type PricedCategory, type PricedCover } from './eb-quote'

export function priceDesign(input: {
  wb: Workbook; rules: PlanRule[]; effectiveDate: string; basis: 'renewal' | 'new_business'; currentInsurer: string | null
  categories: { name: string; members: Member[]; design?: Partial<Design>; today: Partial<Design>; facts?: CategoryFacts | null }[]
}): Priced {
  const { wb, rules } = input
  const idx = indexRates(wb)
  const benefits: Record<string, Record<string, string>> = {}
  for (const b of wb.benefits) (benefits[`${b.insurer}|${b.cover}|${b.plan}`] ??= {})[b.id] = b.value
  const benefitsOf = (p: string) => (c: string, plan: string) => benefits[`${p}|${c}|${plan}`] ?? {}
  const all = input.categories.flatMap(c => c.members)
  const employeesInCompany = all.filter(m => m.relationship === 'self').length
  const ruleOf = (p: string, cover: string) => rules.find(r => r.product === p && r.cover === cover) ?? null
  const optionsOf = (p: string, cover: string) => {
    const own = (wb.lists[p]?.[cover] ?? []).filter(x => !/FW|WP\/S Pass|WP\/SP/i.test(x))
    return !own.length && ruleOf(p, cover)?.premium === 'included' ? [IN_HOSPITAL] : own
  }
  // Renewal-only age bands apply to the current insurer on a renewal (the workbook's rule); this prices, it never fills Current.
  const current = productOf(input.currentInsurer)
  const premium = (p: string, cover: string, plan: string, ms: Member[]) =>
    !plan ? 0 : ruleOf(p, cover)?.premium === 'included' ? 0
      : priceCover(idx, p, cover, plan, ms, { effectiveDate: input.effectiveDate, renewal: input.basis === 'renewal' && p === current, employeesInCompany }).premium
  const wordsOf = (p: string, cover: string, plan: string) => {
    if (plan !== IN_HOSPITAL) return coverWords(cover, plan, benefitsOf(p)(cover, plan))
    return 'In hospital premium'
  }

  const categories: PricedCategory[] = input.categories.map(cat => {
    const target = targetOf(cat.today, cat.facts)
    const products: PricedCategory['products'] = {}
    for (const p of PRODUCTS) {
      const opts = Object.fromEntries(COVERS.map(c => [c, optionsOf(p, c)]))
      const same = ruledTier(rules, p, sameTier(benefitsOf(p), opts, target, p), opts)
      const lower = ruledTier(rules, p, lowerTierOf(benefitsOf(p), opts, same, p), opts)
      products[p] = Object.fromEntries(TIERS.map(t => [t.key, {
        options: opts[t.cover].map(plan => ({ plan, words: wordsOf(p, t.cover, plan), premium: premium(p, t.cover, plan, cat.members) })),
        pick: same[t.cover]?.plan ?? '',
        locked: rules.some(r => r.product === p && r.cover === t.cover && r.required && (r.match === 'same_plan' || r.premium === 'included')),
        same: same[t.cover] ?? { plan: '', reason: 'none' },
        lower: lower[t.cover] ?? { plan: '', reason: 'none' },
      } satisfies PricedCover])) as Record<CoverKey, PricedCover>
    }
    return {
      name: cat.name, employees: cat.members.filter(m => m.relationship === 'self').length, lives: cat.members.length,
      today: { words: todayWords(target), premium: Object.fromEntries(TIERS.map(t => [t.key, null])) as Record<CoverKey, number | null>, product: null },
      products,
    }
  })
  const notes = ['Term life is not in the house workbook and is not priced here.', 'AIA personal accident is not priced until its rate rule is confirmed.']
  const unpriced = all.filter(m => memberAge(m, input.effectiveDate, 'last_birthday') == null).length
  if (unpriced) notes.push(`${unpriced} ${unpriced === 1 ? 'life has' : 'lives have'} no date of birth or age and ${unpriced === 1 ? 'is' : 'are'} not priced.`)
  return { products: [...PRODUCTS], categories, notes, workbook: wb.file, rules }
}

const money = (n: number) => Number.isFinite(n) ? `S$${Math.round(n).toLocaleString('en-SG')}` : 'As charged'
/** Today's cover per cover, in words, from the target the tiers were matched to. */
function todayWords(t: ReturnType<typeof targetOf>): Record<CoverKey, string> {
  const h = t.hosp
  const ward = h ? `${h.hospital === 'private' ? 'Private' : 'Government'}${h.beds ? ` ${h.beds}-bed` : ''}` : ''
  const hs = !h ? 'Not on the census' : h.limit != null ? `${ward} · ${money(h.limit)} ${h.basis === 'per_disability' ? 'per disability' : 'a year'}` : ward
  const amt = (v: number | null) => v == null ? 'None' : money(v)
  return { hs, mm: amt(t.gmm), gp: t.gpCopay == null ? 'None' : t.gpCopay === 0 ? 'No co-pay' : `${money(t.gpCopay)} co-pay`, sp: amt(t.spLimit), gd: amt(t.dental), pa: amt(t.pa) }
}
