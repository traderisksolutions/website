/**
 * POST /api/pricing-matrix/calculators/[id]/rules/approve
 *
 * Approves a calculator's translated calculation logic (pm_computation_rules) — its OWN lifecycle,
 * independent from pm_calculators.status/pm_rate_tables (see supabase/migrations/
 * 20260813_pm_computation_rules.sql and the plan decision it implements): a rate refresh shouldn't
 * force re-reviewing calculation logic that didn't change, and vice versa. Only APPROVED rule sets
 * are ever read by computeInsurerQuote (pm-calc.ts) at quote time — see pm-quote-server.ts.
 *
 * A calculator with no computation rules at all (the common case — most are a flat rate grid) never
 * needs this; there's nothing to approve and pm-calc.ts's flat-lookup path runs unaffected.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH }               from '@/lib/pm-storage'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const cr = await fetch(`${SB_URL}/rest/v1/pm_computation_rules?calculator_id=eq.${id}&select=id,rules&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!cr) return NextResponse.json({ error: 'No computation rules extracted for this calculator yet' }, { status: 404 })
    if (!Array.isArray(cr.rules) || cr.rules.length === 0) return NextResponse.json({ error: 'No rule steps to approve' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/pm_computation_rules?calculator_id=eq.${id}`, {
      method: 'PATCH', headers: sbH('return=minimal'),
      body: JSON.stringify({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    void logActivity({ action: 'pm.computation_rules_approved', resource_type: 'pm_calculator', resource_id: id, new_value: { steps: cr.rules.length } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
