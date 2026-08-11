/**
 * Pricing Matrix — shared plumbing for the STAGED extraction pipeline.
 *
 * Extraction used to be one big background job (dump → rates → benefits → rules, chained inside
 * a single `waitUntil`-backgrounded request). On Vercel's free (Hobby) plan, a serverless
 * function's real execution ceiling is ~60s regardless of a code-level `maxDuration` — `waitUntil`
 * extends how long work can continue AFTER the response is sent, but that extra time is capped by
 * the same plan limit, not the 300s the old route declared. Four sequential AI calls (rate
 * extract's Opus+Gemini+judge, benefit extract's Opus+Gemini, rules extract's shape-detect+
 * Opus+Gemini) reliably blew past that, which is why extraction was stalling — see
 * calculators/[id]/extract/{dump,rate,benefits,rules}/route.ts, called as four separate
 * synchronous requests (each comfortably under 60s on its own) instead of one long chain.
 *
 * The dump only needs to run ONCE — every later stage reads it back from
 * pm_calculators.workbook_summary (persisted by the dump stage) instead of re-invoking the Python
 * service, which also finally makes that column do what its (existing) UI reader always expected.
 */
import { SB_URL, sbH, signRead } from '@/lib/pm-storage'

export type CalcRow = { xlsx_path: string | null; brochure_path: string | null; insurer_id: string | null; workbook_summary: unknown }

export const patchCalc = (id: string, body: Record<string, unknown>) =>
  fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(body) })

export const logRun = (calculator_id: string, r: Record<string, unknown>) =>
  fetch(`${SB_URL}/rest/v1/pm_calculator_runs`, { method: 'POST', headers: sbH('return=minimal'), body: JSON.stringify({ calculator_id, ...r }) }).catch(() => {})

export const writeIssues = (rows: Record<string, unknown>[]) =>
  rows.length ? fetch(`${SB_URL}/rest/v1/pm_reconciliation_issues`, { method: 'POST', headers: sbH('return=minimal'), body: JSON.stringify(rows) }).catch(() => {}) : Promise.resolve()

/** Surfaced to the review page as the error banner when status lands back on 'draft'. */
export async function failExtraction(id: string, label: string, step: number, total: number): Promise<void> {
  await patchCalc(id, { status: 'draft', map_progress: { label, step, total, at: new Date().toISOString(), error: true } })
}

export async function loadCalc(id: string): Promise<CalcRow | null> {
  return fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=xlsx_path,brochure_path,insurer_id,workbook_summary&limit=1`, { headers: sbH(), cache: 'no-store' })
    .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
}

export async function fetchBrochureBase64(path: string | null): Promise<string | undefined> {
  if (!path) return undefined
  try {
    const url = await signRead(path)
    const res = await fetch(url)
    if (!res.ok) return undefined
    return Buffer.from(await res.arrayBuffer()).toString('base64')
  } catch { return undefined }
}
