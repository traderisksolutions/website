/**
 * POST /api/pricing-matrix/calculators/[id]/extract/rules — STAGE 6 of 6 (final).
 * Reads the dump the first stage persisted, detects the Excel's shape and translates its
 * calculation logic (see pm-rules-extract.ts) — best-effort, a calculator with no translatable
 * logic (the common case, a plain rate grid) simply gets no pm_computation_rules row. This is the
 * LAST stage: it flips the calculator to 'in_review' regardless of whether rules extraction found
 * anything, since the rate table (stage 2, required) and terms (stage 3, best-effort) are already
 * persisted by the time this runs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { extractComputationRules }   from '@/lib/pm-rules-extract'
import { logActivity }               from '@/lib/log-activity'
import { loadCalc, fetchBrochureBase64, patchCalc, logRun, writeIssues } from '@/lib/pm-extract-shared'

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

    await patchCalc(id, { map_progress: { label: 'Reading calculation logic', step: 6, total: 6, at: new Date().toISOString() } })
    const brochureBase64 = await fetchBrochureBase64(calc.brochure_path)

    let steps = 0
    try {
      const { rules, source: excelShape, structurallyDisputed, error: rulesError } = await extractComputationRules(calc.workbook_summary, brochureBase64)
      if (rules?.length) {
        steps = rules.length
        await fetch(`${SB_URL}/rest/v1/pm_computation_rules?on_conflict=calculator_id`, {
          method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
          body: JSON.stringify({ calculator_id: id, source: excelShape, rules, status: 'draft' }),
        })
        if (structurallyDisputed) {
          void writeIssues([{ calculator_id: id, kind: 'computation_rule', note: 'Opus and Gemini produced different calculation-logic structures — review both readings before approving.' }])
        }
        void logRun(id, { kind: 'rules_extract', model: 'claude-opus-4-8+gemini', ok: true, duration_ms: Date.now() - t0, output: { steps, source: excelShape, disputed: structurallyDisputed } })
      } else {
        void logRun(id, { kind: 'rules_extract', ok: false, error: rulesError, duration_ms: Date.now() - t0 })
      }
    } catch (e) {
      // Never fails the whole extraction — computation rules are a bonus on top of the rate table.
      void logRun(id, { kind: 'rules_extract', ok: false, error: String(e), duration_ms: Date.now() - t0 })
    }

    await patchCalc(id, { status: 'in_review' })
    void logActivity({ action: 'pm.calculator_extracted', resource_type: 'pm_calculator', resource_id: id, new_value: { rule_steps: steps } })
    return NextResponse.json({ ok: true, ruleSteps: steps })
  } catch (e) {
    // Rules are best-effort, but the pipeline must still land somewhere reviewable.
    await patchCalc(id, { status: 'in_review' }).catch(() => {})
    return NextResponse.json({ ok: true, ruleSteps: 0, error: String(e) })
  }
}
