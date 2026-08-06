/**
 * POST /api/pricing-matrix/quote/match   { calculator_ids, targets }
 * Suggests a plan tier per (calculator, coverage code) matching the broker's stated target
 * requirement for that coverage. Ephemeral — only pre-fills the quote wizard's selection state;
 * nothing is persisted here (the quote itself persists the final, possibly hand-edited selection).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { suggestPlanMatch }          from '@/lib/pm-plan-match'
import type { MatchInsurer }         from '@/lib/pm-plan-match'
import type { RateTable }            from '@/lib/pm-rates'
import type { BenefitTerm }          from '@/lib/pm-benefits-extract'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { calculator_ids, targets } = await req.json().catch(() => ({})) as { calculator_ids?: string[]; targets?: Record<string, string> }
    if (!Array.isArray(calculator_ids) || calculator_ids.length === 0) return NextResponse.json({ error: 'calculator_ids required' }, { status: 400 })
    if (!targets || Object.keys(targets).length === 0) return NextResponse.json({ error: 'targets required' }, { status: 400 })

    const ids = calculator_ids.map(id => `"${id}"`).join(',')
    const [calcRes, rtRes, termsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/pm_calculators?id=in.(${ids})&select=id,insurer_name,label`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=in.(${ids})&select=calculator_id,age_basis,coverages,rules`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_benefit_terms?calculator_id=in.(${ids})&select=calculator_id,terms`, { headers: sbH(), cache: 'no-store' }),
    ])
    const calcs = calcRes.ok ? await calcRes.json() as { id: string; insurer_name: string | null; label: string | null }[] : []
    const rts = rtRes.ok ? await rtRes.json() as (RateTable & { calculator_id: string })[] : []
    const termRows = termsRes.ok ? await termsRes.json() as { calculator_id: string; terms: BenefitTerm[] }[] : []
    const rtByCalc = new Map(rts.map(r => [r.calculator_id, r]))
    const termsByCalc = new Map(termRows.map(r => [r.calculator_id, r.terms ?? []]))

    const insurers: MatchInsurer[] = calcs
      .map(c => ({ calculator_id: c.id, insurer_name: c.insurer_name || c.label || 'Untitled', rate_table: rtByCalc.get(c.id), benefit_terms: termsByCalc.get(c.id) ?? [] }))
      .filter((i): i is MatchInsurer => !!i.rate_table)

    const { suggestions, error } = await suggestPlanMatch(targets, insurers)
    if (error && suggestions.length === 0) return NextResponse.json({ error }, { status: 502 })
    return NextResponse.json({ suggestions })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
