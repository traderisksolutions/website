/**
 * Group Benefits canon — the database side.
 *
 * Two jobs, deliberately separate:
 *
 *   syncCanon()  pushes the vocabulary from code into gb_product_canon / gb_benefit_canon. The
 *                code is the source of truth, so this is an upsert, idempotent, and safe to run
 *                after every deploy. It never deletes: a canonical line that is removed from
 *                code but already referenced by extracted rows stays in the table rather than
 *                breaking a foreign key and taking a quote down with it.
 *
 *   mapLabels()  reads every distinct label the insurers printed, resolves each through the
 *                deterministic resolver, and writes the result to gb_label_alias plus the
 *                canon_codes column on the rows themselves. Unresolved labels are reported, not
 *                guessed: an unmapped row is still quotable, it simply cannot be compared until
 *                somebody maps it.
 */
import { PRODUCTS, BENEFITS } from './canon'
import { resolveProduct, resolveBenefit, norm } from './resolve'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function h(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function post(path: string, body: unknown, prefer?: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method: 'POST', headers: h(prefer), body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 300)}`)
  return res
}
async function get<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: h(), cache: 'no-store' })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 300)}`)
  return await res.json() as T[]
}
async function patch(path: string, body: unknown) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method: 'PATCH', headers: h(), body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 300)}`)
}

export async function syncCanon(): Promise<{ products: number; benefits: number }> {
  // Products first — gb_benefit_canon.product_code references them.
  await post('gb_product_canon?on_conflict=code',
    PRODUCTS.map(p => ({ code: p.code, name: p.name, abbrev: p.abbrev, kind: p.kind, sort_order: p.sortOrder, notes: p.notes ?? null })),
    'resolution=merge-duplicates,return=minimal')
  await post('gb_benefit_canon?on_conflict=code',
    BENEFITS.map(b => ({ code: b.code, product_code: b.productCode, name: b.name, compare_as: b.compareAs,
                         unit: b.unit ?? null, headline: !!b.headline, sort_order: b.sortOrder, notes: b.notes ?? null })),
    'resolution=merge-duplicates,return=minimal')
  return { products: PRODUCTS.length, benefits: BENEFITS.length }
}

type RateRow    = { id: string; insurer_name: string; product_code: string }
type PlanRow    = { id: string; product_code: string; rate_table_id: string }
type BenefitRow = { id: string; product_code: string | null; category: string | null; benefit_name: string; rate_table_id: string }
type TableRow   = { id: string; insurer_name: string }

export type MapReport = {
  dryRun: boolean
  products:  { label: string; insurer: string; codes: string[]; variant: Record<string, unknown>; via: string; unclaimed: string; rows: number }[]
  benefits:  { insurer: string; category: string | null; name: string; product: string | null; code: string | null; rows: number }[]
  unmapped:  { kind: 'product' | 'benefit'; insurer: string; label: string; rows: number }[]
  written:   { aliases: number; rateRows: number; planRows: number; benefitRows: number }
}

/**
 * Resolve every label the three insurers printed, and attach the canon to the rows.
 *
 * Defaults to a dry run: it reports what it would write and changes nothing, because the first
 * mapping pass over a live rate table is exactly the moment to read the result before trusting
 * it. Pass apply to commit.
 */
export async function mapLabels(opts?: { apply?: boolean }): Promise<MapReport> {
  const apply = !!opts?.apply
  const [rates, plans, benefits, tables] = await Promise.all([
    get<RateRow>('gb_rates?select=id,insurer_name,product_code&limit=5000'),
    get<PlanRow>('gb_plans?select=id,product_code,rate_table_id&limit=2000'),
    get<BenefitRow>('gb_benefits?select=id,product_code,category,benefit_name,rate_table_id&limit=5000'),
    get<TableRow>('gb_rate_tables?select=id,insurer_name&limit=500'),
  ])
  const insurerOf = new Map(tables.map(t => [t.id, t.insurer_name]))

  // ── Products. One alias per (insurer, label), however many rate rows share it. ──
  const prodGroups = new Map<string, { insurer: string; label: string; ids: string[] }>()
  for (const r of rates) {
    const key = `${r.insurer_name}|${norm(r.product_code)}`
    const g = prodGroups.get(key) ?? { insurer: r.insurer_name, label: r.product_code, ids: [] }
    g.ids.push(r.id); prodGroups.set(key, g)
  }
  // gb_plans and gb_benefits carry their own product labels, which do not always match the
  // rate table's — AIA's plan rows say "GHS" where its rates say "GHS+EMM", so the room tier
  // never joined to a premium. Resolving both through the canon is what closes that.
  const planGroups = new Map<string, { insurer: string; label: string; ids: string[] }>()
  for (const p of plans) {
    const insurer = insurerOf.get(p.rate_table_id) ?? 'unknown'
    const key = `${insurer}|${norm(p.product_code)}`
    const g = planGroups.get(key) ?? { insurer, label: p.product_code, ids: [] }
    g.ids.push(p.id); planGroups.set(key, g)
  }

  const report: MapReport = { dryRun: !apply, products: [], benefits: [], unmapped: [],
                              written: { aliases: 0, rateRows: 0, planRows: 0, benefitRows: 0 } }
  const aliasRows: Record<string, unknown>[] = []
  const codesFor = new Map<string, string[]>()   // `${insurer}|${norm(label)}` -> codes

  for (const [key, g] of Array.from(prodGroups.entries()).concat(Array.from(planGroups.entries()))) {
    if (codesFor.has(key)) continue              // the same label in both tables resolves once
    const m = resolveProduct(g.label)
    codesFor.set(key, m.codes)
    if (!m.codes.length) {
      report.unmapped.push({ kind: 'product', insurer: g.insurer, label: g.label, rows: g.ids.length })
      continue
    }
    report.products.push({ label: g.label, insurer: g.insurer, codes: m.codes, variant: m.variant as Record<string, unknown>,
                           via: m.via, unclaimed: m.unclaimed, rows: g.ids.length })
    aliasRows.push({ kind: 'product', insurer_name: g.insurer, raw_norm: norm(g.label), raw_label: g.label,
                     canon_codes: m.codes, variant: m.variant, source: 'rule',
                     confidence: m.via === 'rule' ? 1 : 0.7 })
  }

  // ── Benefits. Narrowed by the product the row sits under, so "annual limit" lands on the
  //    right canonical line instead of whichever pattern fires first. ──
  const benGroups = new Map<string, { insurer: string; category: string | null; name: string; product: string | null; ids: string[] }>()
  for (const b of benefits) {
    const insurer = insurerOf.get(b.rate_table_id) ?? 'unknown'
    const key = `${insurer}|${norm(b.product_code)}|${norm(b.category)}|${norm(b.benefit_name)}`
    const g = benGroups.get(key) ?? { insurer, category: b.category, name: b.benefit_name, product: b.product_code, ids: [] }
    g.ids.push(b.id); benGroups.set(key, g)
  }

  const benefitWrites: { ids: string[]; code: string; productCodes: string[] }[] = []
  for (const g of Array.from(benGroups.values())) {
    // The scope is the product the ROW is filed under, widened by any product its own category
    // or name happens to state. AIA files "EMM Coverage / Extended Major Medical" under
    // product_code "GHS", so scoping by the filed product alone put the EMM line out of reach
    // of its own row. The widening is narrow: a bare category like "Hospital" or "Other"
    // matches no product pattern and adds nothing.
    const filed = codesFor.get(`${g.insurer}|${norm(g.product)}`) ?? resolveProduct(g.product ?? '').codes
    const productCodes = Array.from(new Set([
      ...filed,
      ...resolveProduct(g.category ?? '').codes,
      ...resolveProduct(g.name).codes,
    ]))
    const m = resolveBenefit(g.category, g.name, productCodes)
    if (!m.code) {
      report.unmapped.push({ kind: 'benefit', insurer: g.insurer, label: `${g.category ?? '—'} / ${g.name}`, rows: g.ids.length })
      continue
    }
    report.benefits.push({ insurer: g.insurer, category: g.category, name: g.name, product: g.product, code: m.code, rows: g.ids.length })
    benefitWrites.push({ ids: g.ids, code: m.code, productCodes })
    aliasRows.push({ kind: 'benefit', insurer_name: g.insurer, raw_norm: norm(`${g.name} ${g.category ?? ''}`),
                     raw_label: `${g.category ?? ''} / ${g.name}`.trim(), canon_codes: [m.code],
                     variant: {}, source: 'rule', confidence: 1 })
  }

  if (!apply) return report

  if (aliasRows.length) {
    await post('gb_label_alias?on_conflict=kind,insurer_name,raw_norm', aliasRows,
               'resolution=merge-duplicates,return=minimal')
    report.written.aliases = aliasRows.length
  }
  // Rows are updated label by label rather than id by id: one PATCH per distinct label is a
  // few dozen calls, one per row would be several thousand.
  for (const [key, g] of Array.from(prodGroups.entries())) {
    const codes = codesFor.get(key); if (!codes?.length) continue
    await patch(`gb_rates?id=in.(${g.ids.join(',')})`, { canon_codes: codes })
    report.written.rateRows += g.ids.length
  }
  for (const [key, g] of Array.from(planGroups.entries())) {
    const codes = codesFor.get(key); if (!codes?.length) continue
    await patch(`gb_plans?id=in.(${g.ids.join(',')})`, { canon_codes: codes })
    report.written.planRows += g.ids.length
  }
  for (const w of benefitWrites) {
    await patch(`gb_benefits?id=in.(${w.ids.join(',')})`, { canon_benefit: w.code, canon_codes: w.productCodes })
    report.written.benefitRows += w.ids.length
  }
  return report
}
