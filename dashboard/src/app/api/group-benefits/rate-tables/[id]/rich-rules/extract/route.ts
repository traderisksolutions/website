/**
 * POST /api/group-benefits/rate-tables/[id]/rich-rules/extract
 * Sales Loop v2, Phase 6d. Optional, additive — runs ALONGSIDE the existing mechanical
 * "Analyze calculator" (AppliedRules) path, never replaces it. Reuses the already-uploaded
 * calculator xlsx (calculator_path, set by the existing calculator/route.ts upload) and the
 * rate table's own brochure PDF (source_pdf_url), calls the same Python analyzer for its raw
 * (now capped) cell dump, then reuses Pricing Matrix's extractComputationRules verbatim — the
 * RuleStep vocabulary and its Opus+Gemini extraction are generic, not PM-specific; only the
 * INTERPRETER that later executes an approved rule set is GB's own (gb-compute-rules.ts), since
 * that has to read GB's flat RateRow[] rather than PM's nested RateTable.
 *
 * Always writes status='draft' — see the [id]/rich-rules/route.ts PATCH for the required
 * verification-before-approval step (a real premium diff against AppliedRules, not just a
 * reviewer's say-so).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { extractComputationRules }   from '@/lib/pm-rules-extract'

export const maxDuration = 120

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const BUCKET = 'group-benefits'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}
const storageKey = () => ({ apikey: process.env.SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY!}` })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const table = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}&select=calculator_path,source_pdf_url&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!table?.calculator_path) return NextResponse.json({ error: 'Upload and analyze the insurer’s Excel calculator first (Calculator tab) — rich rule extraction reads the same file.' }, { status: 400 })

    const signRes = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${table.calculator_path}`, {
      method: 'POST', headers: sbH(), body: JSON.stringify({ expiresIn: 300 }),
    })
    if (!signRes.ok) return NextResponse.json({ error: 'Could not sign the calculator file' }, { status: 502 })
    const signed = (await signRes.json() as { signedURL?: string }).signedURL
    const xlsx_url = `${SB_URL}/storage/v1${signed}`

    const origin = new URL(req.url).origin
    const pyRes = await fetch(`${origin}/api/analyze_xlsx`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xlsx_url }),
    })
    const analysis = await pyRes.json().catch(() => ({ error: 'analyzer returned non-JSON' }))
    if (!pyRes.ok || analysis.error) return NextResponse.json({ error: `Could not read the calculator: ${analysis.error ?? pyRes.status}` }, { status: 502 })
    const dump = analysis.rich_dump
    if (!dump) return NextResponse.json({ error: 'Analyzer did not return a workbook dump' }, { status: 502 })

    let brochureBase64: string | undefined
    if (table.source_pdf_url) {
      const pdfRes = await fetch(table.source_pdf_url, { headers: storageKey(), cache: 'no-store' }).catch(() => null)
      if (pdfRes?.ok) brochureBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString('base64')
    }

    const { rules, source, structurallyDisputed, error } = await extractComputationRules(dump, brochureBase64)
    if (!rules?.length) return NextResponse.json({ error: error ?? 'No richer calculation logic found — this calculator may be a plain rate grid, which the existing rules already handle fine.' }, { status: 502 })

    await fetch(`${SB_URL}/rest/v1/gb_computation_rules?on_conflict=rate_table_id`, {
      method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
      body: JSON.stringify({ rate_table_id: id, source, rules, status: 'draft', verification: null, reviewed_by: null, reviewed_at: null }),
    })
    void logActivity({ action: 'gb.rich_rules_extracted', resource_type: 'gb_rate_table', resource_id: id, new_value: { steps: rules.length, source, structurallyDisputed } })
    return NextResponse.json({ ok: true, rules, source, structurallyDisputed })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
