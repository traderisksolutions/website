/**
 * POST /api/pricing-matrix/calculators/[id]/extract/dump — STAGE 1 of 4.
 *
 * Resets the calculator for a fresh extraction (status='extracting', clears old reconciliation
 * issues) and runs the mechanical xlsx dump (Python, no AI — typically a few seconds). Persists
 * the dump to pm_calculators.workbook_summary so stages 2-4 (rate/benefits/rules) read it back
 * instead of re-invoking the Python service each time. The review page (runExtract) calls this,
 * then rate, then benefits, then rules, each a normal synchronous request — see pm-extract-shared.ts
 * for why this is 4 short calls instead of one long backgrounded one.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, signRead }     from '@/lib/pm-storage'
import { patchCalc, logRun }         from '@/lib/pm-extract-shared'

export const maxDuration = 60

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t0 = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const calc = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=xlsx_path,brochure_path&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!calc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!calc.xlsx_path && !calc.brochure_path) return NextResponse.json({ error: 'Calculator has no uploaded xlsx or brochure' }, { status: 400 })

    await patchCalc(id, { status: 'extracting', map_progress: { label: 'Reading the workbook', step: 1, total: 4, at: new Date().toISOString() } })
    await fetch(`${SB_URL}/rest/v1/pm_reconciliation_issues?calculator_id=eq.${id}`, { method: 'DELETE', headers: sbH('return=minimal') }).catch(() => {})

    let dump: unknown = null
    if (calc.xlsx_path) {
      try {
        const xlsx_url = await signRead(calc.xlsx_path)
        const origin = new URL(_req.url).origin
        const dumpRes = await fetch(`${origin}/api/pm_dump`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xlsx_url }) })
        const d = await dumpRes.json().catch(() => ({ error: 'pm_dump returned non-JSON' }))
        if (dumpRes.ok && !d.error) { dump = d; void logRun(id, { kind: 'dump', ok: true, output: { sheets: d.sheets?.length ?? 0 }, duration_ms: Date.now() - t0 }) }
        else void logRun(id, { kind: 'dump', ok: false, error: d.error ?? `pm_dump ${dumpRes.status}` })
      } catch (e) { void logRun(id, { kind: 'dump', ok: false, error: String(e) }) }
    }

    await patchCalc(id, { workbook_summary: dump })
    return NextResponse.json({ ok: true, hasDump: !!dump })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
