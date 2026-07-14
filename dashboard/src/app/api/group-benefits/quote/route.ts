/**
 * GET  /api/group-benefits/quote        → list saved quotations
 * POST /api/group-benefits/quote        → compute a census across selected approved tables,
 *                                          save the quotation + flattened lines, return results.
 *   body: { company_name?, effective_date, gst_rate?, products[], rate_table_ids[],
 *           category_map, census[], source? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { computeQuote, type Member, type RateTableInfo, type CategoryMap } from '@/lib/gb-quote'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}
async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const res = await fetch(`${SB_URL}/rest/v1/gb_quotations?select=id,company_name,effective_date,product_codes,member_count,results,source,created_at&order=created_at.desc&limit=100`, { headers: sbH(), cache: 'no-store' })
    return NextResponse.json(res.ok ? await res.json() : [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json() as {
      company_name?: string; effective_date?: string; gst_rate?: number
      products: string[]; rate_table_ids: string[]; category_map: CategoryMap
      census: Member[]; source?: string
    }
    const products = body.products ?? []
    const tableIds = body.rate_table_ids ?? []
    const census   = Array.isArray(body.census) ? body.census : []
    const effDate  = body.effective_date || new Date().toISOString().slice(0, 10)
    const gstRate  = body.gst_rate ?? 0.09
    if (!tableIds.length || !census.length || !products.length) return NextResponse.json({ error: 'Select insurers, products and a census' }, { status: 400 })

    // Load the selected approved tables + their rates.
    const ids = tableIds.map(i => `"${i}"`).join(',')
    const [metaRes, ratesRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=in.(${ids})&select=id,insurer_name,age_basis&limit=100`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/gb_rates?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code,band_label,age_min,age_max,premium,renewal_only&limit=10000`, { headers: sbH(), cache: 'no-store' }),
    ])
    const metas: { id: string; insurer_name: string | null; age_basis: string }[] = metaRes.ok ? await metaRes.json() : []
    const rateRows: (RateTableInfo['rates'][number] & { rate_table_id: string })[] = ratesRes.ok ? await ratesRes.json() : []

    const tables: RateTableInfo[] = metas.map(m => ({
      rate_table_id: m.id,
      insurer_name: m.insurer_name ?? 'Unknown',
      age_basis: m.age_basis === 'last_birthday' ? 'last_birthday' : 'next_birthday',
      rates: rateRows.filter(r => r.rate_table_id === m.id),
    }))

    const result = computeQuote(census, tables, body.category_map ?? {}, products, gstRate, effDate)

    // Save the quotation + flattened lines.
    const qRes = await fetch(`${SB_URL}/rest/v1/gb_quotations`, {
      method: 'POST', headers: sbH('return=representation'),
      body: JSON.stringify({
        company_name: body.company_name ?? null, effective_date: effDate, gst_rate: gstRate,
        product_codes: products, rate_table_ids: tableIds, category_map: body.category_map ?? {},
        census, results: result.per_insurer, member_count: census.length, source: body.source ?? 'csv', created_by: user.id,
      }),
    })
    const quotation = qRes.ok ? (await qRes.json())[0] : null
    if (quotation?.id && result.lines.length) {
      const lines = result.lines.map(l => ({ quotation_id: quotation.id, rate_table_id: l.rate_table_id, insurer_name: l.insurer_name, member_index: l.member_index, member_name: l.member_name, relationship: l.relationship, category: l.category, age: l.age, product_code: l.product_code, plan_code: l.plan_code, premium: l.premium, note: l.note }))
      await fetch(`${SB_URL}/rest/v1/gb_quote_lines`, { method: 'POST', headers: sbH(), body: JSON.stringify(lines) }).catch(() => {})
    }

    void logActivity({ action: 'gb.quote_generated', resource_type: 'gb_quotation', resource_id: quotation?.id, new_value: { company: body.company_name, members: census.length, insurers: tableIds.length } })
    return NextResponse.json({ quotation_id: quotation?.id ?? null, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
