/**
 * POST /api/pricing-matrix/calculators/[id]/verify   { members, globals? }
 * Drives sample lives through the REAL workbook (Python /api/pm_run) with the current profile and
 * returns the computed premiums/totals — the golden check a human eyeballs before approving.
 * Stores the latest result on the calculator.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, signRead }     from '@/lib/pm-storage'
import { profileIsRunnable }         from '@/lib/pm-profile'
import type { CellMapProfile }       from '@/lib/pm-profile'

export const maxDuration = 120

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
const logRun = (calculator_id: string, r: Record<string, unknown>) =>
  fetch(`${SB_URL}/rest/v1/pm_calculator_runs`, { method: 'POST', headers: sbH('return=minimal'), body: JSON.stringify({ calculator_id, ...r }) }).catch(() => {})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t0 = Date.now()
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { members, globals } = await req.json() as { members?: unknown[]; globals?: Record<string, unknown> }
    if (!Array.isArray(members) || members.length === 0) return NextResponse.json({ error: 'members required' }, { status: 400 })

    const calc = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=xlsx_path,profile&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!calc?.xlsx_path) return NextResponse.json({ error: 'Calculator has no uploaded .xlsx' }, { status: 400 })
    const profile = calc.profile as CellMapProfile
    if (!profileIsRunnable(profile)) return NextResponse.json({ error: 'Profile is incomplete — map the sheet/rows/coverage lines first' }, { status: 400 })

    const xlsx_url = await signRead(calc.xlsx_path)
    const origin = new URL(req.url).origin
    const runRes = await fetch(`${origin}/api/pm_run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xlsx_url, profile, members, globals: globals ?? {} }) })
    const result = await runRes.json().catch(() => ({ error: 'pm_run returned non-JSON' }))
    if (!runRes.ok || result.error) {
      void logRun(id, { kind: 'verify', ok: false, error: result.error ?? `pm_run ${runRes.status}` })
      return NextResponse.json({ error: `Run failed: ${result.error ?? runRes.status}` }, { status: 502 })
    }

    const verification = { at: new Date().toISOString(), members: result.members, totals: result.totals, warnings: result.warnings ?? [], sample: members }
    await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ verification }) })
    void logRun(id, { kind: 'verify', ok: true, output: { grand: result.totals?.grand ?? null }, duration_ms: Date.now() - t0 })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
