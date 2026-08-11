/**
 * POST /api/pricing-matrix/calculators/[id]/extract/rate — STAGE 2a of 5: the parallel Opus +
 * Gemini rate-table READ only (no reconciliation, no judge call — see extract/rate-finalize for
 * that). Splitting the rate stage itself in two: the judge pass running sequentially AFTER this
 * parallel read was enough on its own to push the combined request past Vercel's free-plan
 * execution ceiling for a real workbook, even with the outer 4-stage pipeline already split apart.
 *
 * Stashes both raw readings in pm_calculators.pricing (a dead v1-era scratch jsonb column, unused
 * since the old "run the real Excel formula graph" engine was abandoned) so extract/rate-finalize
 * can read them back without re-running the AI calls.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { readRateTables }            from '@/lib/pm-rates-extract'
import { activeCategoryPromptList }  from '@/lib/pm-taxonomy'
import { loadCalc, fetchBrochureBase64, patchCalc, logRun, failExtraction } from '@/lib/pm-extract-shared'

export const maxDuration = 60

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t0 = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const calc = await loadCalc(id)
    if (!calc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await patchCalc(id, { map_progress: { label: 'Reading rates — Opus & Gemini', step: 2, total: 5, at: new Date().toISOString() } })
    const [brochureBase64, categoryPromptList] = await Promise.all([
      fetchBrochureBase64(calc.brochure_path),
      activeCategoryPromptList(),
    ])

    const readings = await readRateTables(calc.workbook_summary, brochureBase64, categoryPromptList)
    if (!readings.opus && !readings.gemini) {
      const msg = [readings.opusError && `opus: ${readings.opusError}`, readings.geminiError && `gemini: ${readings.geminiError}`].filter(Boolean).join('; ')
      void logRun(id, { kind: 'rate_extract', ok: false, error: msg, duration_ms: Date.now() - t0 })
      await failExtraction(id, `Rate extraction failed: ${msg || 'unknown error'}`, 2, 5)
      return NextResponse.json({ error: msg || 'Rate extraction failed' }, { status: 502 })
    }

    await patchCalc(id, { pricing: readings })
    void logRun(id, { kind: 'rate_extract', ok: true, duration_ms: Date.now() - t0, output: { phase: 'read', hasOpus: !!readings.opus, hasGemini: !!readings.gemini } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    await failExtraction(id, `Rate extraction failed: ${String(e)}`, 2, 5)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
