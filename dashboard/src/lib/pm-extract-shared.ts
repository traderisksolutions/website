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

export type CalcRow = { xlsx_path: string | null; brochure_path: string | null; insurer_id: string | null; workbook_summary: unknown; pricing: unknown }

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
  return fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=xlsx_path,brochure_path,insurer_id,workbook_summary,pricing&limit=1`, { headers: sbH(), cache: 'no-store' })
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

/**
 * Sheet-batch planning for the rate stage. Even with pm_dump.py's caps, a workbook with several
 * dense rate sheets still puts the WHOLE dump (embedded as inline JSON text) into one AI call —
 * that alone can be enough to blow Vercel's free-plan ~60s ceiling on a large workbook. This
 * splits extraction so each AI call only ever sees the cells from a small group of sheets, never
 * the full dump — see extract/rate-plan and extract/rate/route.ts.
 */
type DumpSheet = { name: string }
type DumpShape = {
  sheets?: DumpSheet[]
  values?: Record<string, Record<string, unknown>>
  formulas?: Record<string, Record<string, unknown>>
  previews?: Record<string, unknown>
  validations?: Record<string, unknown>
  notes_text?: string
}

/** Groups sheets that actually carry data into batches capped at ~maxCellsPerBatch cells each
 *  (values + formulas combined). A single oversized sheet still gets its own solo batch — never
 *  dropped, just not merged with anything else. Order follows pm_dump.py's own priority order
 *  (rate-hinted sheets already sorted first), so the first batch is the one most likely to matter. */
export function planSheetBatches(dump: unknown, maxCellsPerBatch = 700): string[][] {
  const d = dump as DumpShape | null
  if (!d) return []
  const sized = (d.sheets ?? [])
    .map(s => ({ name: s.name, cells: Object.keys(d.values?.[s.name] ?? {}).length + Object.keys(d.formulas?.[s.name] ?? {}).length }))
    .filter(s => s.cells > 0)
  if (!sized.length) return []

  const batches: string[][] = []
  let current: string[] = []
  let currentCells = 0
  for (const s of sized) {
    if (current.length && currentCells + s.cells > maxCellsPerBatch) { batches.push(current); current = []; currentCells = 0 }
    current.push(s.name); currentCells += s.cells
  }
  if (current.length) batches.push(current)
  return batches
}

/** A dump narrowed to only the given sheet names — same shape, so it drops straight into the
 *  same extraction prompt as the full dump, just with far less inline JSON text per call. */
export function subDump(dump: unknown, sheetNames: string[]): unknown {
  const d = dump as DumpShape | null
  if (!d) return null
  const names = new Set(sheetNames)
  const pick = <T,>(obj: Record<string, T> | undefined) =>
    obj ? Object.fromEntries(Object.entries(obj).filter(([k]) => names.has(k))) : undefined
  return {
    sheets: (d.sheets ?? []).filter(s => names.has(s.name)),
    values: pick(d.values),
    formulas: pick(d.formulas),
    previews: pick(d.previews),
    validations: pick(d.validations),
    notes_text: d.notes_text,
  }
}
