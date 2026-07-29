/**
 * POST /api/pricing-matrix/calculators/[id]/extract
 *
 * The one extraction pass for a calculator: dumps the xlsx (if present, Python /api/pm_dump —
 * mechanical, no AI), reads the brochure PDF (if present), then runs BOTH the rate-table
 * extraction (pm-rates-extract.ts) and the benefit-terms extraction (pm-benefits-extract.ts) —
 * cross-checked Opus + Gemini, cross-referencing whichever of the two source documents are
 * available. Results are persisted to pm_rate_tables / pm_benefit_terms (upsert) so nothing is
 * re-extracted at quote time or compare time. Calculator moves to 'in_review' for a human to
 * confirm before it can be approved.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH, signRead }     from '@/lib/pm-storage'
import { extractRateTable }          from '@/lib/pm-rates-extract'
import { extractBenefitTerms }       from '@/lib/pm-benefits-extract'
import type { RateTable }            from '@/lib/pm-rates'

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

async function fetchBase64(path: string): Promise<string> {
  const url = await signRead(path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer()).toString('base64')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t0 = Date.now()
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const calc = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=xlsx_path,brochure_path,insurer_name&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!calc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!calc.xlsx_path && !calc.brochure_path) return NextResponse.json({ error: 'Calculator has no uploaded xlsx or brochure' }, { status: 400 })

    const progress = async (label: string, step: number, total: number): Promise<void> => { await patch(id, { map_progress: { label, step, total, at: new Date().toISOString() } }) }

    await patch(id, { status: 'extracting' })
    await progress('Reading the workbook', 1, 5)

    // 1) Mechanical xlsx dump (Python, no AI) — best-effort, extraction still proceeds on the
    // brochure alone if this fails or there's no xlsx.
    let dump: unknown = null
    if (calc.xlsx_path) {
      try {
        const xlsx_url = await signRead(calc.xlsx_path)
        const origin = new URL(req.url).origin
        const dumpRes = await fetch(`${origin}/api/pm_dump`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xlsx_url }) })
        const d = await dumpRes.json().catch(() => ({ error: 'pm_dump returned non-JSON' }))
        if (dumpRes.ok && !d.error) { dump = d; void logRun(id, { kind: 'dump', ok: true, output: { sheets: d.sheets?.length ?? 0 }, duration_ms: Date.now() - t0 }) }
        else void logRun(id, { kind: 'dump', ok: false, error: d.error ?? `pm_dump ${dumpRes.status}` })
      } catch (e) { void logRun(id, { kind: 'dump', ok: false, error: String(e) }) }
    }

    const brochureBase64 = calc.brochure_path ? await fetchBase64(calc.brochure_path).catch(() => undefined) : undefined
    if (calc.brochure_path && !brochureBase64) void logRun(id, { kind: 'dump', ok: false, error: 'could not fetch brochure PDF' })

    // 2) Rate table (the number that actually prices a quote).
    await progress('Extracting rate tables', 2, 5)
    const rateT0 = Date.now()
    const { table, accuracy, ruleConflicts, error: rateError } = await extractRateTable(dump, brochureBase64, progress)
    // Dollar-value rate conflicts are already auto-adjudicated by the Opus judge inside
    // extractRateTable; only the rule-level conflicts (age basis / GST / loading bands, which have
    // no automatic judge pass) need a human decision — persisted here so the review page survives
    // a refresh without re-extracting.
    const rtAccuracy = { ...accuracy, rule_conflicts: ruleConflicts ?? [] }
    if (table) {
      await fetch(`${SB_URL}/rest/v1/pm_rate_tables?on_conflict=calculator_id`, {
        method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
        body: JSON.stringify({ calculator_id: id, age_basis: table.age_basis, coverages: table.coverages, rules: table.rules, accuracy: rtAccuracy }),
      })
      void logRun(id, { kind: 'rate_extract', model: 'claude-opus-4-8+gemini', ok: true, duration_ms: Date.now() - rateT0, output: { coverages: table.coverages.length, accuracy, rule_conflicts: ruleConflicts?.length ?? 0 } })
    } else {
      void logRun(id, { kind: 'rate_extract', ok: false, error: rateError, duration_ms: Date.now() - rateT0 })
    }

    // 3) Coverage/benefit wordings (Level 2 comparison data) — best-effort, doesn't block approval
    // on its own but a calculator without any terms can't be usefully compared later.
    await progress('Extracting coverage terms', 4, 5)
    const benT0 = Date.now()
    const { terms, conflicts: termConflicts, error: benError } = await extractBenefitTerms(dump, brochureBase64, progress)
    if (terms) {
      await fetch(`${SB_URL}/rest/v1/pm_benefit_terms?on_conflict=calculator_id`, {
        method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
        body: JSON.stringify({ calculator_id: id, terms, accuracy: { total: terms.length, conflicts: termConflicts } }),
      })
      void logRun(id, { kind: 'benefit_extract', model: 'claude-opus-4-8+gemini', ok: true, duration_ms: Date.now() - benT0, output: { terms: terms.length, conflicts: termConflicts.length } })
    } else {
      void logRun(id, { kind: 'benefit_extract', ok: false, error: benError, duration_ms: Date.now() - benT0 })
    }

    if (!table) {
      await patch(id, { status: 'draft' })
      return NextResponse.json({ error: `Rate extraction failed: ${rateError ?? 'unknown error'}` }, { status: 502 })
    }

    await progress('Done', 5, 5)
    await patch(id, { status: 'in_review' })
    void logActivity({ action: 'pm.calculator_extracted', resource_type: 'pm_calculator', resource_id: id, new_value: { coverages: table.coverages.length } })

    const rate_table: RateTable = { calculator_id: id, age_basis: table.age_basis, coverages: table.coverages, rules: table.rules, accuracy: rtAccuracy }
    return NextResponse.json({ ok: true, rate_table, term_conflicts: termConflicts, terms_ok: !!terms })
  } catch (e) {
    await patch(id, { status: 'draft' }).catch(() => {})
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
