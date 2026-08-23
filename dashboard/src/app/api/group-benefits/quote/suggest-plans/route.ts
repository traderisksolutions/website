/**
 * POST /api/group-benefits/quote/suggest-plans
 * Sales Loop v2, Phase 6b. Runs during the New Quote Wizard's "Map plans" step, before a
 * quotation exists — the client already has the selected insurer products/plans loaded (avail),
 * so it sends those directly; this route only needs to fetch the benefit terms (gb_benefits)
 * the client doesn't have, then call gb-plan-match.ts's suggestPlanMatch.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { suggestPlanMatch }          from '@/lib/gb-plan-match'
import type { MatchProduct }         from '@/lib/gb-plan-match'

export const maxDuration = 60

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type EntryPlan = { plan_code: string; plan_name: string | null; hospital_type: string | null; beds: string | null }
type Entry = { rate_table_id: string; insurer_name: string; product_title: string; plans: EntryPlan[] }

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { productTitle, target, entries } = await req.json() as { productTitle?: string; target?: string; entries?: Entry[] }
    if (!productTitle || !target?.trim()) return NextResponse.json({ error: 'productTitle and target required' }, { status: 400 })
    const relevant = (entries ?? []).filter(e => e.product_title === productTitle)
    if (relevant.length === 0) return NextResponse.json({ suggestions: [] })

    const tableIds = Array.from(new Set(relevant.map(e => e.rate_table_id)))
    const ids = tableIds.map(i => `"${i}"`).join(',')
    const benRes = await fetch(
      `${SB_URL}/rest/v1/gb_benefits?rate_table_id=in.(${ids})&select=rate_table_id,plan_code,category,benefit_name,value_text&limit=4000`,
      { headers: sbH(), cache: 'no-store' },
    )
    const bens: { rate_table_id: string; plan_code: string | null; category: string | null; benefit_name: string; value_text: string | null }[] = benRes.ok ? await benRes.json() : []

    const products: MatchProduct[] = relevant.map(e => ({
      rate_table_id: e.rate_table_id, insurer_name: e.insurer_name, product_title: e.product_title,
      plans: e.plans,
      benefits: bens.filter(b => b.rate_table_id === e.rate_table_id)
        .map(b => ({ plan_code: b.plan_code, category: b.category, benefit_name: b.benefit_name, value_text: b.value_text })),
    }))

    const { suggestions, error } = await suggestPlanMatch(productTitle, target, products)
    if (error && suggestions.length === 0) return NextResponse.json({ error }, { status: 502 })
    return NextResponse.json({ suggestions })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
