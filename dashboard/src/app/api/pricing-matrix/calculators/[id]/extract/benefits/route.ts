/**
 * POST /api/pricing-matrix/calculators/[id]/extract/benefits — STAGE 3 of 4.
 * Reads the dump the first stage persisted, runs the coverage/benefit-wordings extraction
 * (Opus + Gemini), and persists pm_benefit_terms + any term conflicts. Best-effort — unlike the
 * rate stage, a failure here doesn't fail the whole extraction (a calculator without terms just
 * can't be usefully compared on Level 2 yet).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { extractBenefitTerms }       from '@/lib/pm-benefits-extract'
import { activeCategoryPromptList, resolveExtractedCategories } from '@/lib/pm-taxonomy'
import type { ExtractedItem }        from '@/lib/pm-taxonomy'
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

    await patchCalc(id, { map_progress: { label: 'Extracting coverage terms', step: 4, total: 5, at: new Date().toISOString() } })
    const [brochureBase64, categoryPromptList] = await Promise.all([
      fetchBrochureBase64(calc.brochure_path),
      activeCategoryPromptList(),
    ])

    const { terms, conflicts: termConflicts, error: benError } = await extractBenefitTerms(calc.workbook_summary, brochureBase64, categoryPromptList)
    if (!terms) {
      void logRun(id, { kind: 'benefit_extract', ok: false, error: benError, duration_ms: Date.now() - t0 })
      return NextResponse.json({ ok: true, terms: 0, error: benError })
    }

    const termResolved = await resolveExtractedCategories(
      terms.map((t, i): ExtractedItem => ({ i, source: 'benefit_term', term: t.label, canonical_category: t.canonical_category })),
      calc.insurer_id, id,
    )
    const resolvedTerms = terms.map((t, i) => termResolved.has(i) ? { ...t, canonical_category: termResolved.get(i)!.name, canonical_category_id: termResolved.get(i)!.id } : t)
    await fetch(`${SB_URL}/rest/v1/pm_benefit_terms?on_conflict=calculator_id`, {
      method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
      body: JSON.stringify({ calculator_id: id, terms: resolvedTerms, accuracy: { total: resolvedTerms.length, conflicts: termConflicts.length } }),
    })
    void writeIssues(termConflicts.map(tc => ({ calculator_id: id, kind: 'term', category: tc.category, label: tc.label, dedupe_key: tc.key, opus_value: tc.opus ?? null, gemini_value: tc.gemini ?? null, note: tc.note })))
    void logRun(id, { kind: 'benefit_extract', model: 'claude-opus-4-8+gemini', ok: true, duration_ms: Date.now() - t0, output: { terms: resolvedTerms.length, conflicts: termConflicts.length } })

    return NextResponse.json({ ok: true, terms: resolvedTerms.length })
  } catch (e) {
    void logRun(id, { kind: 'benefit_extract', ok: false, error: String(e), duration_ms: Date.now() - t0 })
    // Best-effort — don't fail the whole pipeline over the benefits stage.
    return NextResponse.json({ ok: true, terms: 0, error: String(e) })
  }
}
