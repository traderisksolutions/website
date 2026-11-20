/**
 * Compare cover: today's plan beside the five house products, every cover chosen by what it pays
 * and what it costs against today, every benefit row from the brochures (13 Nov 2026, Jarod).
 *
 * One price is kept per plan of each cover, per category: any combination the broker picks is a
 * sum, so a change of selection reads stored prices and recomputes nothing. Prices come from the
 * house workbook's rate rows (src/lib/gb/workbook.ts) by the workbook's own rules: RCC on age next
 * birthday, the others on age last birthday; dependants on medical covers only; RCC's group-size
 * factor on its medical lines; AIA's dependant tables; personal accident by occupation class;
 * renewal-only age bands only for the current insurer on a renewal. These rules reproduce the
 * workbook's own Summary to the dollar (Gembridge, 15 Oct 2026).
 *
 * The plan matched at each insurer: same hospital type and ward first, then co-insurance and limit
 * basis, then the nearest limit; for the other covers, the nearest amount. Pure; tested in
 * src/__tests__/gb-compare-cover.test.ts.
 */
import { memberAge, type Member } from '../gb-quote'
import { ALL, planValue, type Schedule } from './current'
import { COVERS, MEDICAL, PRODUCTS, type Product, type Workbook, type WbRate } from './workbook'
import { amountOf, documentHref } from './compare-words'
import { applyRules, type PlanRule } from './plan-pairs'
import type { LastYear, LastYearCover } from './last-year'
export { amountOf }

export type CompareCategory = { key: string; name: string; lives: number; employees: number }
export type Picks = Record<string, Record<string, string>>          // category → cover → plan ('' = none)
export type CompareData = {
  quotationId: string
  effectiveDate: string; basis: 'renewal' | 'new_business'
  lives: number; employees: number
  categories: CompareCategory[]
  /** Lives left out: foreign-worker plans, priced on their own cover. */
  leftOut: number
  today: {
    product: Product | null; label: string; picks: Picks; lastYearTotal: number | null
    /** Today's premium for the year, net of GST: last year's policy when it states one, else the current insurer's renewal of the same plans. */
    total: number | null; source: 'last_year' | 'renewal' | null
    premiums: Record<string, Record<string, number | null>>                        // category → cover
    /** Today's cover as the benefit rows read it: from the schedule and last year's policy, numbers only. */
    benefits: Record<string, Record<string, Record<string, string>>>               // category → cover → id → value
    policy: TodayPolicy | null
  }
  rules: PlanRule[]
  products: readonly Product[]
  picks: Record<string, Picks>                                       // product → picks
  options: Record<string, Record<string, string[]>>                  // product → cover → plans
  prices: Record<string, Record<string, Record<string, Record<string, number | null>>>> // category → product → cover → plan
  benefits: Record<string, Record<string, string>>                   // product|cover|plan → id → value
  labels: Record<string, [string, string]>                           // id → [cover, label]
  why: Record<string, string[]>                                      // product → how its plans were chosen
  notes: string[]
  workbook: Workbook['file']
}

export type TodayPolicy = {
  insurer: string | null; product: string | null; policyNumber: string | null; periodFrom: string | null; periodTo: string | null
  total: number | null; gstRemoved: boolean; sumMatches: boolean | null
  documents: { file: string; kind: string; href: string | null }[]
}

const HOSP = 'Hospital & Surgical'
export const GST = 0.09
const COVER_OF_LAST: Partial<Record<LastYearCover, string>> = { GHS: 'Hospital & Surgical', EMM: 'Major Medical', GOPC: 'Outpatient GP', GOSC: 'Outpatient Specialist', GD: 'Dental', GPA: 'Personal Accident' }

const usd = (n: number) => Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-SG')}` : 'As charged'
/** Today's cover as benefit rows, from numbers: "Private", "1-bed", "$150,000", "Per disability", "20%". Pure. */
export function factsAsBenefits(t: Target & { pa?: number | null }): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  if (t.hosp) out[HOSP] = {
    'ghs.hospital_type': t.hosp.hospital === 'private' ? 'Private' : 'Government',
    ...(t.hosp.beds ? { 'ghs.room_board': `${t.hosp.beds}-bed` } : {}),
    ...(t.hosp.limit != null ? { 'ghs.annual_limit': usd(t.hosp.limit) } : {}),
    'ghs.limit_basis': t.hosp.basis === 'per_disability' ? 'Per disability' : 'Annual',
    'ghs.copay': t.hosp.coins ? `${t.hosp.coins}%` : 'Nil',
  }
  if (t.gmm != null) out['Major Medical'] = { 'gmm.annual_limit': usd(t.gmm) }
  if (t.gpCopay != null) out['Outpatient GP'] = { 'gp.copay': t.gpCopay === 0 ? 'Nil' : usd(t.gpCopay) }
  if (t.spLimit != null) out['Outpatient Specialist'] = { 'sp.annual_limit': usd(t.spLimit) }
  if (t.dental != null) out.Dental = { 'dental.annual_limit': usd(t.dental) }
  if (t.pa != null) out['Personal Accident'] = { 'pa.death': usd(t.pa) }
  return out
}
export const productOf = (insurer: string | null | undefined): Product | null => {
  const s = (insurer ?? '').toLowerCase()
  if (/qbe|steadfast|mcare/.test(s)) return 'Steadfast MCare+'
  if (/raffles|rcc/.test(s)) return 'RCC Enhanced III'
  if (/income/.test(s)) return 'Income FlexCare'
  if (/singlife|singapore life/.test(s)) return 'Singlife MyBenefits Plus'
  if (/aia/.test(s)) return 'AIA Flexi Vital Care Plus'
  return null
}

type HospFacts = { hospital: 'private' | 'government'; beds: number | null; limit: number | null; basis: 'annual' | 'per_disability'; coins: number }
/** A hospital plan as numbers. QBE Steadfast MCare+ is an annual policy limit on every plan (call note 22, 19 Nov 2026), whatever a row says. */
export function hospitalFacts(b: Record<string, string>, product?: string | null): HospFacts {
  const type = (b['ghs.hospital_type'] ?? '').toLowerCase()
  const beds = Number((b['ghs.room_board'] ?? '').match(/(\d)\s*-?\s*bed/i)?.[1] ?? NaN)
  const lim = b['ghs.annual_limit'] ?? ''
  const basis = product === 'Steadfast MCare+' ? 'annual' : /disab/i.test(b['ghs.limit_basis'] ?? '') || /as charged/i.test(lim) ? 'per_disability' : 'annual'
  const coins = Number((b['ghs.copay'] ?? '').match(/(\d+)\s*%/)?.[1] ?? 0)
  return { hospital: /priv|pte/.test(type) ? 'private' : 'government', beds: Number.isFinite(beds) ? beds : null, limit: amountOf(lim), basis, coins }
}

const distance = (a: number | null, b: number | null) => {
  if (a == null || b == null) return 5
  const x = Number.isFinite(a) ? a : 1e7, y = Number.isFinite(b) ? b : 1e7
  return Math.abs(Math.log((x + 1) / (y + 1)))
}

type Target = { hosp: HospFacts | null; gmm: number | null; gpCopay: number | null; spLimit: number | null; dental: number | null }

/** The plan at a product nearest today's cover, with the reason in words. */
export function matchPlan(benefitsOf: (cover: string, plan: string) => Record<string, string>, plans: string[], cover: string, t: Target): { plan: string; why: string } {
  const usable = plans.filter(p => !/FW|WP\/S Pass|WP\/SP/i.test(p))
  if (!usable.length) return { plan: '', why: `${cover}: not sold` }
  if (cover === HOSP) {
    if (!t.hosp) return { plan: usable[0], why: `${cover}: no current plan stated; first plan shown` }
    const target = t.hosp
    const scored = usable.map(p => {
      const f = hospitalFacts(benefitsOf(cover, p))
      const s = (f.hospital !== target.hospital ? 100 : 0) + (f.beds != null && target.beds != null && f.beds !== target.beds ? 20 * Math.abs(Math.log2(f.beds / target.beds)) : 0)
        + (f.coins !== target.coins ? 6 : 0) + (f.basis !== target.basis ? 2 : 0) + distance(f.limit, target.limit)
      return { p, s, f }
    }).sort((a, b) => a.s - b.s)
    const best = scored[0]
    const bits = [best.f.hospital === target.hospital && best.f.beds === target.beds ? 'same hospital type and ward' : best.f.hospital !== target.hospital ? `no ${target.hospital} plan; nearest ${best.f.hospital}` : `nearest ward ${best.f.beds}-bed`,
      best.f.basis !== target.basis ? `limit ${best.f.basis === 'annual' ? 'a year' : 'per disability'} where today's is ${target.basis === 'annual' ? 'a year' : 'per disability'}` : 'nearest limit']
    return { plan: best.p, why: `${cover}: ${best.p} — ${bits.join('; ')}` }
  }
  const key: Record<string, string> = { 'Major Medical': 'gmm.annual_limit', 'Outpatient GP': 'gp.copay', 'Outpatient Specialist': 'sp.annual_limit', Dental: 'dental.annual_limit', 'Personal Accident': 'pa.death' }
  const want = cover === 'Major Medical' ? t.gmm : cover === 'Outpatient GP' ? t.gpCopay : cover === 'Outpatient Specialist' ? t.spLimit : cover === 'Dental' ? t.dental : null
  if (want == null) return { plan: '', why: `${cover}: none today` }
  const scored = usable.map(p => {
    const v = benefitsOf(cover, p)[key[cover]] ?? ''
    const n = cover === 'Outpatient GP' ? (/nil|^0|no co-pay/i.test(v) || /no co-pay/i.test(p) ? 0 : amountOf(v)) : amountOf(v)
    return { p, s: cover === 'Outpatient GP' ? Math.abs((n ?? 99) - want) : distance(n, want) }
  }).sort((a, b) => a.s - b.s)
  return { plan: scored[0].p, why: `${cover}: ${scored[0].p} — nearest to today's` }
}

type RateIndex = Map<string, WbRate[]>
export const indexRates = (wb: Workbook): RateIndex => {
  const m: RateIndex = new Map()
  for (const r of wb.rates) { const k = `${r.insurer}|${r.cover}|${r.plan}`; const l = m.get(k) ?? []; l.push(r); m.set(k, l) }
  return m
}

/** One cover of one plan for a group of members. Null when the product has no rate for anyone in it. */
export function priceCover(idx: RateIndex, product: string, cover: string, plan: string, members: Member[], o: { effectiveDate: string; renewal: boolean; employeesInCompany: number }): { premium: number | null; missing: number } {
  const rows = idx.get(`${product}|${cover}|${plan}`)
  if (!rows?.length) return { premium: null, missing: members.length }
  if (product === 'AIA Flexi Vital Care Plus' && cover === 'Outpatient GP') return { premium: 0, missing: 0 } // in AIA's GP and specialist rider
  // AIA's accident rows carry two rates per class and the workbook's rule for them is not on file: not priced rather than guessed.
  if (product === 'AIA Flexi Vital Care Plus' && cover === 'Personal Accident') return { premium: null, missing: 0 }
  let t = 0, missing = 0, priced = 0
  const anb = product === 'RCC Enhanced III'
  for (const m of members) {
    const ee = m.relationship === 'self'
    if (!ee && !MEDICAL.includes(cover)) continue
    const age = memberAge(m, o.effectiveDate, anb ? 'next_birthday' : 'last_birthday')
    const cls = `Class ${String(m.occupation_class ?? '1').match(/\d/)?.[0] ?? '1'}`
    const hit = age == null ? undefined : rows.find(r => age >= r.from && age <= r.to && (!r.renewalOnly || o.renewal) && (r.cls == null || r.cls === cls) && (r.life == null || r.life === (ee ? 'EE' : 'Dep')))
    if (!hit) { missing++; continue }
    t += hit.net; priced++
  }
  if (product === 'RCC Enhanced III' && MEDICAL.includes(cover)) {
    const n = o.employeesInCompany
    t *= n === 1 ? 1.5 : n >= 10 ? 0.9 : n >= 5 ? 0.95 : 1
  }
  return { premium: priced ? Math.round(t * 100) / 100 : null, missing }
}

/** The census in categories: one per hospital plan on the census (else the census category). */
export function categoriesOf(members: Member[], schedule: Schedule | null): { key: string; name: string; members: Member[] }[] {
  const by = new Map<string, Member[]>()
  for (const m of members) {
    const v = planValue(m.plans?.GHS) ?? (m.plans && Object.keys(m.plans).length ? null : ALL)
    const k = v ?? `cat:${m.category || 'All'}`
    if (v && schedule?.GHS[v]?.foreignWorker) continue
    by.set(k, [...(by.get(k) ?? []), m])
  }
  return [...by.entries()].map(([key, ms]) => ({ key, name: key === ALL ? 'Everyone' : key.startsWith('cat:') ? key.slice(4) : /^\d+$/.test(key) ? `Plan ${key}` : key, members: ms }))
    .sort((a, b) => b.members.length - a.members.length)
}

/**
 * Today's cover for a category, as numbers: each cover's plan is the one most of the category's
 * employees hold on the census (OUE: hospital plan 6 with GP plan 2), read through the schedule.
 */
function targetFor(key: string, members: Member[], schedule: Schedule | null): Target {
  const s = schedule
  const mode = (cover: 'GHS' | 'EMM' | 'GOPC' | 'GOSC' | 'GD') => {
    if (!s) return null
    const map = s[cover] as Record<string, unknown>
    const counts = new Map<string, number>()
    for (const m of members) { if (m.relationship !== 'self') continue; const v = planValue(m.plans?.[cover]) ?? (m.plans && Object.keys(m.plans).length ? null : ALL); if (v && v in map) counts.set(v, (counts.get(v) ?? 0) + 1) }
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (cover === 'GHS' ? key : null)
    return top != null && top in map ? map[top] : Object.keys(map).length === 1 ? Object.values(map)[0] : null
  }
  const h = mode('GHS') as Schedule['GHS'][string] | null
  return {
    hosp: h ? { hospital: h.hospital, beds: h.beds, limit: h.limit, basis: h.limitKind, coins: h.coins } : null,
    gmm: (mode('EMM') as number | null) ?? null, gpCopay: (mode('GOPC') as number | null) ?? null, spLimit: (mode('GOSC') as number | null) ?? null, dental: (mode('GD') as number | null) ?? null,
  }
}

export function buildCompare(input: {
  quotationId: string; wb: Workbook; members: Member[]; schedule: Schedule | null; effectiveDate: string; basis: 'renewal' | 'new_business'
  currentInsurer: string | null; lastYearTotal?: number | null; saved?: Record<string, Picks> | null
  lastYear?: LastYear | null; rules?: PlanRule[]
}): CompareData {
  const rules = input.rules ?? []
  const { wb } = input
  const idx = indexRates(wb)
  const benefits: CompareData['benefits'] = {}, labels: CompareData['labels'] = {}
  for (const b of wb.benefits) { (benefits[`${b.insurer}|${b.cover}|${b.plan}`] ??= {})[b.id] = b.value; labels[b.id] ??= [b.cover, b.label] }
  const benefitsOf = (p: string) => (cover: string, plan: string) => benefits[`${p}|${cover}|${plan}`] ?? {}
  const cats = categoriesOf(input.members, input.schedule)
  const employeesInCompany = input.members.filter(m => m.relationship === 'self').length
  const current = productOf(input.currentInsurer)
  const options: CompareData['options'] = {}
  for (const p of PRODUCTS) { options[p] = {}; for (const c of COVERS) options[p][c] = (wb.lists[p]?.[c] ?? []).filter(x => !/FW|WP\/S Pass|WP\/SP/i.test(x)) }
  const prices: CompareData['prices'] = {}
  for (const cat of cats) {
    prices[cat.key] = {}
    for (const p of PRODUCTS) {
      prices[cat.key][p] = {}
      const renewal = input.basis === 'renewal' && p === current
      for (const c of COVERS) {
        prices[cat.key][p][c] = {}
        for (const plan of options[p][c]) prices[cat.key][p][c][plan] = priceCover(idx, p, c, plan, cat.members, { effectiveDate: input.effectiveDate, renewal, employeesInCompany }).premium
      }
    }
  }
  // A cover the partner's rate carries (Income's major medical) costs nothing on its own.
  for (const r of rules) if (r.premium === 'included') for (const cat of cats) for (const plan of options[r.product]?.[r.cover] ?? []) if (prices[cat.key][r.product]?.[r.cover]) prices[cat.key][r.product][r.cover][plan] = 0
  const picks: CompareData['picks'] = {}, why: CompareData['why'] = {}
  for (const p of PRODUCTS) {
    picks[p] = {}; why[p] = []
    for (const cat of cats) {
      const t = targetFor(cat.key, cat.members, input.schedule)
      picks[p][cat.key] = {}
      for (const c of COVERS) {
        const m = matchPlan(benefitsOf(p), options[p][c], c, t)
        picks[p][cat.key][c] = m.plan
        if (m.plan || c === HOSP) why[p].push(`${cats.length > 1 ? `${cat.name} · ` : ''}${m.why}`)
      }
    }
    const saved = input.saved?.[p]
    if (saved) for (const k of Object.keys(saved)) if (picks[p][k]) picks[p][k] = { ...picks[p][k], ...saved[k] }
    for (const k of Object.keys(picks[p])) picks[p][k] = applyRules(rules, p, picks[p][k], options[p])
  }
  const todayPicks = current ? JSON.parse(JSON.stringify(picks[current])) as Picks : Object.fromEntries(cats.map(c => [c.key, Object.fromEntries(COVERS.map(x => [x, '']))]))
  const ly = input.lastYear ?? null
  const one = ly?.categories.length === 1 ? ly.categories[0].facts : null
  const todayBenefits: CompareData['today']['benefits'] = {}
  for (const cat of cats) {
    let t = targetFor(cat.key, cat.members, input.schedule)
    if (!input.schedule && one) t = { hosp: one.hospital && one.beds && one.limitKind ? { hospital: one.hospital, beds: one.beds, limit: one.limit, basis: one.limitKind, coins: one.coins ?? 0 } : null, gmm: one.gmm, gpCopay: one.gpCopay, spLimit: one.spLimit, dental: one.dentalLimit }
    const facts = factsAsBenefits({ ...t, pa: cats.length === 1 ? one?.pa ?? null : null })
    todayBenefits[cat.key] = {}
    for (const c of COVERS) {
      // The current insurer's brochure fills the rows the schedule does not state; the schedule's numbers win.
      const brochure = current && todayPicks[cat.key]?.[c] ? benefits[`${current}|${c}|${todayPicks[cat.key][c]}`] ?? {} : {}
      const v = { ...brochure, ...facts[c] }
      if (Object.keys(v).length) todayBenefits[cat.key][c] = v
    }
  }
  const k = ly?.gst === 'included' ? 1 / (1 + GST) : 1
  const net = (n: number | null | undefined) => n == null ? null : Math.round(n * k * 100) / 100
  const lyCovers = Object.entries(ly?.premiumByCover ?? {}).filter(([c]) => COVER_OF_LAST[c as LastYearCover])
  const lyTotal = net(ly?.total ?? (Object.keys(ly?.premiumByCover ?? {}).length ? Object.values(ly!.premiumByCover).reduce((a, b) => a + (b ?? 0), 0) : input.lastYearTotal ?? null))
  const todayPremiums: CompareData['today']['premiums'] = {}
  let todayTotal: number | null = null, source: CompareData['today']['source'] = null
  if (lyTotal != null || lyCovers.length) {
    source = 'last_year'; todayTotal = lyTotal
    for (const cat of cats) todayPremiums[cat.key] = Object.fromEntries(COVERS.map(c => [c, cats.length === 1 ? net(lyCovers.find(([lc]) => COVER_OF_LAST[lc as LastYearCover] === c)?.[1]) : null]))
  } else if (current) {
    source = 'renewal'; todayTotal = 0
    for (const cat of cats) {
      todayPremiums[cat.key] = Object.fromEntries(COVERS.map(c => [c, todayPicks[cat.key]?.[c] ? prices[cat.key][current][c][todayPicks[cat.key][c]] ?? null : null]))
      todayTotal += Object.values(todayPremiums[cat.key]).reduce<number>((a, b) => a + (b ?? 0), 0)
    }
  }
  const policy: TodayPolicy | null = ly && (ly.documents.length || ly.total != null) ? {
    insurer: ly.insurer, product: ly.product, policyNumber: ly.policyNumber, periodFrom: ly.periodFrom, periodTo: ly.periodTo,
    total: lyTotal, gstRemoved: k !== 1, sumMatches: ly.sumMatches,
    documents: ly.documents.map(d => ({ file: d.file, kind: d.kind, href: documentHref(d.ref) })),
  } : null
  const notes: string[] = ['AIA personal accident is not priced until its rate rule is confirmed.', 'Singlife GP is priced from its rate table; the workbook summary shows none (to confirm with Nathan).']
  const left = input.members.length - cats.reduce((n, c) => n + c.members.length, 0)
  if (left) notes.push(`${left} foreign-worker lives priced on their own cover, not in this comparison.`)
  if (!current) notes.push(input.currentInsurer ? `${input.currentInsurer} is not one of the five products; today's column shows last year's premium only.` : 'No current insurer stated; today is the cover as scheduled, with no renewal price.')
  return {
    quotationId: input.quotationId, effectiveDate: input.effectiveDate, basis: input.basis,
    lives: input.members.length - left, employees: cats.reduce((n, c) => n + c.members.filter(m => m.relationship === 'self').length, 0), leftOut: left,
    categories: cats.map(c => ({ key: c.key, name: c.name, lives: c.members.length, employees: c.members.filter(m => m.relationship === 'self').length })),
    today: { product: current, label: ly?.product ?? ly?.insurer ?? current ?? input.currentInsurer ?? 'Today', picks: todayPicks, lastYearTotal: lyTotal, total: todayTotal, source, premiums: todayPremiums, benefits: todayBenefits, policy },
    products: PRODUCTS, picks, options, prices, benefits, labels, why, notes, workbook: wb.file, rules,
  }
}

// ── Same tier and Lower tier (Jarod's call, 19 Nov 2026: notes 3, 21, 22, 24) ───────────────────
//
// Same tier: the hospital plan with the same ward and beds first; then the same limit amount AND
// the same limit basis (a year or per disability is a hard tier, never a small score). With no
// same plan, the next lower one; never a higher one. Every other cover: the same amount (the same
// co-pay for GP); else the next lower. Lower tier: one plan lower per cover from the Same pick,
// where one exists. Each pick carries its reason, shown in the cell.

export type MatchReason = 'same' | 'no same plan' | 'lower' | 'with hospital' | 'none'
export type TierPick = { plan: string; reason: MatchReason }
/** Today's hospital cover as numbers. `limit` and `basis` null when not on file (a census plan name gives the ward only). */
export type HospTarget = { hospital: 'private' | 'government'; beds: number | null; limit: number | null; basis: 'annual' | 'per_disability' | null; coins: number }
export type CoverTarget = { hosp: HospTarget | null; gmm: number | null; gpCopay: number | null; spLimit: number | null; dental: number | null; pa: number | null }

const FW = /FW|WP\/S Pass|WP\/SP/i
/** Ward order, highest first: private 1-bed 6, 2-bed 5, 4-bed 4; government 1-bed 3, 2-bed 2, 4-bed 1. */
export const wardRank = (f: { hospital: 'private' | 'government'; beds: number | null }) => (f.hospital === 'private' ? 3 : 0) + (f.beds === 1 ? 3 : f.beds === 2 ? 2 : 1)
const lim = (n: number | null) => n ?? -1

type HospOpt = { p: string; f: HospFacts; i: number }
/** Highest first: ward, then limit, then the lower co-insurance, then list order. */
const byHigh = (a: HospOpt, b: HospOpt) => wardRank(b.f) - wardRank(a.f) || lim(b.f.limit) - lim(a.f.limit) || a.f.coins - b.f.coins || a.i - b.i
/** Strictly below `x` in the same ward: a lower limit, or the same limit with more co-insurance. */
const belowInWard = (o: HospFacts, x: { limit: number | null; coins: number }) => x.limit != null && o.limit != null && (o.limit < x.limit || (o.limit === x.limit && o.coins > x.coins))

/** The best plan in the highest ward below `rank`: the same basis and a limit no higher than `limit` first. */
function nextWardDown(opts: HospOpt[], rank: number, basis: HospTarget['basis'], limit: number | null): HospOpt | null {
  const lower = opts.filter(o => wardRank(o.f) < rank)
  if (!lower.length) return null
  const top = Math.max(...lower.map(o => wardRank(o.f)))
  const ward = lower.filter(o => wardRank(o.f) === top)
  const fits = (o: HospOpt) => limit == null || (o.f.limit != null && o.f.limit <= limit)
  const pool = [ward.filter(o => fits(o) && (!basis || o.f.basis === basis)), ward.filter(fits), ward]
  const hit = pool.find(l => l.length)!
  return hit === ward && !ward.some(fits) ? [...ward].sort((a, b) => lim(a.f.limit) - lim(b.f.limit) || a.i - b.i)[0] : [...hit].sort(byHigh)[0]
}

/** The Same tier hospital plan at one product. Pure. */
export function sameHospital(benefitsOf: (cover: string, plan: string) => Record<string, string>, plans: string[], t: HospTarget | null, product?: string | null): TierPick {
  const opts: HospOpt[] = plans.filter(p => !FW.test(p)).map((p, i) => ({ p, f: hospitalFacts(benefitsOf(HOSP, p), product), i }))
  if (!t || !opts.length) return { plan: '', reason: 'none' }
  const rank = wardRank(t)
  const ward = opts.filter(o => wardRank(o.f) === rank)
  const coinsGap = (o: HospOpt) => Math.abs(o.f.coins - t.coins) * 1000 + o.f.coins
  if (t.limit == null) {
    // The ward only is on file: the lowest limit in that ward is the same tier, never a higher one.
    if (ward.length) return { plan: [...ward].sort((a, b) => lim(a.f.limit) - lim(b.f.limit) || coinsGap(a) - coinsGap(b) || a.i - b.i)[0].p, reason: 'same' }
    const down = nextWardDown(opts, rank, t.basis, null)
    return down ? { plan: down.p, reason: 'no same plan' } : { plan: '', reason: 'no same plan' }
  }
  const same = ward.filter(o => o.f.limit === t.limit && (!t.basis || o.f.basis === t.basis))
  if (same.length) return { plan: [...same].sort((a, b) => coinsGap(a) - coinsGap(b) || a.i - b.i)[0].p, reason: 'same' }
  // No same plan: the next lower in the same ward (same basis first), else the next ward down.
  const inWard = ward.filter(o => o.f.limit != null && o.f.limit <= t.limit! && !(o.f.limit === t.limit && o.f.basis === t.basis))
  const sameBasis = inWard.filter(o => !t.basis || o.f.basis === t.basis)
  const pick = [...(sameBasis.length ? sameBasis : inWard)].sort(byHigh)[0] ?? nextWardDown(opts, rank, t.basis, t.limit)
  return { plan: pick?.p ?? '', reason: 'no same plan' }
}

/** One hospital plan lower than `from` at the same product: lower limit in the same ward (basis kept first), else the next ward down. Null when none. Pure. */
export function lowerHospital(benefitsOf: (cover: string, plan: string) => Record<string, string>, plans: string[], from: string, product?: string | null): string | null {
  const opts: HospOpt[] = plans.filter(p => !FW.test(p)).map((p, i) => ({ p, f: hospitalFacts(benefitsOf(HOSP, p), product), i }))
  const me = opts.find(o => o.p === from)
  if (!me) return null
  const ward = opts.filter(o => o.p !== from && wardRank(o.f) === wardRank(me.f) && belowInWard(o.f, me.f))
  const kept = ward.filter(o => o.f.basis === me.f.basis)
  return ([...(kept.length ? kept : ward)].sort(byHigh)[0] ?? nextWardDown(opts, wardRank(me.f), me.f.basis, me.f.limit))?.p ?? null
}

const AMOUNT_KEY: Record<string, string> = { 'Major Medical': 'gmm.annual_limit', 'Outpatient Specialist': 'sp.annual_limit', Dental: 'dental.annual_limit', 'Personal Accident': 'pa.death' }
/** What a plan of a non-hospital cover gives, as one number where more is better (GP: minus the co-pay). Null when it cannot be read. */
export function coverValue(cover: string, plan: string, b: Record<string, string>): number | null {
  if (cover === 'Outpatient GP') {
    const v = b['gp.copay'] ?? ''
    if (/nil|no co-pay/i.test(`${v} ${plan}`) || /^\s*\$?0\b/.test(v)) return 0
    const n = amountOf(v) ?? amountOf(plan.match(/\$\s?\d+/)?.[0] ?? '')
    return n == null ? null : -n
  }
  const n = amountOf(b[AMOUNT_KEY[cover]] ?? '')
  return n == null ? null : n
}

/** The Same tier plan of a non-hospital cover: the same amount, else the next lower; '' when the cover is not held today. Pure. */
export function sameAmount(benefitsOf: (cover: string, plan: string) => Record<string, string>, plans: string[], cover: string, want: number | null): TierPick {
  const usable = plans.filter(p => !FW.test(p))
  if (want == null) return { plan: '', reason: 'none' }
  if (!usable.length) return { plan: '', reason: 'no same plan' }
  const target = cover === 'Outpatient GP' ? -want : want
  const vals = usable.map((p, i) => ({ p, i, v: coverValue(cover, p, benefitsOf(cover, p)) }))
  const same = vals.find(x => x.v != null && x.v === target)
  if (same) return { plan: same.p, reason: 'same' }
  const lower = vals.filter(x => x.v != null && x.v < target).sort((a, b) => b.v! - a.v! || a.i - b.i)[0]
  if (lower) return { plan: lower.p, reason: 'no same plan' }
  // Nothing comparable (a dental "schedule of allowances"): the first plan, flagged.
  const unread = vals.find(x => x.v == null)
  return { plan: unread?.p ?? '', reason: 'no same plan' }
}

/** One plan lower than `from` for a non-hospital cover: the next lower amount (GP: the next higher co-pay). Null when none. Pure. */
export function lowerAmount(benefitsOf: (cover: string, plan: string) => Record<string, string>, plans: string[], cover: string, from: string): string | null {
  const v0 = coverValue(cover, from, benefitsOf(cover, from))
  if (v0 == null) return null
  const vals = plans.filter(p => !FW.test(p) && p !== from).map((p, i) => ({ p, i, v: coverValue(cover, p, benefitsOf(cover, p)) }))
  return vals.filter(x => x.v != null && x.v < v0).sort((a, b) => b.v! - a.v! || a.i - b.i)[0]?.p ?? null
}

/** Same tier at one product for one category, every cover, before plan rules. Pure. */
export function sameTier(benefitsOf: (cover: string, plan: string) => Record<string, string>, options: Record<string, string[]>, t: CoverTarget, product?: string | null): Record<string, TierPick> {
  const want: Record<string, number | null> = { 'Major Medical': t.gmm, 'Outpatient GP': t.gpCopay, 'Outpatient Specialist': t.spLimit, Dental: t.dental, 'Personal Accident': t.pa }
  const out: Record<string, TierPick> = {}
  for (const c of COVERS) out[c] = c === HOSP ? sameHospital(benefitsOf, options[c] ?? [], t.hosp, product) : sameAmount(benefitsOf, options[c] ?? [], c, want[c] ?? null)
  return out
}

/** Lower tier from a Same tier: one plan lower per cover where one exists, else the same plan. Pure. */
export function lowerTierOf(benefitsOf: (cover: string, plan: string) => Record<string, string>, options: Record<string, string[]>, same: Record<string, TierPick>, product?: string | null): Record<string, TierPick> {
  const out: Record<string, TierPick> = {}
  for (const c of COVERS) {
    const s = same[c] ?? { plan: '', reason: 'none' as const }
    if (!s.plan) { out[c] = s; continue }
    const down = c === HOSP ? lowerHospital(benefitsOf, options[c] ?? [], s.plan, product) : lowerAmount(benefitsOf, options[c] ?? [], c, s.plan)
    out[c] = down ? { plan: down, reason: 'lower' } : s
  }
  return out
}

/** A tier's picks with the plan rules applied: a cover the rules set takes the reason "with hospital". Pure. */
export function ruledTier(rules: PlanRule[], product: string, tier: Record<string, TierPick>, options: Record<string, string[]>): Record<string, TierPick> {
  const ruled = applyRules(rules, product, Object.fromEntries(Object.entries(tier).map(([c, t]) => [c, t.plan])), options)
  return Object.fromEntries(Object.entries(tier).map(([c, t]) => {
    const r = rules.find(x => x.product === product && x.cover === c)
    const plan = ruled[c] ?? ''
    if (r && (r.premium === 'included' || plan !== t.plan)) return [c, { plan, reason: plan ? 'with hospital' : 'none' }]
    return [c, { plan, reason: t.reason }]
  })) as Record<string, TierPick>
}
