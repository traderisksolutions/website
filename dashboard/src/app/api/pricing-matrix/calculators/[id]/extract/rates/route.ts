/**
 * POST /api/pricing-matrix/calculators/[id]/extract/rates
 *
 * Phase 1 of 2 (see extract/terms/route.ts for phase 2). Split out of a single /extract call that
 * could exceed the platform's actual serverless function timeout on a slow/complex workbook —
 * running the rate extraction and the benefit-terms extraction as two separate requests roughly
 * halves what any one request has to finish within, since each is a genuinely independent AI pass
 * (Opus + Gemini, cross-checked). The client calls this, then POST .../extract/terms, in sequence
 * — see runExtract() in pricing-matrix/[id]/page.tsx.
 *
 * Clears prior reconciliation issues (fresh start on every Re-extract, same as before the split),
 * dumps the xlsx (mechanical, no AI) + reads the brochure PDF, then extracts the rate table.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, signRead }     from '@/lib/pm-storage'
import { extractRateTable }          from '@/lib/pm-rates-extract'

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
    await clearIssues(id)
    await progress('Reading the workbook', 1, 5)

    // Mechanical xlsx dump (Python, no AI) — best-effort, extraction still proceeds on the
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

    await progress('Extracting rate tables', 2, 5)
    const rateT0 = Date.now()
    const { table, accuracy, ruleConflicts, error: rateError } = await extractRateTable(dump, brochureBase64, progress)

    if (!table) {
      await patch(id, { status: 'draft' })
      void logRun(id, { kind: 'rate_extract', ok: false, error: rateError, duration_ms: Date.now() - rateT0 })
      return NextResponse.json({ error: `Rate extraction failed: ${rateError ?? 'unknown error'}` }, { status: 502 })
    }

    // Dollar-value rate conflicts are already auto-adjudicated by the Opus judge inside
    // extractRateTable; only the rule-level conflicts (age basis / GST / loading bands, which have
    // no automatic judge pass) need a human decision — persisted as pm_reconciliation_issues rows.
    await fetch(`${SB_URL}/rest/v1/pm_rate_tables?on_conflict=calculator_id`, {
      method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
      body: JSON.stringify({ calculator_id: id, age_basis: table.age_basis, coverages: table.coverages, rules: table.rules, accuracy }),
    })
    void writeIssues((ruleConflicts ?? []).map(rc => ({ calculator_id: id, kind: 'rule', field: rc.field, opus_value: rc.opus, gemini_value: rc.gemini })))
    void logRun(id, { kind: 'rate_extract', model: 'claude-opus-4-8+gemini', ok: true, duration_ms: Date.now() - rateT0, output: { coverages: table.coverages.length, accuracy, rule_conflicts: ruleConflicts?.length ?? 0 } })

    await progress('Rate tables done — extracting coverage terms next', 3, 5)
    return NextResponse.json({ ok: true })
  } catch (e) {
    await patch(id, { status: 'draft' }).catch(() => {})
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
