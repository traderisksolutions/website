/**
 * POST /api/group-benefits/quote/[id]/compare-benefits
 * Opus compares the coverage of the plans actually quoted (their benefit schedules across
 * insurers), weighs price vs coverage, and writes an aligned comparison + pros/cons +
 * recommendation. Stored on the quotation for history.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { logAnthropicUsage }         from '@/lib/gemini-usage'

export const maxDuration = 120

const SB_URL        = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type CategoryMap = Record<string, Record<string, Record<string, string>>>

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

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

    // Build a compact corpus of the quoted plans + their benefits, grouped by insurer.
    const totalFor = (name: string) => totals.find(t => t.insurer_name === name)?.total
    const sections: string[] = []
    for (const m of metas) {
      const used = usedByTable[m.id]
      const insurerTotal = totalFor(m.insurer_name)
      const planLines = plans.filter(p => p.rate_table_id === m.id && (!used || used.has(p.plan_code)))
      for (const pl of planLines) {
        const lines = bens
          .filter(b => b.rate_table_id === m.id && (b.plan_code === pl.plan_code || b.plan_code == null))
          .slice(0, 60)
          .map(b => `    - ${b.category ? `[${b.category}] ` : ''}${b.benefit_name}: ${b.value_text ?? ''}`)
        sections.push(`INSURER: ${m.insurer_name} — ${m.product_code} plan ${pl.plan_code}${insurerTotal != null ? ` (annual total incl GST ~$${insurerTotal})` : ''}\n  Room/tier: beds ${pl.beds ?? '?'}, hospital ${pl.hospital_type ?? '?'}, co-pay ${pl.co_payment ?? '?'}\n  Benefits:\n${lines.join('\n')}`)
      }
    }
    if (sections.length === 0) return NextResponse.json({ error: 'No benefit data on the quoted plans — approve rate tables with benefit schedules first.' }, { status: 400 })

    const prompt = `You are a Singapore insurance broker preparing a group-benefits recommendation for ${q.company_name || 'a client'}. Compare the QUOTED plans below across insurers. Align comparable benefits (room & board, ICU, surgical, outpatient, sub-limits, co-payment, exclusions), call out the meaningful differences, and weigh coverage against the annual premium shown.

Return ONLY JSON:
{
  "comparison": [ { "benefit": string, "by_insurer": { "<insurer name>": string } } ],   // key benefits side by side, most decision-relevant first
  "insurers": [ { "insurer": string, "pros": string[], "cons": string[] } ],
  "recommendation": string   // which insurer/plan you'd recommend and why (value for money), 2-4 sentences
}

QUOTED PLANS:
${sections.join('\n\n')}`

    const aRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 8000, thinking: { type: 'adaptive' }, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!aRes.ok) return NextResponse.json({ error: `Opus ${aRes.status}: ${(await aRes.text()).slice(0, 300)}` }, { status: 502 })
    const aj = await aRes.json()
    const text = (aj.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('')
    void logAnthropicUsage('rfq_recommend', aj.usage, null)

    let analysis: unknown = null
    try { const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim(); analysis = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) } catch { /* leave null */ }
    if (!analysis) return NextResponse.json({ error: 'Could not parse the recommendation' }, { status: 502 })

    await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ benefits_analysis: analysis }) }).catch(() => {})
    void logActivity({ action: 'gb.benefits_compared', resource_type: 'gb_quotation', resource_id: id })
    return NextResponse.json({ analysis })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
