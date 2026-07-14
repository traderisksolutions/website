/**
 * GET /api/group-benefits/quote/available?products=GHS,GOS
 * Approved rate tables (with their plans) for the requested products — powers the insurer
 * selection + category→plan mapping UI. One entry per approved (insurer, product) version.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const products = (new URL(req.url).searchParams.get('products') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const prodFilter = products.length ? `&product_code=in.(${products.map(encodeURIComponent).join(',')})` : ''
    const tRes = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?status=eq.approved${prodFilter}&select=id,insurer_name,product_code,age_basis,plan_year,version&order=insurer_name`, { headers: sbH(), cache: 'no-store' })
    const tables: { id: string; insurer_name: string; product_code: string; age_basis: string; plan_year: number | null; version: number }[] = tRes.ok ? await tRes.json() : []
    if (!tables.length) return NextResponse.json([])

    const ids = tables.map(t => `"${t.id}"`).join(',')
    const pRes = await fetch(`${SB_URL}/rest/v1/gb_plans?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code,plan_name,hospital_type,beds,co_payment&order=plan_code`, { headers: sbH(), cache: 'no-store' })
    const plans: { rate_table_id: string; product_code: string; plan_code: string; plan_name: string | null; hospital_type: string | null; beds: string | null; co_payment: string | null }[] = pRes.ok ? await pRes.json() : []

    const byTable = new Map<string, typeof plans>()
    for (const p of plans) { const a = byTable.get(p.rate_table_id) ?? []; a.push(p); byTable.set(p.rate_table_id, a) }

    return NextResponse.json(tables.map(t => ({
      rate_table_id: t.id, insurer_name: t.insurer_name ?? 'Unknown', product_code: t.product_code,
      age_basis: t.age_basis, plan_year: t.plan_year, version: t.version,
      plans: byTable.get(t.id) ?? [],
    })))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
