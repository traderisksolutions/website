/**
 * POST /api/pricing-matrix/calculators/[id]/extract/rate — STAGE 2 of 4.
 * Reads the dump the previous stage persisted (no re-run of the Python service), runs the rate-
 * table extraction (Opus + Gemini + judge), and persists pm_rate_tables + any rule conflicts.
 * See pm-extract-shared.ts for why this is its own short request instead of one long chain.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { extractRateTable }          from '@/lib/pm-rates-extract'
import { activeCategoryPromptList, resolveExtractedCategories } from '@/lib/pm-taxonomy'
import type { ExtractedItem }        from '@/lib/pm-taxonomy'
import { loadCalc, fetchBrochureBase64, patchCalc, logRun, writeIssues, failExtraction } from '@/lib/pm-extract-shared'

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

    await patchCalc(id, { map_progress: { label: 'Extracting rate tables', step: 2, total: 4, at: new Date().toISOString() } })
    const [brochureBase64, categoryPromptList] = await Promise.all([
      fetchBrochureBase64(calc.brochure_path),
      activeCategoryPromptList(),
    ])

    const { table, accuracy, ruleConflicts, error: rateError } = await extractRateTable(calc.workbook_summary, brochureBase64, categoryPromptList)
    if (!table) {
      void logRun(id, { kind: 'rate_extract', ok: false, error: rateError, duration_ms: Date.now() - t0 })
      await failExtraction(id, `Rate extraction failed: ${rateError ?? 'unknown error'}`, 2, 4)
      return NextResponse.json({ error: rateError ?? 'Rate extraction failed' }, { status: 502 })
    }

    // Resolve each coverage's AI-guessed canonical_category against the live taxonomy — exact
    // matches get canonical_category_id directly; anything else is queued in pm_taxonomy_synonyms
    // for a human (see the calculator review page's "New terminology" card / /pricing-matrix/taxonomy).
    const covResolved = await resolveExtractedCategories(
      table.coverages.map((c, i): ExtractedItem => ({ i, source: 'coverage', term: c.full_name || c.code, canonical_category: c.canonical_category })),
      calc.insurer_id, id,
    )
    table.coverages = table.coverages.map((c, i) => covResolved.has(i) ? { ...c, canonical_category: covResolved.get(i)!.name, canonical_category_id: covResolved.get(i)!.id } : c)

    // Dollar-value rate conflicts are already auto-adjudicated by the Opus judge inside
    // extractRateTable; only rule-level conflicts (age basis / GST / loading bands, no automatic
    // judge pass) need a human decision — persisted as pm_reconciliation_issues rows.
    await fetch(`${SB_URL}/rest/v1/pm_rate_tables?on_conflict=calculator_id`, {
      method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
      body: JSON.stringify({ calculator_id: id, age_basis: table.age_basis, coverages: table.coverages, rules: table.rules, source: table.source, accuracy }),
    })
    void writeIssues((ruleConflicts ?? []).map(rc => ({ calculator_id: id, kind: 'rule', field: rc.field, opus_value: rc.opus, gemini_value: rc.gemini })))
    void logRun(id, { kind: 'rate_extract', model: 'claude-opus-4-8+gemini', ok: true, duration_ms: Date.now() - t0, output: { coverages: table.coverages.length, accuracy, rule_conflicts: ruleConflicts?.length ?? 0, source: table.source } })

    return NextResponse.json({ ok: true, coverages: table.coverages.length })
  } catch (e) {
    await failExtraction(id, `Rate extraction failed: ${String(e)}`, 2, 4)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
