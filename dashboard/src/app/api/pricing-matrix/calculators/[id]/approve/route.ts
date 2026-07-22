/**
 * POST /api/pricing-matrix/calculators/[id]/approve
 * Marks a reviewed + verified calculator live. Archives any prior approved calculator for the
 * same insurer and bumps the version. Requires a runnable profile and at least one verification.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { profileIsRunnable }         from '@/lib/pm-profile'
import type { CellMapProfile }       from '@/lib/pm-profile'

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

    const calc = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=insurer_id,insurer_name,profile,verification,version&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!calc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!profileIsRunnable(calc.profile as CellMapProfile)) return NextResponse.json({ error: 'Profile is incomplete — finish mapping before approving' }, { status: 400 })
    if (!calc.verification) return NextResponse.json({ error: 'Run a verification first (confirm the sample premiums look right)' }, { status: 400 })

    // Archive prior approved calculators for the same insurer (match on id, else on name).
    const filter = calc.insurer_id ? `insurer_id=eq.${calc.insurer_id}` : `insurer_name=eq.${encodeURIComponent(calc.insurer_name ?? '')}`
    const priorApproved = await fetch(`${SB_URL}/rest/v1/pm_calculators?${filter}&status=eq.approved&select=id,version`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])) as { id: string; version: number }[]
    const maxVersion = priorApproved.reduce((mx, r) => Math.max(mx, r.version ?? 1), 0)
    for (const p of priorApproved) {
      if (p.id === id) continue
      await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${p.id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'archived' }) })
    }

    await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}`, {
      method: 'PATCH', headers: sbH('return=minimal'),
      body: JSON.stringify({ status: 'approved', version: Math.max(maxVersion + 1, calc.version ?? 1), approved_by: user.id, approved_at: new Date().toISOString() }),
    })
    void logActivity({ action: 'pm.calculator_approved', resource_type: 'pm_calculator', resource_id: id, new_value: { insurer: calc.insurer_name } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
