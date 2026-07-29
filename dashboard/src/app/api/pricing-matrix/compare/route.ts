/**
 * GET /api/pricing-matrix/compare?ids=<uuid>,<uuid>,...
 * Coverage terms for the given approved calculators — cached at extraction time, so this is a
 * plain read, no AI call.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import type { BenefitTerm }          from '@/lib/pm-benefits-extract'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return NextResponse.json({ error: 'ids required' }, { status: 400 })
    const inList = ids.map(i => `"${i}"`).join(',')

    const calcs = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=in.(${inList})&status=eq.approved&select=id,insurer_name,label`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])) as { id: string; insurer_name: string | null; label: string | null }[]
    const terms = await fetch(`${SB_URL}/rest/v1/pm_benefit_terms?calculator_id=in.(${inList})&select=calculator_id,terms`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])) as { calculator_id: string; terms: BenefitTerm[] }[]
    const termsByCalc = new Map(terms.map(t => [t.calculator_id, t.terms]))

    const out = calcs.map(c => ({ calculator_id: c.id, insurer_name: c.insurer_name || c.label || 'Untitled', terms: termsByCalc.get(c.id) ?? [] }))
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
