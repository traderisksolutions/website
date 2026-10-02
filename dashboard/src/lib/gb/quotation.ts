/**
 * Price a census across rate tables and save it as a quotation.
 *
 * One function for both callers: the New quote wizard (POST /api/group-benefits/quote) and the
 * group benefits agent, which opens a draft quotation straight from an inbound request
 * (src/lib/gb/intake.ts). Same arithmetic either way, so an agent's draft and a broker's quote
 * for the same census and plans are the same numbers.
 */
import { fetchAllRows } from '../postgrest-all'
import { computeQuote, type Member, type RateTableInfo, type CategoryMap, type QuoteBasis } from '../gb-quote'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export type QuotationInput = {
  company_name?: string | null; effective_date?: string | null; gst_rate?: number
  products: string[]; rate_table_ids: string[]; category_map: CategoryMap
  census: Member[]; source?: string; basis?: QuoteBasis
  /** Free text kept with the quotation. The agent records where a draft came from here. */
  notes?: string | null
}

export async function createQuotation(input: QuotationInput, createdBy: string | null) {
  const products = input.products ?? []
  const tableIds = input.rate_table_ids ?? []
  const census   = Array.isArray(input.census) ? input.census : []
  const effDate  = input.effective_date || new Date().toISOString().slice(0, 10)
  const gstRate  = input.gst_rate ?? 0.09
  const basis: QuoteBasis = input.basis === 'renewal' ? 'renewal' : 'new_business'
  if (!tableIds.length || !census.length || !products.length) throw new QuotationInputError('Select insurers, products and a census')

  // Load the selected approved tables + their rates + any approved calculator rules
  // (mechanical AppliedRules) + any approved richer computation rules (Phase 6d, optional).
  const ids = tableIds.map(i => `"${i}"`).join(',')
  const [metaRes, rateRows, richRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=in.(${ids})&select=id,insurer_id,insurer_name,age_basis,rules,rules_status&limit=100`, { headers: sbH(), cache: 'no-store' }),
    fetchAllRows<RateTableInfo['rates'][number] & { rate_table_id: string }>(`${SB_URL}/rest/v1/gb_rates?rate_table_id=in.(${ids})&select=rate_table_id,product_code,member_type,plan_code,band_label,age_min,age_max,premium,renewal_only`, sbH()),
    fetch(`${SB_URL}/rest/v1/gb_computation_rules?rate_table_id=in.(${ids})&status=eq.approved&select=rate_table_id,rules`, { headers: sbH(), cache: 'no-store' }),
  ])
  const metas: { id: string; insurer_id: string | null; insurer_name: string | null; age_basis: string; rules: Record<string, unknown> | null; rules_status: string | null }[] = metaRes.ok ? await metaRes.json() : []
  const richByTable = new Map<string, RateTableInfo['richRules']>(
    (richRes.ok ? await richRes.json() : []).map((r: { rate_table_id: string; rules: RateTableInfo['richRules'] }) => [r.rate_table_id, r.rules]),
  )

  // Approved calculator rules override the table's age basis and drive GST/discount/gating.
  const ruleBasis = (r: Record<string, unknown> | null): 'next_birthday' | 'last_birthday' | null =>
    r?.age_basis === 'next birthday' ? 'next_birthday' : r?.age_basis === 'last birthday' ? 'last_birthday' : null
  const tables: RateTableInfo[] = metas.map(m => {
    const approved = m.rules_status === 'approved' && m.rules ? (m.rules as RateTableInfo['rules']) : null
    return {
      rate_table_id: m.id,
      insurer_id: m.insurer_id ?? null,
      insurer_name: m.insurer_name ?? 'Unknown',
      age_basis: ruleBasis(m.rules) && m.rules_status === 'approved' ? ruleBasis(m.rules)! : (m.age_basis === 'last_birthday' ? 'last_birthday' : 'next_birthday'),
      rates: rateRows.filter(r => r.rate_table_id === m.id),
      rules: approved,
      richRules: richByTable.get(m.id) ?? null,
    }
  })

  const result = computeQuote(census, tables, input.category_map ?? {}, products, gstRate, effDate, { basis })

  // Save the quotation + flattened lines.
  const qRes = await fetch(`${SB_URL}/rest/v1/gb_quotations`, {
    method: 'POST', headers: sbH('return=representation'),
    body: JSON.stringify({
      company_name: input.company_name ?? null, effective_date: effDate, gst_rate: gstRate, basis,
      product_codes: products, rate_table_ids: tableIds, category_map: input.category_map ?? {},
      census, results: result.per_insurer, member_count: census.length, source: input.source ?? 'csv', created_by: createdBy,
      notes: input.notes ?? null,
    }),
  })
  if (!qRes.ok) throw new Error(`Quotation not saved: ${qRes.status} ${(await qRes.text()).slice(0, 200)}`)
  const quotation = (await qRes.json())[0] as { id: string } | undefined
  if (quotation?.id && result.lines.length) {
    const lines = result.lines.map(l => ({ quotation_id: quotation.id, rate_table_id: l.rate_table_id, insurer_name: l.insurer_name, member_index: l.member_index, member_name: l.member_name, relationship: l.relationship, category: l.category, age: l.age, product_code: l.product_code, plan_code: l.plan_code, premium: l.premium, note: l.note }))
    // In chunks, and checked: a failed insert used to be swallowed, leaving a quotation whose
    // per-member breakdown and export were silently empty.
    for (let i = 0; i < lines.length; i += 500) {
      const ins = await fetch(`${SB_URL}/rest/v1/gb_quote_lines`, { method: 'POST', headers: sbH(), body: JSON.stringify(lines.slice(i, i + 500)) })
      if (!ins.ok) throw new Error(`Quote ${quotation.id} saved but member lines failed: ${ins.status} ${(await ins.text()).slice(0, 200)}`)
    }
  }

  return { quotationId: (quotation?.id ?? null) as string | null, result }
}

export class QuotationInputError extends Error {}
