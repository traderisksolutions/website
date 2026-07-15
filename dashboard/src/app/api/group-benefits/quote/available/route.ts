/**
 * GET /api/group-benefits/quote/available
 * Approved pricing available to quote, expanded to one entry per (rate table × product
 * title) — since a brochure holds several products (GHS+EMM, GTL+GACI…). Newest effective
 * date wins per insurer. Each entry carries its plans + which member types it prices.
 */
import { NextResponse }  from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const tRes = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?status=eq.approved&select=id,insurer_id,insurer_name,age_basis,plan_year,effective_date&order=insurer_name`, { headers: sbH(), cache: 'no-store' })
    const tables: { id: string; insurer_id: string | null; insurer_name: string | null; age_basis: string; plan_year: number | null; effective_date: string | null }[] = tRes.ok ? await tRes.json() : []
    if (!tables.length) return NextResponse.json([])

    // Newest effective date wins per insurer (a newer brochure supersedes the old).
    const latest = new Map<string, typeof tables[number]>()
    for (const t of tables) {
      const key = t.insurer_id ?? `name:${t.insurer_name ?? ''}`
      const cur = latest.get(key)
      if (!cur || (t.effective_date ?? '') > (cur.effective_date ?? '')) latest.set(key, t)
    }
    const kept = Array.from(latest.values())
    const ids  = kept.map(t => `"${t.id}"`).join(',')

    const [rRes, pRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/gb_rates?rate_table_id=in.(${ids})&select=rate_table_id,product_code,member_type&limit=50000`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/gb_plans?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code,plan_name,hospital_type,beds,co_payment&order=plan_code`, { headers: sbH(), cache: 'no-store' }),
    ])
    const rateRows: { rate_table_id: string; product_code: string; member_type: string | null }[] = rRes.ok ? await rRes.json() : []
    const plans:    { rate_table_id: string; product_code: string; plan_code: string; plan_name: string | null; hospital_type: string | null; beds: string | null; co_payment: string | null }[] = pRes.ok ? await pRes.json() : []

    const out: unknown[] = []
    for (const t of kept) {
      const titles = Array.from(new Set(rateRows.filter(r => r.rate_table_id === t.id).map(r => r.product_code).filter(Boolean)))
      for (const title of titles) {
        const memberTypes = Array.from(new Set(rateRows.filter(r => r.rate_table_id === t.id && r.product_code === title).map(r => r.member_type).filter(Boolean)))
        const titlePlans  = plans.filter(p => p.rate_table_id === t.id && p.product_code === title)
        out.push({ rate_table_id: t.id, insurer_id: t.insurer_id, insurer_name: t.insurer_name ?? 'Unknown', product_title: title, age_basis: t.age_basis, plan_year: t.plan_year, effective_date: t.effective_date, member_types: memberTypes, plans: titlePlans })
      }
    }
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
