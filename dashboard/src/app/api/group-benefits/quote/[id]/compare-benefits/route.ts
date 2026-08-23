/**
 * POST /api/group-benefits/quote/[id]/compare-benefits
 * Opus compares the coverage of the plans actually quoted (their benefit schedules across
 * insurers), weighs price vs coverage, and writes a comparison narrative (Sales Loop v2, Phase
 * 6a — see gb-recommend.ts, ported from Pricing Matrix's pm-recommend.ts: one continuous
 * narrative weighted by client priorities, not a rigid single-winner + pros/cons split). Stored
 * on the quotation for history.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { recommend }                 from '@/lib/gb-recommend'
import type { QuotedPlan }           from '@/lib/gb-recommend'

export const maxDuration = 120

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type CategoryMap = Record<string, Record<string, Record<string, string>>>

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

    const { priorities } = await req.json().catch(() => ({})) as { priorities?: string }

    // Load the quotation.
    const qRes = await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}&select=company_name,rate_table_ids,category_map,results&limit=1`, { headers: sbH(), cache: 'no-store' })
    const q = qRes.ok ? (await qRes.json())[0] : null
    if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

    const tableIds: string[] = q.rate_table_ids ?? []
    const catMap: CategoryMap = q.category_map ?? {}
    const totals: { insurer_name: string; total: number }[] = q.results ?? []
    if (!tableIds.length) return NextResponse.json({ error: 'Nothing to compare' }, { status: 400 })

    // Plans actually used per table (distinct plan codes referenced in the category map).
    const usedByTable: Record<string, Set<string>> = {}
    for (const [tid, prods] of Object.entries(catMap)) {
      const set = usedByTable[tid] ?? new Set<string>()
      for (const cats of Object.values(prods)) for (const plan of Object.values(cats)) if (plan) set.add(plan)
      usedByTable[tid] = set
    }

    const ids = tableIds.map(i => `"${i}"`).join(',')
    const [metaRes, plansRes, benRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=in.(${ids})&select=id,insurer_name,product_code&limit=100`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/gb_plans?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code,plan_name,hospital_type,beds,co_payment&limit=2000`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/gb_benefits?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code,category,benefit_name,value_text&limit=8000`, { headers: sbH(), cache: 'no-store' }),
    ])
    const metas: { id: string; insurer_name: string; product_code: string }[] = metaRes.ok ? await metaRes.json() : []
    const plans: { rate_table_id: string; product_code: string; plan_code: string; hospital_type: string | null; beds: string | null; co_payment: string | null }[] = plansRes.ok ? await plansRes.json() : []
    const bens:  { rate_table_id: string; product_code: string; plan_code: string | null; category: string | null; benefit_name: string; value_text: string | null }[] = benRes.ok ? await benRes.json() : []

    // Build the quoted plans as structured data (gb-recommend.ts owns turning this into a
    // model-friendly summary + prompt, mirroring pm-recommend.ts's summarise()+SYSTEM split).
    const totalFor = (name: string) => totals.find(t => t.insurer_name === name)?.total
    const quotedPlans: QuotedPlan[] = []
    for (const m of metas) {
      const used = usedByTable[m.id]
      const insurerTotal = totalFor(m.insurer_name) ?? null
      const planLines = plans.filter(p => p.rate_table_id === m.id && (!used || used.has(p.plan_code)))
      for (const pl of planLines) {
        const benefits = bens
          .filter(b => b.rate_table_id === m.id && (b.plan_code === pl.plan_code || b.plan_code == null))
          .slice(0, 60)
          .map(b => ({ category: b.category, name: b.benefit_name, value: b.value_text }))
        quotedPlans.push({
          insurer_name: m.insurer_name, product_code: m.product_code, plan_code: pl.plan_code,
          annual_total: insurerTotal,
          room_tier: { beds: pl.beds, hospital_type: pl.hospital_type, co_payment: pl.co_payment },
          benefits,
        })
      }
    }
    if (quotedPlans.length === 0) return NextResponse.json({ error: 'No benefit data on the quoted plans — approve rate tables with benefit schedules first.' }, { status: 400 })

    const { recommendation, error } = await recommend(quotedPlans, q.company_name ?? null, priorities)
    if (!recommendation) return NextResponse.json({ error: error ?? 'Could not compute a recommendation' }, { status: 502 })

    await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ benefits_analysis: recommendation, priorities: priorities ?? null }) }).catch(() => {})
    void logActivity({ action: 'gb.benefits_compared', resource_type: 'gb_quotation', resource_id: id })
    return NextResponse.json({ recommendation })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
