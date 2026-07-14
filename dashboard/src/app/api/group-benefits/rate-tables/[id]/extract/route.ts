/**
 * POST /api/group-benefits/rate-tables/[id]/extract
 * Runs the 3 extractors (Opus + Gemini + code parser) + Opus judge on the uploaded PDF,
 * stores each run for audit, writes the merged candidate into gb_plans/gb_rates/gb_benefits,
 * and moves the table to `in_review`. Idempotent — re-running replaces the candidate.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import {
  extractWithOpus, extractWithGemini, parseRatesFromText, judgeExtractions,
  adjudicateWithOpus, conflictKey, type GbExtraction,
} from '@/lib/gb-extract'

export const maxDuration = 300

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}
const storageKey = () => ({ apikey: process.env.SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY!}` })

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // 1. Load the table + PDF.
    const tRes = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}&select=*&limit=1`, { headers: sbH(), cache: 'no-store' })
    const table = tRes.ok ? (await tRes.json())[0] : null
    if (!table?.source_pdf_url) return NextResponse.json({ error: 'Rate table or PDF not found' }, { status: 404 })

    const pdfRes = await fetch(table.source_pdf_url, { headers: storageKey(), cache: 'no-store' })
    if (!pdfRes.ok) return NextResponse.json({ error: 'Could not download PDF' }, { status: 502 })
    const buf = Buffer.from(await pdfRes.arrayBuffer())
    const b64 = buf.toString('base64')

    await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'extracting' }) })

    const profileHint = `Expected primary product: ${table.product_code}${table.product_name ? ` (${table.product_name})` : ''}. Insurer: ${table.insurer_name ?? 'unknown'}.`

    // 2. Three extractors (LLMs in parallel; parser is local).
    let parserRows: ReturnType<typeof parseRatesFromText> = []
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(buf) })
      const parsed = await parser.getText()
      await parser.destroy().catch(() => {})
      parserRows = parseRatesFromText(parsed?.text ?? '')
    } catch { /* parser is best-effort — degrade to LLM-only cross-check */ }

    const [opus, gemini] = await Promise.all([
      extractWithOpus(b64, profileHint),
      extractWithGemini(b64, profileHint),
    ])

    // 3. Reconcile + Opus adjudication of disputed cells.
    const judged = await judgeExtractions(opus.data, gemini.data, parserRows)
    const adjud = await adjudicateWithOpus(b64, judged.conflicts)

    // Apply Opus's re-read where it's confident, and annotate each conflict with the verdict.
    const merged: GbExtraction = judged.merged
    for (const p of merged.products) {
      for (const rt of p.rates ?? []) {
        const a = adjud[conflictKey({ product_code: p.product_code, plan_code: rt.plan_code, band_label: rt.band_label })]
        if (a && a.premium != null && a.confidence >= 70) rt.premium = a.premium
      }
    }
    const conflictsOut = judged.conflicts.map(c => ({ ...c, judge: adjud[conflictKey(c)] ?? null }))

    // 4. Record every run for audit.
    const runs = [
      { extractor: 'opus',   model: 'claude-opus-4-8',      raw_json: opus.data,   error: opus.error ?? null },
      { extractor: 'gemini', model: 'gemini-3.1-flash-lite', raw_json: gemini.data, error: gemini.error ?? null },
      { extractor: 'parser', model: 'pdf-parse',            raw_json: { rows: parserRows }, error: null },
      { extractor: 'judge',  model: 'claude-opus-4-8',      raw_json: merged, conflicts: conflictsOut, confidence: judged.confidence, error: null },
    ]
    await fetch(`${SB_URL}/rest/v1/gb_extraction_runs`, { method: 'POST', headers: sbH(), body: JSON.stringify(runs.map(r => ({ rate_table_id: id, ...r }))) }).catch(() => {})

    // 5. Replace the candidate rows.
    for (const tbl of ['gb_plans', 'gb_rates', 'gb_benefits']) {
      await fetch(`${SB_URL}/rest/v1/${tbl}?rate_table_id=eq.${id}`, { method: 'DELETE', headers: sbH() }).catch(() => {})
    }
    const plans: unknown[] = [], rates: unknown[] = [], benefits: unknown[] = []
    for (const p of merged.products) {
      const seenPlan = new Set<string>()
      for (const pl of p.plans ?? []) {
        if (seenPlan.has(pl.plan_code)) continue; seenPlan.add(pl.plan_code)
        plans.push({ rate_table_id: id, product_code: p.product_code, plan_code: pl.plan_code, plan_name: pl.plan_name ?? null, hospital_type: pl.hospital_type ?? null, beds: pl.beds ?? null, co_payment: pl.co_payment ?? null, renewal_only: !!pl.renewal_only })
      }
      const seenRate = new Set<string>()
      for (const rt of p.rates ?? []) {
        const kk = `${rt.plan_code}|${rt.band_label}`
        if (seenRate.has(kk) || rt.premium == null) continue; seenRate.add(kk)
        rates.push({ rate_table_id: id, product_code: p.product_code, plan_code: rt.plan_code, band_label: rt.band_label, age_min: rt.age_min ?? null, age_max: rt.age_max ?? null, premium: rt.premium, renewal_only: !!rt.renewal_only })
      }
      for (const b of p.benefits ?? []) {
        benefits.push({ rate_table_id: id, product_code: p.product_code, plan_code: b.plan_code ?? null, category: b.category ?? null, benefit_name: b.benefit_name, value_text: b.value_text ?? null, value_numeric: b.value_numeric ?? null, unit: b.unit ?? null, notes: b.notes ?? null })
      }
    }
    if (plans.length)    await fetch(`${SB_URL}/rest/v1/gb_plans`,    { method: 'POST', headers: sbH(), body: JSON.stringify(plans) }).catch(() => {})
    if (rates.length)    await fetch(`${SB_URL}/rest/v1/gb_rates`,    { method: 'POST', headers: sbH(), body: JSON.stringify(rates) }).catch(() => {})
    if (benefits.length) await fetch(`${SB_URL}/rest/v1/gb_benefits`, { method: 'POST', headers: sbH(), body: JSON.stringify(benefits) }).catch(() => {})

    await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'in_review', updated_at: new Date().toISOString() }) })

    void logActivity({ action: 'gb.extracted', resource_type: 'gb_rate_table', resource_id: id, new_value: { rates: rates.length, conflicts: conflictsOut.length, confidence: judged.confidence } })
    return NextResponse.json({ ok: true, rates: rates.length, plans: plans.length, benefits: benefits.length, conflicts: conflictsOut.length, confidence: judged.confidence, errors: { opus: opus.error ?? null, gemini: gemini.error ?? null } })
  } catch (e) {
    await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'draft' }) }).catch(() => {})
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
