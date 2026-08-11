/**
 * POST /api/pricing-matrix/calculators/[id]/extract
 *
 * Kicks off the extraction pipeline (dump the xlsx, read the brochure, then run BOTH the rate-
 * table extraction and the benefit-terms extraction — cross-checked Opus + Gemini) and returns
 * immediately, running the actual work in the background via `waitUntil`.
 *
 * Splitting this into a fast ack + background job (rather than the browser awaiting the whole AI
 * pipeline in one request) is deliberate: an earlier version had the browser's fetch itself wait
 * on the full pipeline, which could exceed the platform's actual enforced gateway timeout on a
 * slow/complex workbook and come back as a bare 504 — even after splitting rates/terms into two
 * separate requests, a SINGLE Opus+Gemini extraction pass alone was still occasionally hitting
 * that ceiling. `waitUntil` decouples the two: the browser's request returns in well under a
 * second, and the review page polls /map-status (already built for the progress bar) until
 * `status` leaves 'extracting' — see runExtract() in pricing-matrix/[id]/page.tsx.
 *
 * Results are persisted to pm_rate_tables / pm_benefit_terms (upsert) so nothing is re-extracted
 * at quote time or compare time. Calculator moves to 'in_review' for a human to confirm before it
 * can be approved.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { waitUntil }                 from '@vercel/functions'
import { SB_URL, sbH, signRead }     from '@/lib/pm-storage'
import { extractRateTable }          from '@/lib/pm-rates-extract'
import { extractBenefitTerms }       from '@/lib/pm-benefits-extract'
import { extractComputationRules }   from '@/lib/pm-rules-extract'
import { activeCategoryPromptList, resolveExtractedCategories } from '@/lib/pm-taxonomy'
import type { ExtractedItem }        from '@/lib/pm-taxonomy'

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

/** A fresh extraction fully replaces the rate table/terms, so any prior issue's context is moot —
 *  same precedent as the "Re-extract replaces everything" confirm dialog on the review page. */
const clearIssues = (calculator_id: string) =>
  fetch(`${SB_URL}/rest/v1/pm_reconciliation_issues?calculator_id=eq.${calculator_id}`, { method: 'DELETE', headers: sbH('return=minimal') }).catch(() => {})
const writeIssues = (rows: Record<string, unknown>[]) =>
  rows.length ? fetch(`${SB_URL}/rest/v1/pm_reconciliation_issues`, { method: 'POST', headers: sbH('return=minimal'), body: JSON.stringify(rows) }).catch(() => {}) : Promise.resolve()

/** Surfaced to the client via /map-status — the poll loop shows this as the error banner when
 *  status lands back on 'draft' with an error-flagged progress entry. */
const fail = async (id: string, label: string) => {
  await patch(id, { status: 'draft', map_progress: { label, step: 0, total: 5, at: new Date().toISOString(), error: true } })
}

async function fetchBase64(path: string): Promise<string> {
  const url = await signRead(path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer()).toString('base64')
}

async function runPipeline(id: string, calc: { xlsx_path: string | null; brochure_path: string | null; insurer_id: string | null }, origin: string) {
  const t0 = Date.now()
  try {
    const progress = async (label: string, step: number, total: number): Promise<void> => { await patch(id, { map_progress: { label, step, total, at: new Date().toISOString() } }) }
    await progress('Reading the workbook', 1, 5)
    const categoryPromptList = await activeCategoryPromptList()

    // Mechanical xlsx dump (Python, no AI) — best-effort, extraction still proceeds on the
    // brochure alone if this fails or there's no xlsx.
    let dump: unknown = null
    if (calc.xlsx_path) {
      try {
        const xlsx_url = await signRead(calc.xlsx_path)
        const dumpRes = await fetch(`${origin}/api/pm_dump`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xlsx_url }) })
        const d = await dumpRes.json().catch(() => ({ error: 'pm_dump returned non-JSON' }))
        if (dumpRes.ok && !d.error) { dump = d; void logRun(id, { kind: 'dump', ok: true, output: { sheets: d.sheets?.length ?? 0 }, duration_ms: Date.now() - t0 }) }
        else void logRun(id, { kind: 'dump', ok: false, error: d.error ?? `pm_dump ${dumpRes.status}` })
      } catch (e) { void logRun(id, { kind: 'dump', ok: false, error: String(e) }) }
    }

    const brochureBase64 = calc.brochure_path ? await fetchBase64(calc.brochure_path).catch(() => undefined) : undefined
    if (calc.brochure_path && !brochureBase64) void logRun(id, { kind: 'dump', ok: false, error: 'could not fetch brochure PDF' })

    // 1) Rate table (the number that actually prices a quote). PDF is now the primary numeric
    // source (see pm-rates-extract.ts) — the xlsx fills gaps or is flagged if it disagrees.
    await progress('Extracting rate tables', 2, 5)
    const rateT0 = Date.now()
    const { table, accuracy, ruleConflicts, error: rateError } = await extractRateTable(dump, brochureBase64, categoryPromptList, progress)
    if (!table) {
      void logRun(id, { kind: 'rate_extract', ok: false, error: rateError, duration_ms: Date.now() - rateT0 })
      await fail(id, `Rate extraction failed: ${rateError ?? 'unknown error'}`)
      return
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
    // extractRateTable; only the rule-level conflicts (age basis / GST / loading bands, which have
    // no automatic judge pass) need a human decision — persisted as pm_reconciliation_issues rows.
    await fetch(`${SB_URL}/rest/v1/pm_rate_tables?on_conflict=calculator_id`, {
      method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
      body: JSON.stringify({ calculator_id: id, age_basis: table.age_basis, coverages: table.coverages, rules: table.rules, source: table.source, accuracy }),
    })
    void writeIssues((ruleConflicts ?? []).map(rc => ({ calculator_id: id, kind: 'rule', field: rc.field, opus_value: rc.opus, gemini_value: rc.gemini })))
    void logRun(id, { kind: 'rate_extract', model: 'claude-opus-4-8+gemini', ok: true, duration_ms: Date.now() - rateT0, output: { coverages: table.coverages.length, accuracy, rule_conflicts: ruleConflicts?.length ?? 0, source: table.source } })

    // 2) Coverage/benefit wordings (Level 2 comparison data) — best-effort, doesn't block approval
    // on its own but a calculator without any terms can't be usefully compared later.
    await progress('Extracting coverage terms', 4, 5)
    const benT0 = Date.now()
    const { terms, conflicts: termConflicts, error: benError } = await extractBenefitTerms(dump, brochureBase64, categoryPromptList, progress)
    if (terms) {
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
      void logRun(id, { kind: 'benefit_extract', model: 'claude-opus-4-8+gemini', ok: true, duration_ms: Date.now() - benT0, output: { terms: resolvedTerms.length, conflicts: termConflicts.length } })
    } else {
      void logRun(id, { kind: 'benefit_extract', ok: false, error: benError, duration_ms: Date.now() - benT0 })
    }

    // 3) Calculation logic (loadings/tier-selection/GST as the workbook's own formulas, not just a
    // flat lookup) — best-effort and non-blocking: a calculator with no translatable logic (the
    // common case, a plain rate grid) simply gets no pm_computation_rules row, and pm-calc.ts's
    // flat age-band lookup keeps pricing it exactly as before. Independent approval gate (§ decision).
    await progress('Reading calculation logic', 5, 5)
    const rulesT0 = Date.now()
    try {
      const { rules, source: excelShape, structurallyDisputed, error: rulesError } = await extractComputationRules(dump, brochureBase64)
      if (rules?.length) {
        await fetch(`${SB_URL}/rest/v1/pm_computation_rules?on_conflict=calculator_id`, {
          method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
          body: JSON.stringify({ calculator_id: id, source: excelShape, rules, status: 'draft' }),
        })
        if (structurallyDisputed) {
          void writeIssues([{ calculator_id: id, kind: 'computation_rule', note: 'Opus and Gemini produced different calculation-logic structures — review both readings before approving.' }])
        }
        void logRun(id, { kind: 'rules_extract', model: 'claude-opus-4-8+gemini', ok: true, duration_ms: Date.now() - rulesT0, output: { steps: rules.length, source: excelShape, disputed: structurallyDisputed } })
      } else {
        void logRun(id, { kind: 'rules_extract', ok: false, error: rulesError, duration_ms: Date.now() - rulesT0 })
      }
    } catch (e) {
      // Never fails the whole extraction — computation rules are a bonus on top of the rate table.
      void logRun(id, { kind: 'rules_extract', ok: false, error: String(e), duration_ms: Date.now() - rulesT0 })
    }

    await patch(id, { status: 'in_review' })
    void logActivity({ action: 'pm.calculator_extracted', resource_type: 'pm_calculator', resource_id: id, new_value: { coverages: table.coverages.length, terms: terms?.length ?? 0 } })
  } catch (e) {
    await fail(id, `Extraction failed: ${String(e)}`)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const calc = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=xlsx_path,brochure_path,insurer_name,insurer_id&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!calc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!calc.xlsx_path && !calc.brochure_path) return NextResponse.json({ error: 'Calculator has no uploaded xlsx or brochure' }, { status: 400 })

    await patch(id, { status: 'extracting', map_progress: { label: 'Starting…', step: 0, total: 5, at: new Date().toISOString() } })
    await clearIssues(id)

    const origin = new URL(req.url).origin
    waitUntil(runPipeline(id, calc, origin))

    return NextResponse.json({ ok: true, started: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
