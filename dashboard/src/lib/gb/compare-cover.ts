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
import { amountOf } from './compare-words'
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
  today: { product: Product | null; label: string; picks: Picks; lastYearTotal: number | null }
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

const HOSP = 'Hospital & Surgical'
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
export function hospitalFacts(b: Record<string, string>): HospFacts {
  const type = (b['ghs.hospital_type'] ?? '').toLowerCase()
  const beds = Number((b['ghs.room_board'] ?? '').match(/(\d)\s*-?\s*bed/i)?.[1] ?? NaN)
  const lim = b['ghs.annual_limit'] ?? ''
  const basis = /disab/i.test(b['ghs.limit_basis'] ?? '') || /as charged/i.test(lim) ? 'per_disability' : 'annual'
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

function targetFor(key: string, schedule: Schedule | null): Target {
  const s = schedule, v = key
  const h = s?.GHS[v] ?? (v === ALL ? Object.values(s?.GHS ?? {})[0] : null) ?? null
  const one = <T>(m: Record<string, T | null> | undefined) => m ? (m[v] ?? (Object.keys(m).length === 1 ? Object.values(m)[0] : null)) : null
  return {
    hosp: h ? { hospital: h.hospital, beds: h.beds, limit: h.limit, basis: h.limitKind, coins: h.coins } : null,
    gmm: one(s?.EMM) ?? null, gpCopay: one(s?.GOPC) ?? null, spLimit: one(s?.GOSC) ?? null, dental: one(s?.GD) ?? null,
  }
}

export function buildCompare(input: {
  quotationId: string; wb: Workbook; members: Member[]; schedule: Schedule | null; effectiveDate: string; basis: 'renewal' | 'new_business'
  currentInsurer: string | null; lastYearTotal?: number | null; saved?: Record<string, Picks> | null
}): CompareData {
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
  const picks: CompareData['picks'] = {}, why: CompareData['why'] = {}
  for (const p of PRODUCTS) {
    picks[p] = {}; why[p] = []
    for (const cat of cats) {
      const t = targetFor(cat.key, input.schedule)
      picks[p][cat.key] = {}
      for (const c of COVERS) {
        const m = matchPlan(benefitsOf(p), options[p][c], c, t)
        picks[p][cat.key][c] = m.plan
        if (m.plan || c === HOSP) why[p].push(`${cats.length > 1 ? `${cat.name} · ` : ''}${m.why}`)
      }
    }
    const saved = input.saved?.[p]
    if (saved) for (const k of Object.keys(saved)) if (picks[p][k]) picks[p][k] = { ...picks[p][k], ...saved[k] }
  }
  const todayPicks = current ? JSON.parse(JSON.stringify(picks[current])) as Picks : Object.fromEntries(cats.map(c => [c.key, Object.fromEntries(COVERS.map(x => [x, '']))]))
  const notes: string[] = ['AIA personal accident is not priced until its rate rule is confirmed.', 'Singlife GP is priced from its rate table; the workbook summary shows none (to confirm with Nathan).']
  const left = input.members.length - cats.reduce((n, c) => n + c.members.length, 0)
  if (left) notes.push(`${left} foreign-worker lives priced on their own cover, not in this comparison.`)
  if (!current) notes.push(input.currentInsurer ? `${input.currentInsurer} is not one of the five products; today's column shows last year's premium only.` : 'No current insurer stated; today is the cover as scheduled, with no renewal price.')
  return {
    quotationId: input.quotationId, effectiveDate: input.effectiveDate, basis: input.basis,
    lives: input.members.length - left, employees: employeesInCompany, leftOut: left,
    categories: cats.map(c => ({ key: c.key, name: c.name, lives: c.members.length, employees: c.members.filter(m => m.relationship === 'self').length })),
    today: { product: current, label: current ?? input.currentInsurer ?? 'Today', picks: todayPicks, lastYearTotal: input.lastYearTotal ?? null },
    products: PRODUCTS, picks, options, prices, benefits, labels, why, notes, workbook: wb.file,
  }
}

const PICKS_KEY = (id: string) => `gb_compare:${id}`
/** The broker's choices on the compare page, per product, category and cover. */
export async function loadPicks(id: string): Promise<Record<string, Picks> | null> {
  const { sbTry, enc } = await import('@/lib/crm/db')
  const [r] = await sbTry<{ value: string }[]>(`app_settings?key=eq.${enc(PICKS_KEY(id))}&select=value&limit=1`, [])
  try { return r?.value ? JSON.parse(r.value) as Record<string, Picks> : null } catch { return null }
}
export async function savePicks(id: string, picks: Record<string, Picks>): Promise<void> {
  const { sb } = await import('@/lib/crm/db')
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify([{ key: PICKS_KEY(id), value: JSON.stringify(picks), updated_at: new Date().toISOString() }]) })
}

/** The comparison for a quotation, as the page shows it. Server only. */
export async function loadCompare(id: string): Promise<(CompareData & { company: string | null }) | { error: string; status: number }> {
  const { sbTry, enc } = await import('@/lib/crm/db')
  const { loadWorkbook, importWorkbook } = await import('./workbook')
  const { loadAnalysis } = await import('./analysis')
  const [q] = await sbTry<{ id: string; company_name: string | null; census: Member[] | null; effective_date: string | null; basis: string | null; requirement: { current_schedule?: Schedule; current_insurer?: string | null; last_year?: { total?: number | null } | null } | null }[]>(`gb_quotations?id=eq.${enc(id)}&select=id,company_name,census,effective_date,basis,requirement&limit=1`, [])
  if (!q) return { error: 'Quotation not found', status: 404 }
  if (!q.census?.length) return { error: 'The quotation has no census', status: 422 }
  const wb = await loadWorkbook() ?? await importWorkbook().catch(() => null)
  if (!wb) return { error: 'The house workbook is not loaded. Import it from the Drive folder.', status: 503 }
  const pack = await loadAnalysis(id)
  const data = buildCompare({
    quotationId: id, wb, members: q.census, schedule: q.requirement?.current_schedule ?? pack?.schedule ?? null,
    effectiveDate: (q.effective_date ?? pack?.effectiveDate ?? new Date().toISOString()).slice(0, 10),
    basis: (q.basis ?? pack?.basis) === 'renewal' ? 'renewal' : 'new_business',
    currentInsurer: q.requirement?.current_insurer ?? pack?.currentInsurer ?? null,
    lastYearTotal: q.requirement?.last_year?.total ?? pack?.lastYear?.total ?? null,
    saved: await loadPicks(id),
  })
  return { company: q.company_name, ...data }
}
