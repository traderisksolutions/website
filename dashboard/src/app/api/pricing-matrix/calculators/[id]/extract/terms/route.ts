/**
 * POST /api/pricing-matrix/calculators/[id]/extract/terms
 *
 * Phase 2 of 2 (see extract/rates/route.ts for phase 1 and why this is split). Re-dumps the xlsx
 * and re-reads the brochure — cheap and mechanical, not worth persisting/passing through from
 * phase 1 just to save one fast fetch. Extracts benefit terms (Opus + Gemini, cross-checked) and
 * finalizes the calculator into 'in_review'. Best-effort: like the original single-request
 * behavior, a failed terms extraction doesn't block the (already-succeeded, phase 1) rate table
 * from being reviewable — only a failed rate extraction (phase 1) blocks progress.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH, signRead }     from '@/lib/pm-storage'
import { extractBenefitTerms }       from '@/lib/pm-benefits-extract'

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
const writeIssues = (rows: Record<string, unknown>[]) =>
  rows.length ? fetch(`${SB_URL}/rest/v1/pm_reconciliation_issues`, { method: 'POST', headers: sbH('return=minimal'), body: JSON.stringify(rows) }).catch(() => {}) : Promise.resolve()

async function fetchBase64(path: string): Promise<string> {
  const url = await signRead(path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer()).toString('base64')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const calc = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=xlsx_path,brochure_path,insurer_name&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!calc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const progress = async (label: string, step: number, total: number): Promise<void> => { await patch(id, { map_progress: { label, step, total, at: new Date().toISOString() } }) }

    let dump: unknown = null
    if (calc.xlsx_path) {
      try {
        const xlsx_url = await signRead(calc.xlsx_path)
        const origin = new URL(req.url).origin
        const dumpRes = await fetch(`${origin}/api/pm_dump`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xlsx_url }) })
        const d = await dumpRes.json().catch(() => ({ error: 'pm_dump returned non-JSON' }))
        if (dumpRes.ok && !d.error) dump = d
      } catch { /* best-effort — terms extraction still proceeds on the brochure alone */ }
    }
    const brochureBase64 = calc.brochure_path ? await fetchBase64(calc.brochure_path).catch(() => undefined) : undefined

    await progress('Extracting coverage terms', 4, 5)
    const benT0 = Date.now()
    const { terms, conflicts: termConflicts, error: benError } = await extractBenefitTerms(dump, brochureBase64, progress)
    if (terms) {
      await fetch(`${SB_URL}/rest/v1/pm_benefit_terms?on_conflict=calculator_id`, {
        method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
        body: JSON.stringify({ calculator_id: id, terms, accuracy: { total: terms.length, conflicts: termConflicts.length } }),
      })
      void writeIssues(termConflicts.map(tc => ({ calculator_id: id, kind: 'term', category: tc.category, label: tc.label, dedupe_key: tc.key, opus_value: tc.opus ?? null, gemini_value: tc.gemini ?? null, note: tc.note })))
      void logRun(id, { kind: 'benefit_extract', model: 'claude-opus-4-8+gemini', ok: true, duration_ms: Date.now() - benT0, output: { terms: terms.length, conflicts: termConflicts.length } })
    } else {
      void logRun(id, { kind: 'benefit_extract', ok: false, error: benError, duration_ms: Date.now() - benT0 })
    }

    await progress('Done', 5, 5)
    await patch(id, { status: 'in_review' })
    void logActivity({ action: 'pm.calculator_extracted', resource_type: 'pm_calculator', resource_id: id, new_value: { terms: terms?.length ?? 0 } })

    return NextResponse.json({ ok: true, terms_ok: !!terms })
  } catch (e) {
    // The rate table (phase 1) already succeeded by the time this route runs — don't reset status
    // back to 'draft' and lose that; just report the error and leave it for a retry.
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
