/**
 * GET /api/pricing-matrix/quote/available
 * Approved calculators available to quote against, with the profile bits the wizard needs to
 * render plan-selection controls (coverage lines + dropdown domains).
 */
import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { SB_URL, sbH }     from '@/lib/pm-storage'
import type { CellMapProfile } from '@/lib/pm-profile'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const res = await fetch(`${SB_URL}/rest/v1/pm_calculators?status=eq.approved&select=id,insurer_name,label,effective_date,version,profile&order=insurer_name.asc`, { headers: sbH(), cache: 'no-store' })
    const rows = res.ok ? await res.json() as { id: string; insurer_name: string | null; label: string | null; effective_date: string | null; version: number; profile: CellMapProfile }[] : []

    // Trim each profile down to what the UI needs.
    const out = rows.map(r => ({
      id: r.id,
      insurer_name: r.insurer_name || r.label || 'Untitled',
      effective_date: r.effective_date,
      version: r.version,
      coverage_lines: (r.profile?.coverage_lines ?? []).map(l => ({ code: l.code, label: l.label, fields: Object.keys(l.inputs ?? {}) })),
      dropdowns: r.profile?.dropdowns ?? {},
    }))
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
