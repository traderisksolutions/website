/**
 * One engine for a first price: a census and the covers asked for, in; a saved, compared draft
 * quotation, out. Both ways in use it — a broker uploading a CSV (/api/group-benefits/quick-quote)
 * and the group benefits agent reading an email (intake.ts) — so the same census and the same
 * requirements give the same numbers whichever way they arrived.
 *
 * No model is called here. Plans are chosen by rule (plan-rules.ts), premiums by the quote
 * engine, the comparison by compare-quotation.ts.
 */
import { fetchAllRows } from '../postgrest-all'
import { normInsurer } from '../insurers'
import { PRODUCT_BY_CODE } from './canon'
import { resolveProduct } from './resolve'
import { createQuotation } from './quotation'
import { compareQuotation } from './compare-quotation'
import { DEFAULT_SETTINGS } from './score'
import {
  matchPlan, describeSpec, withDefaults, parseWard, parseHospital, parseSum, parseCoPay, isHospitalCover, isSumCover,
  type CoverSpec, type OfferedPlan,
} from './plan-rules'
import type { Member, QuoteResult } from '../gb-quote'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type Table = { id: string; insurer_id: string | null; insurer_name: string | null; effective_date: string | null }
type RateRow = { rate_table_id: string; product_code: string; plan_code: string; premium: number | null }
type PlanRow = { rate_table_id: string; product_code: string; plan_code: string; plan_name: string | null
                 hospital_type: string | null; beds: string | null; co_payment: string | null; canon_codes: string[] | null }
type BenRow = { rate_table_id: string; plan_code: string | null; canon_benefit: string | null; value_text: string | null; value_numeric: number | null }

/**
 * The label an insurer prices a canonical cover under, given everything asked for and what is
 * already priced on that table. Never a label overlapping a cover already priced (AIA's "GP"
 * beside its "GP + SP" bundle would charge GP twice). Then: most of the request covered, least
 * not asked for, narrowest.
 */
export function titleFor(code: string, titles: string[], requested: string[] = [code], covered: Set<string> = new Set()): string | null {
  const want = new Set(requested)
  const cands = titles
    .map(t => ({ t, codes: resolveProduct(t).codes }))
    .filter(x => x.codes.includes(code) && !x.codes.some(c => covered.has(c)))
    .map(x => ({ ...x, asked: x.codes.filter(c => want.has(c)).length, extra: x.codes.filter(c => !want.has(c)).length }))
  cands.sort((a, b) => b.asked - a.asked || a.extra - b.extra || a.codes.length - b.codes.length || a.t.localeCompare(b.t))
  return cands[0]?.t ?? null
}

/** Census categories that are foreign workers — the people GHS-FW is for. */
export const isForeignWorkerCategory = (c: string) => /work\s*permit|\bwp\b|s[\s-]*pass|foreign|\bfw\b|migrant/i.test(c)

const SUM_LINE: Record<string, string> = { GTL: 'GTL_SUM_ASSURED', GCI: 'GCI_SUM_ASSURED', GPA: 'GPA_AD', GADD: 'GADD_AD' }

/** Every tier an insurer prices under one label, with the facts a rule can match on. Facts are
 *  read from the plan row first, then the plan code, then the benefit schedule. */
export function offeredPlans(code: string, title: string, rates: RateRow[], plans: PlanRow[], bens: BenRow[]): OfferedPlan[] {
  const codes = Array.from(new Set(rates.map(r => r.plan_code)))
  return codes.map(pc => {
    const row = plans.find(p => p.plan_code === pc && (p.product_code === title || (p.canon_codes ?? []).includes(code))) ?? null
    const base = pc.split(' · ')[0].toLowerCase()
    const ben = (canon: string) => bens.find(b => b.canon_benefit === canon && (b.plan_code ?? '').toLowerCase() === pc.toLowerCase())
      ?? bens.find(b => b.canon_benefit === canon && (b.plan_code ?? '').toLowerCase() === base)
    const name = `${pc} ${row?.plan_name ?? ''}`
    const prem = rates.filter(r => r.plan_code === pc && r.premium != null).map(r => r.premium as number)
    const sumBen = SUM_LINE[code] ? ben(SUM_LINE[code]) : undefined
    return {
      plan_code: pc,
      label: pc,
      hospital: isHospitalCover(code)
        ? parseHospital(row?.hospital_type) ?? parseHospital(name) ?? parseHospital(ben('GHS_HOSPITAL_TYPE')?.value_text) ?? parseHospital(ben('GHS_ROOM_BOARD')?.value_text)
        : null,
      ward: isHospitalCover(code)
        ? parseWard(row?.beds) ?? parseWard(name) ?? parseWard(ben('GHS_ROOM_BOARD')?.value_text)
        : null,
      coPay: parseCoPay(row?.co_payment) ?? parseCoPay(name) ?? parseCoPay(title) ?? parseCoPay(ben(`${code === 'GHS_FW' ? 'GHSFW' : code}_CO_PAYMENT`)?.value_text),
      // The printed amount before the stored number: AIA's GTL Plan 6 reads "500,000" but was
      // stored as 50,000.
      sumAssured: isSumCover(code) ? parseSum(name) ?? parseSum(sumBen?.value_text) ?? sumBen?.value_numeric ?? null : null,
      avgRate: prem.length ? prem.reduce((a, b) => a + b, 0) / prem.length : null,
    }
  })
}

/** Approved tables, newest per insurer — the same choice the quote wizard offers. */
async function currentTables(): Promise<Table[]> {
  const res = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?status=eq.approved&select=id,insurer_id,insurer_name,effective_date`, { headers: sbH(), cache: 'no-store' })
  if (!res.ok) throw new Error(`rate tables: ${res.status}`)
  const all = await res.json() as Table[]
  const latest = new Map<string, Table>()
  for (const t of all) {
    const k = t.insurer_id ?? `name:${t.insurer_name ?? ''}`
    const cur = latest.get(k)
    if (!cur || (t.effective_date ?? '') > (cur.effective_date ?? '')) latest.set(k, t)
  }
  return Array.from(latest.values())
}

const sameInsurer = (a: string | null | undefined, b: string | null | undefined) => {
  const x = normInsurer(a), y = normInsurer(b)
  return !!x && !!y && (x.startsWith(y) || y.startsWith(x))
}
const samePlan = (a: string, b: string) => {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  return n(a) === n(b) || n(a).split(' · ')[0] === n(b) || n(a).startsWith(`${n(b)} `)
}

export type DraftInput = {
  census: Member[]
  covers: CoverSpec[]
  companyName: string
  effectiveDate: string
  basis: 'new_business' | 'renewal'
  source: string
  /** Lines written at the top of the quotation's notes, before the plan choices. */
  notesHead?: string[]
  createdBy: string | null
}

export type DraftResult = {
  quotationId: string
  result: QuoteResult
  /** Insurer results that priced every cover asked for, fully. */
  complete: QuoteResult['per_insurer']
  partial: number
  /** Covers that could be priced for someone in this census. */
  wanted: string[]
  notes: string[]
}

export class DraftError extends Error {}

export async function draftQuotation(input: DraftInput): Promise<DraftResult> {
  const { census } = input
  if (!census.length) throw new DraftError('The census is empty')
  const covers = input.covers.filter(c => PRODUCT_BY_CODE[c.code])
  if (!covers.length) throw new DraftError('Choose at least one cover')

  const tables = await currentTables()
  if (!tables.length) throw new DraftError('No approved rate tables')
  const ids = tables.map(t => `"${t.id}"`).join(',')
  const [rates, plans, bens] = await Promise.all([
    fetchAllRows<RateRow>(`${SB_URL}/rest/v1/gb_rates?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code,premium`, sbH()),
    fetchAllRows<PlanRow>(`${SB_URL}/rest/v1/gb_plans?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code,plan_name,hospital_type,beds,co_payment,canon_codes`, sbH()),
    fetchAllRows<BenRow>(`${SB_URL}/rest/v1/gb_benefits?rate_table_id=in.(${ids})&canon_benefit=not.is.null&select=rate_table_id,plan_code,canon_benefit,value_text,value_numeric`, sbH()),
  ])

  const categories = Array.from(new Set(census.map(m => m.category)))
  // Foreign-worker medical replaces GHS for work-permit and S Pass holders. Without a category
  // marking them, it is not priced rather than charged to everyone.
  const fwCats = categories.filter(isForeignWorkerCategory)
  const askedFw = covers.some(c => c.code === 'GHS_FW')
  const categoriesFor = (code: string): string[] =>
    !askedFw ? categories
      : code === 'GHS_FW' ? fwCats
      : code === 'GHS' || code === 'EMM' ? categories.filter(c => !fwCats.includes(c))
      : categories

  const requested = covers.map(c => c.code)
  const categoryMap: Record<string, Record<string, Record<string, string>>> = {}
  const coveredOn = (tid: string) => new Set(Object.keys(categoryMap[tid] ?? {}).flatMap(t => resolveProduct(t).codes))
  const titlesUsed = new Set<string>()
  const notes: string[] = []

  for (const cover of covers) {
    const cats = categoriesFor(cover.code)
    if (!cats.length) {
      notes.push(cover.code === 'GHS_FW'
        ? 'GHS-FW not priced: no work-permit or S Pass category in the census.'
        : `${cover.code} not priced: every category is on foreign-worker cover.`)
      continue
    }
    // Per table: the label, and the tiers it prices.
    const offers = tables.map(t => {
      if (coveredOn(t.id).has(cover.code)) return null           // inside a bundle already chosen
      const tRates = rates.filter(r => r.rate_table_id === t.id)
      const title = titleFor(cover.code, Array.from(new Set(tRates.map(r => r.product_code))), requested, coveredOn(t.id))
      if (!title) return null
      const offered = offeredPlans(cover.code, title, tRates.filter(r => r.product_code === title),
        plans.filter(p => p.rate_table_id === t.id), bens.filter(b => b.rate_table_id === t.id))
      return { t, title, offered }
    }).filter((x): x is NonNullable<typeof x> => !!x)

    // "Same as the client's AIA Plan 1": that tier at AIA, and at every other insurer the tier
    // with the same facts.
    let spec: CoverSpec = cover
    let pinned: { tableId: string; plan: string } | null = null
    if (cover.sameAs) {
      const at = offers.find(o => sameInsurer(o.t.insurer_name, cover.sameAs!.insurer))
      const plan = at?.offered.find(p => samePlan(p.plan_code, cover.sameAs!.plan))
      if (at && plan) {
        pinned = { tableId: at.t.id, plan: plan.plan_code }
        spec = { code: cover.code, hospital: plan.hospital, ward: plan.ward, coPay: plan.coPay, sumAssured: plan.sumAssured, note: cover.note }
      } else {
        // The client's own plan code ("A01") is often the insurer's internal one, not the
        // brochure's ("PLAN 1"). Price the default and say which code was not found.
        spec = { code: cover.code, note: `${cover.note ?? ''}${cover.note ? '; ' : ''}${cover.sameAs.insurer} ${cover.sameAs.plan} not in the rate tables` }
      }
    }

    const picks: string[] = []
    for (const o of offers) {
      const choice = pinned && pinned.tableId === o.t.id
        ? { plan_code: pinned.plan, exact: true, why: 'current plan' }
        : matchPlan(spec, o.offered)
      if (!choice) continue
      titlesUsed.add(o.title)
      categoryMap[o.t.id] ??= {}
      categoryMap[o.t.id][o.title] = Object.fromEntries(cats.map(c => [c, choice.plan_code]))
      picks.push(`${o.t.insurer_name} ${choice.plan_code}${choice.exact ? '' : ` (${choice.why})`}`)
    }
    const stated = pinned ? true : !!(spec.hospital || spec.ward || spec.sumAssured || spec.tier || spec.coPay != null)
    const shown = pinned ? `${describeSpec(cover)} (${describeSpec(withDefaults(spec))})` : describeSpec(withDefaults(spec))
    notes.push(`${cover.code}, ${shown}${stated ? '' : ' (default; not stated)'}` +
      `${spec.note ? `. Asked: "${spec.note}"` : ''}: ${picks.length ? picks.join('; ') : 'no insurer prices it'}.`)
  }

  const tableIds = Object.keys(categoryMap)
  if (!tableIds.length) throw new DraftError(`No insurer prices the covers asked for. ${notes.join(' ')}`)

  const { quotationId, result } = await createQuotation({
    company_name: input.companyName, effective_date: input.effectiveDate, basis: input.basis,
    products: Array.from(titlesUsed), rate_table_ids: tableIds, category_map: categoryMap,
    census, source: input.source, notes: [...(input.notesHead ?? []), ...notes].join('\n'),
  }, input.createdBy)
  if (!quotationId) throw new Error('Draft quotation not saved')

  // A premium for fewer covers is not comparable with one for all of them: only insurers that
  // priced every cover that could be priced count as complete, and the value score opens
  // filtered to those covers.
  const wanted = covers.map(c => c.code).filter(c => categoriesFor(c).length > 0)
  await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${quotationId}`, {
    method: 'PATCH', headers: sbH(),
    body: JSON.stringify({ priorities: JSON.stringify({ score: { ...DEFAULT_SETTINGS, filters: { ...DEFAULT_SETTINGS.filters, requiredProducts: wanted } } }) }),
  }).catch(() => {})
  // A failed comparison leaves a priced draft with a Compare button; not worth failing it for.
  await compareQuotation(quotationId).catch(e => console.error('[gb-draft] compare failed:', e))

  const complete = result.per_insurer.filter(r => r.total > 0 && !r.missing && wanted.every(c => coveredOn(r.rate_table_id).has(c)))
  return { quotationId, result, complete, partial: result.per_insurer.length - complete.length, wanted, notes }
}
