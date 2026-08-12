/**
 * POST /api/pricing-matrix/calculators/[id]/extract/rate — STAGE 2b of 6: the parallel Opus +
 * Gemini rate-table READ for ONE sheet-batch (see extract/rate-plan and pm-extract-shared.ts's
 * planSheetBatches/subDump). The client calls this once per batch the plan stage returned — each
 * call only ever embeds that batch's slice of the dump, not the whole workbook, which is what was
 * pushing a single combined read past Vercel's free-plan execution ceiling on a large workbook.
 *
 * Appends this batch's raw reading onto pm_calculators.pricing (a dead v1-era scratch jsonb
 * column) instead of overwriting it, so extract/rate-finalize can merge every batch's reading
 * once all of them have run.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { readRateTables }            from '@/lib/pm-rates-extract'
import type { RateReadings }         from '@/lib/pm-rates-extract'
import { activeCategoryPromptList }  from '@/lib/pm-taxonomy'
import { loadCalc, fetchBrochureBase64, patchCalc, logRun, failExtraction, subDump } from '@/lib/pm-extract-shared'

export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t0 = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { sheets?: string[]; batchIndex?: number; batchTotal?: number }
    const sheets = Array.isArray(body.sheets) ? body.sheets : []
    const batchIndex = typeof body.batchIndex === 'number' ? body.batchIndex : 0
    const batchTotal = typeof body.batchTotal === 'number' && body.batchTotal > 0 ? body.batchTotal : 1

    const calc = await loadCalc(id)
    if (!calc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await patchCalc(id, { map_progress: { label: `Reading rates — sheet batch ${batchIndex + 1} of ${batchTotal}`, step: 2, total: 6, at: new Date().toISOString() } })
    const [brochureBase64, categoryPromptList] = await Promise.all([
      // The brochure is the primary source and often the ONLY source for a formula-shell workbook,
      // so every batch still gets it — only the workbook slice shrinks per call.
      fetchBrochureBase64(calc.brochure_path),
      activeCategoryPromptList(),
    ])

    // rate-plan only ever returns an empty-sheets batch as the SOLE batch (brochure-only
    // calculator, nothing to slice) — never mixed in alongside real sheet batches.
    const dumpSlice = sheets.length ? subDump(calc.workbook_summary, sheets) : null
    const readings = await readRateTables(dumpSlice, brochureBase64, categoryPromptList)
    if (!readings.opus && !readings.gemini) {
      const msg = [readings.opusError && `opus: ${readings.opusError}`, readings.geminiError && `gemini: ${readings.geminiError}`].filter(Boolean).join('; ')
      // A single batch turning up nothing isn't necessarily fatal (that sheet might genuinely have
      // no rate content) — only fail the whole extraction if EVERY batch comes up empty, which
      // extract/rate-finalize detects once it merges everything back together.
      void logRun(id, { kind: 'rate_extract', ok: false, error: msg, duration_ms: Date.now() - t0, output: { phase: 'read', batchIndex, sheets } })
      const existing = (Array.isArray(calc.pricing) ? calc.pricing : []) as RateReadings[]
      await patchCalc(id, { pricing: [...existing, readings] })
      return NextResponse.json({ ok: true, empty: true })
    }

    const existing = (Array.isArray(calc.pricing) ? calc.pricing : []) as RateReadings[]
    await patchCalc(id, { pricing: [...existing, readings] })
    void logRun(id, { kind: 'rate_extract', ok: true, duration_ms: Date.now() - t0, output: { phase: 'read', batchIndex, sheets, hasOpus: !!readings.opus, hasGemini: !!readings.gemini } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    await failExtraction(id, `Rate extraction failed: ${String(e)}`, 2, 6)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
