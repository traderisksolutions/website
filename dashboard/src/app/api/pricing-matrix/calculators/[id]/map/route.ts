/**
 * POST /api/pricing-matrix/calculators/[id]/map
 * Dumps the uploaded workbook (Python /api/pm_dump), asks Opus to PROPOSE a cell-map profile,
 * attaches the discovered dropdown domains, and stores it for human review (status → in_review).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH, signRead }     from '@/lib/pm-storage'
import { proposeProfile }            from '@/lib/pm-map'
import type { WorkbookDump }         from '@/lib/pm-map'
import { extractPricing }            from '@/lib/pm-pricing'

export const maxDuration = 300

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
const patch = (id: string, body: Record<string, unknown>) =>
  fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(body) })
const logRun = (calculator_id: string, r: Record<string, unknown>) =>
  fetch(`${SB_URL}/rest/v1/pm_calculator_runs`, { method: 'POST', headers: sbH('return=minimal'), body: JSON.stringify({ calculator_id, ...r }) }).catch(() => {})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t0 = Date.now()
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const calc = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=xlsx_path,insurer_name,pricing&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!calc?.xlsx_path) return NextResponse.json({ error: 'Calculator has no uploaded .xlsx' }, { status: 400 })
    // Only run the (heavy) Opus+Gemini+judge pricing extraction when we don't already have it, so a
    // Re-map (to fix the cell-map) stays cheap. Force it via "Refresh rate tables" / ?pricing=1.
    const needPricing = new URL(req.url).searchParams.get('pricing') === '1' || !calc.pricing?.coverages?.length

    // Live progress the review page polls (Opus + Gemini + judge takes a while).
    const progress = async (label: string, step: number, total: number): Promise<void> => { await patch(id, { map_progress: { label, step, total, at: new Date().toISOString() } }) }

    await patch(id, { status: 'mapping' })
    await progress('Reading the workbook', 1, 6)

    const xlsx_url = await signRead(calc.xlsx_path)
    const origin = new URL(req.url).origin

    // 1) Mechanical dump (Python).
    const dumpRes = await fetch(`${origin}/api/pm_dump`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xlsx_url }) })
    const dump = await dumpRes.json().catch(() => ({ error: 'pm_dump returned non-JSON' })) as WorkbookDump & { error?: string }
    if (!dumpRes.ok || dump.error) {
      await patch(id, { status: 'draft' })
      void logRun(id, { kind: 'dump', ok: false, error: dump.error ?? `pm_dump ${dumpRes.status}` })
      return NextResponse.json({ error: `Dump failed: ${dump.error ?? dumpRes.status}` }, { status: 502 })
    }
    void logRun(id, { kind: 'dump', ok: true, output: { sheets: dump.sheets?.length ?? 0 }, duration_ms: Date.now() - t0 })

    // 2) Opus proposes the cell-map profile.
    await progress('Mapping the input & output cells', 2, 6)
    const { profile, raw, error } = await proposeProfile(dump)
    if (!profile) {
      await patch(id, { status: 'draft', workbook_summary: dump })
      void logRun(id, { kind: 'map_propose', model: 'claude-opus-4-8', ok: false, error: error ?? 'no profile', output: { raw: raw?.slice(0, 500) } })
      return NextResponse.json({ error: `Mapping failed: ${error ?? 'model did not return a profile'}` }, { status: 502 })
    }

    await patch(id, { profile, workbook_summary: dump, status: 'in_review' })
    void logRun(id, { kind: 'map_propose', model: 'claude-opus-4-8', ok: true, output: { coverage_lines: profile.coverage_lines?.length ?? 0, unmapped: profile.unmapped ?? [] }, duration_ms: Date.now() - t0 })
    void logActivity({ action: 'pm.calculator_mapped', resource_type: 'pm_calculator', resource_id: id, new_value: { coverage_lines: profile.coverage_lines?.length ?? 0 } })

    // Extract the transparent rate tables from the same dump — Opus + Gemini + reconciling judge
    // (best-effort: a pricing failure must not fail the mapping; the reviewer can re-map to retry).
    if (needPricing) {
      await progress('Extracting rate tables', 3, 6)
      try {
        const { pricing, error: pErr } = await extractPricing(dump, progress)
        if (pricing) {
          await patch(id, { pricing })
          void logRun(id, { kind: 'map_propose', model: 'claude-opus-4-8', ok: true, output: { pricing_coverages: pricing.coverages?.length ?? 0, accuracy: pricing.accuracy } })
        } else {
          void logRun(id, { kind: 'map_propose', ok: false, error: `pricing: ${pErr ?? 'no pricing'}` })
        }
      } catch (e) {
        void logRun(id, { kind: 'map_propose', ok: false, error: `pricing: ${String(e)}` })
      }
    }

    await progress('Done', 6, 6)
    return NextResponse.json({ ok: true, profile })
  } catch (e) {
    await patch(id, { status: 'draft' }).catch(() => {})
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
