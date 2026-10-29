/**
 * The plan builder, server side: price a census against a requirement per employee category, live,
 * and save it onto the quotation.
 *
 * Tier A (the five local schemes with approved rate tables) is always priced. Tier B (Cigna Care
 * Connect 1.0, published rates) is priced only when the broker includes it. Tier C has no rate
 * table and is asked by email from the placement line, never here.
 *
 * The arithmetic is computeQuote's, through loadRateTables, so a preview and the saved quotation
 * are the same numbers.
 */
import { computeQuote, memberAge, type Member, type QuoteBasis, type QuoteResult } from '../gb-quote'
import { fetchAllRows } from '../postgrest-all'
import { buildCategoryMap, DEFAULT_REQUIREMENT, engineCategory, insurerKey, TIER_A, type CategoryInput, type GridCell, type InsurerKey, type TableShape } from './ladder'
import { loadRateTables } from './quotation'
import { compareQuotation } from './compare-quotation'
import { underwriting, type UwResult } from './underwriting'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export type BuilderInput = {
  members: Member[]
  categories: CategoryInput[]
  effective_date: string
  basis?: QuoteBasis
  /** Include Tier B (Cigna Care Connect 1.0). */
  tier_b?: boolean
}

export type BuilderTable = TableShape & { insurer: InsurerKey; tier: 'A' | 'B' }

export type BuilderInsurer = {
  rate_table_id: string
  insurer_name: string
  insurer: InsurerKey
  tier: 'A' | 'B'
  net: number
  gst: number
  total: number
  by_product: Record<string, number>
  missing: number
  group_factor: number
  gaps: { member: string; product: string; note: string }[]
  underwriting: UwResult
}

export type BuilderResult = {
  insurers: BuilderInsurer[]
  grids: Record<string, Record<string, GridCell[]>>
  tables: BuilderTable[]
  employees: number
  dependants: number
}

/** Approved rate tables by tier, with each product's plans (the override pickers' options). */
export async function builderTables(tierB: boolean): Promise<BuilderTable[]> {
  const res = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?status=eq.approved&select=id,insurer_name`, { headers: sbH(), cache: 'no-store' })
  if (!res.ok) throw new Error(`Rate tables not read: ${res.status}`)
  const metas = (await res.json() as { id: string; insurer_name: string }[])
    .map(m => ({ ...m, insurer: insurerKey(m.insurer_name) }))
    .filter((m): m is { id: string; insurer_name: string; insurer: InsurerKey } => !!m.insurer && (TIER_A.includes(m.insurer) || (tierB && m.insurer === 'cigna')))
  if (!metas.length) return []
  const ids = metas.map(m => `"${m.id}"`).join(',')
  const plans = await fetchAllRows<{ rate_table_id: string; product_code: string; plan_code: string; sort_order: number | null }>(
    `${SB_URL}/rest/v1/gb_plans?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code,sort_order&order=sort_order.nullslast,plan_code`, sbH())
  return metas.map(m => {
    const by = new Map<string, string[]>()
    for (const p of plans) if (p.rate_table_id === m.id) by.set(p.product_code, [...(by.get(p.product_code) ?? []), p.plan_code])
    return { id: m.id, insurer_name: m.insurer_name, insurer: m.insurer, tier: m.insurer === 'cigna' ? 'B' as const : 'A' as const, products: [...by].map(([code, plans]) => ({ code, plans })) }
  })
}

/** The members as the engine prices them: dependants and foreign workers in their own sub-category. */
export const engineMembers = (members: Member[]): Member[] => members.map(m => ({ ...m, category: engineCategory({ category: m.category, relationship: m.relationship, work_pass: m.work_pass }) }))

export function categoryMapFor(input: BuilderInput, tables: BuilderTable[]) {
  return buildCategoryMap(input.categories, tables, input.members.map(m => ({ category: m.category, relationship: m.relationship, work_pass: m.work_pass })))
}

export async function priceBuilder(input: BuilderInput): Promise<BuilderResult & { result: QuoteResult; categoryMap: ReturnType<typeof categoryMapFor> }> {
  const tables = await builderTables(!!input.tier_b)
  const built = categoryMapFor(input, tables)
  const rateTables = await loadRateTables(tables.map(t => t.id))
  const members = engineMembers(input.members)
  const result = computeQuote(members, rateTables, built.map, built.products, 0.09, input.effective_date, { basis: input.basis ?? 'new_business' })

  const insurers: BuilderInsurer[] = result.per_insurer.map(r => {
    const t = tables.find(x => x.id === r.rate_table_id)!
    const rt = rateTables.find(x => x.rate_table_id === r.rate_table_id)!
    const lines = result.lines.filter(l => l.rate_table_id === r.rate_table_id)
    // The term life and critical illness plans employees hold, for the health-declaration check.
    const plansFor = (re: RegExp) => lines.find(l => re.test(l.product_code) && l.plan_code)?.plan_code ?? null
    const uwMembers = input.members.map(m => ({ name: m.name, relationship: m.relationship, age: memberAge(m, input.effective_date, rt.age_basis) }))
    return {
      rate_table_id: r.rate_table_id, insurer_name: r.insurer_name, insurer: t.insurer, tier: t.tier,
      net: r.subtotal, gst: r.gst, total: r.total, by_product: r.by_product, missing: r.missing, group_factor: r.applied?.group_factor ?? 1,
      gaps: lines.filter(l => l.premium == null).map(l => ({ member: l.member_name, product: l.product_code, note: l.note ?? 'not priced' })),
      underwriting: underwriting(t.insurer, uwMembers, { gtl: plansFor(/term life|\bGTL\b/i), gci: plansFor(/critical|GCI|GACI/i) }),
    }
  })
  const employees = input.members.filter(m => !/spouse|child|dependa/i.test(m.relationship)).length
  return { insurers, grids: built.grids, tables, employees, dependants: input.members.length - employees, result, categoryMap: built }
}

export type SaveInput = BuilderInput & {
  quotation_id: string
  employee_categories?: Record<string, string>
  budget?: number | null
}

/**
 * Prices and writes the result onto an existing quotation: its plans, totals, member lines and the
 * requirement that produced them. The quotation keeps its id, so links to it stay valid.
 */
export async function saveBuilder(input: SaveInput): Promise<BuilderResult> {
  const priced = await priceBuilder(input)
  const { result, categoryMap } = priced
  const census = engineMembers(input.members)
  const patch = {
    effective_date: input.effective_date, basis: input.basis ?? 'new_business',
    product_codes: categoryMap.products, rate_table_ids: priced.tables.map(t => t.id), category_map: categoryMap.map,
    census, results: result.per_insurer, member_count: census.length,
    requirement: { categories: input.categories, employee_categories: input.employee_categories ?? {}, budget: input.budget ?? null, tier_b: !!input.tier_b },
    benefits_analysis: null, updated_at: new Date().toISOString(),
  }
  const res = await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${encodeURIComponent(input.quotation_id)}`, { method: 'PATCH', headers: sbH('return=representation'), body: JSON.stringify(patch) })
  if (!res.ok) throw new Error(`Quotation not saved: ${res.status} ${(await res.text()).slice(0, 200)}`)
  if (!(await res.json() as unknown[]).length) throw new Error('Quotation not found')
  const del = await fetch(`${SB_URL}/rest/v1/gb_quote_lines?quotation_id=eq.${encodeURIComponent(input.quotation_id)}`, { method: 'DELETE', headers: sbH() })
  if (!del.ok) throw new Error(`Old member lines not cleared: ${del.status}`)
  const lines = result.lines.map(l => ({ quotation_id: input.quotation_id, rate_table_id: l.rate_table_id, insurer_name: l.insurer_name, member_index: l.member_index, member_name: l.member_name, relationship: l.relationship, category: l.category, age: l.age, product_code: l.product_code, plan_code: l.plan_code, premium: l.premium, note: l.note }))
  for (let i = 0; i < lines.length; i += 500) {
    const ins = await fetch(`${SB_URL}/rest/v1/gb_quote_lines`, { method: 'POST', headers: sbH(), body: JSON.stringify(lines.slice(i, i + 500)) })
    if (!ins.ok) throw new Error(`Member lines not saved: ${ins.status} ${(await ins.text()).slice(0, 200)}`)
  }
  // The benefit comparison (brochure schedules for the plans now priced) for the quote page and
  // the client report. A failure leaves it empty; the quote page offers to compare again.
  try { await compareQuotation(input.quotation_id) } catch (e) { console.error('[gb/builder] compare failed', e instanceof Error ? e.message : e) }
  const { result: _r, categoryMap: _c, ...out } = priced
  return out
}

/**
 * An employee list arrived for a quotation that was waiting for one (an HR link sent from it):
 * price it on the quotation's saved requirement, or the default, and write it onto the same row.
 */
export async function fillQuotationFromList(quotationId: string, members: Member[]): Promise<BuilderResult | null> {
  if (!members.length) return null
  const res = await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${encodeURIComponent(quotationId)}&select=effective_date,basis,requirement&limit=1`, { headers: sbH(), cache: 'no-store' })
  const q = res.ok ? (await res.json() as { effective_date: string | null; basis: string | null; requirement: { categories?: CategoryInput[]; budget?: number | null; tier_b?: boolean } | null }[])[0] : null
  if (!q) return null
  const categories = q.requirement?.categories?.length ? q.requirement.categories : [{ name: 'All employees', requirement: { ...DEFAULT_REQUIREMENT }, overrides: {} }]
  const names = new Set(categories.map(c => c.name))
  const census = members.map(m => ({ ...m, category: names.has(m.category) ? m.category : categories[0].name }))
  return saveBuilder({
    quotation_id: quotationId, members: census, categories,
    effective_date: q.effective_date ?? new Date().toISOString().slice(0, 10), basis: q.basis === 'renewal' ? 'renewal' : 'new_business',
    tier_b: !!q.requirement?.tier_b, budget: q.requirement?.budget ?? null,
  })
}
