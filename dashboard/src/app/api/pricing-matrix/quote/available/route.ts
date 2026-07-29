/**
 * GET /api/pricing-matrix/quote/available
 * Approved calculators available to quote against, with what the wizard needs to render
 * plan-selection controls (coverage codes + the plan choices each one offers).
 */
import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { SB_URL, sbH }     from '@/lib/pm-storage'
import { coverageCodes, plansFor } from '@/lib/pm-rates'
import type { RateTable }  from '@/lib/pm-rates'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const calcRes = await fetch(`${SB_URL}/rest/v1/pm_calculators?status=eq.approved&select=id,insurer_name,label,effective_date,version&order=insurer_name.asc`, { headers: sbH(), cache: 'no-store' })
    const calcs = calcRes.ok ? await calcRes.json() as { id: string; insurer_name: string | null; label: string | null; effective_date: string | null; version: number }[] : []
    if (calcs.length === 0) return NextResponse.json([])

    const ids = calcs.map(c => `"${c.id}"`).join(',')
    const rtRes = await fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=in.(${ids})&select=calculator_id,age_basis,coverages,rules`, { headers: sbH(), cache: 'no-store' })
    const rts = rtRes.ok ? await rtRes.json() as (RateTable & { calculator_id: string })[] : []
    const byCalc = new Map(rts.map(r => [r.calculator_id, r]))

    const out = calcs.map(c => {
      const rt = byCalc.get(c.id) ?? null
      return {
        id: c.id,
        insurer_name: c.insurer_name || c.label || 'Untitled',
        effective_date: c.effective_date,
        version: c.version,
        coverage_lines: coverageCodes(rt).map(l => ({ code: l.code, label: l.label, fields: ['plan'] })),
        dropdowns: Object.fromEntries(coverageCodes(rt).map(l => [`${l.code}.plan`, plansFor(rt, l.code).map(p => p.code)])),
      }
    })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
