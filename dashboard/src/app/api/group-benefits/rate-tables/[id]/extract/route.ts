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

    // Live progress stage for the review UI's step checklist. Tolerant of the extract_stage
    // column not existing yet (falls back to just setting status) so it never blocks the flow.
    const setStage = async (stage: string | null) => {
      const r = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'extracting', extract_stage: stage }) }).catch(() => null)
      if (!r || !r.ok) await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'extracting' }) }).catch(() => {})
    }
    await setStage('reading')

    const pdfRes = await fetch(table.source_pdf_url, { headers: storageKey(), cache: 'no-store' })
    if (!pdfRes.ok) return NextResponse.json({ error: 'Could not download PDF' }, { status: 502 })
    const buf = Buffer.from(await pdfRes.arrayBuffer())
    const b64 = buf.toString('base64')

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

    await setStage('extracting')
    const [opus, gemini] = await Promise.all([
      extractWithOpus(b64, profileHint),
      extractWithGemini(b64, profileHint),
    ])

    // 3. Reconcile + Opus adjudication. Only re-read the PDF for cells where Opus and Gemini
    //    genuinely DISAGREE (or only one found) — not the parser-unconfirmed ones, which on an
    //    image PDF would be hundreds and make this stage crawl.
    await setStage('judging')
    const judged = await judgeExtractions(opus.data, gemini.data, parserRows)
    const disputed = judged.conflicts.filter(c => c.note === 'Opus and Gemini disagree').slice(0, 60)
    const adjud = disputed.length ? await adjudicateWithOpus(b64, disputed) : {}

    // Apply Opus's re-read where it's confident, and annotate each conflict with the verdict.
    const merged: GbExtraction = judged.merged
    for (const r of merged.pricing) {
      const a = adjud[conflictKey(r)]
      if (a && a.price != null && a.confidence >= 70) r.price = a.price
    }
    const conflictsOut = judged.conflicts.map(c => ({ ...c, judge: adjud[conflictKey(c)] ?? null }))

    await setStage('saving')
    // 4. Record every run for audit.
    const runs = [
      { extractor: 'opus',   model: 'claude-opus-4-8',      raw_json: opus.data,   error: opus.error ?? null },
      { extractor: 'gemini', model: 'gemini-3.1-flash-lite', raw_json: gemini.data, error: gemini.error ?? null },
      { extractor: 'parser', model: 'pdf-parse',            raw_json: { rows: parserRows }, error: null },
      { extractor: 'judge',  model: 'claude-opus-4-8',      raw_json: merged, conflicts: conflictsOut, confidence: judged.confidence, error: null },
    ]
    await fetch(`${SB_URL}/rest/v1/gb_extraction_runs`, { method: 'POST', headers: sbH(), body: JSON.stringify(runs.map(r => ({ rate_table_id: id, ...r }))) }).catch(() => {})

    // Resolve insurer + effective date first (denormalised onto each price row).
    const insurerName: string | null = merged.insurer_name ?? table.insurer_name ?? null
    let insurerId: string | null = table.insurer_id ?? null
    if (!insurerId && insurerName) {
      insurerId = await fetch(`${SB_URL}/rest/v1/insurers?name=ilike.${encodeURIComponent('%' + insurerName + '%')}&select=id&limit=1`, { headers: sbH(), cache: 'no-store' })
        .then(r => (r.ok ? r.json() : [])).then(rows => (Array.isArray(rows) ? rows[0]?.id : null) ?? null).catch(() => null)
    }
    const effDate = (merged.effective_date && /^\d{4}-\d{2}-\d{2}$/.test(merged.effective_date)) ? merged.effective_date : (table.effective_date ?? null)

    // 5. Replace the candidate rows (pricing → gb_rates, coverage → gb_coverage, etc.).
    for (const tbl of ['gb_plans', 'gb_rates', 'gb_benefits', 'gb_coverage']) {
      await fetch(`${SB_URL}/rest/v1/${tbl}?rate_table_id=eq.${id}`, { method: 'DELETE', headers: sbH() }).catch(() => {})
    }

    const seenRate = new Set<string>()
    const rates = (merged.pricing ?? []).filter(r => r.plan_code && r.band_label && r.price != null).filter(r => {
      const k = `${r.product_title}|${r.member_type ?? ''}|${r.plan_code}|${r.band_label}`
      if (seenRate.has(k)) return false; seenRate.add(k); return true
    }).map(r => ({
      rate_table_id: id, insurer_id: insurerId, insurer_name: insurerName, effective_date: effDate,
      product_code: r.product_title, member_type: r.member_type ?? null, plan_code: r.plan_code,
      band_label: r.band_label, age_min: r.age_min ?? null, age_max: r.age_max ?? null,
      premium: r.price, dimensions: r.dimensions ?? {},
    }))

    const seenPlan = new Set<string>()
    const plans = (merged.plans ?? []).filter(p => p.plan_code).filter(p => {
      const k = `${p.product_title}|${p.plan_code}`; if (seenPlan.has(k)) return false; seenPlan.add(k); return true
    }).map(p => ({ rate_table_id: id, product_code: p.product_title, plan_code: p.plan_code, plan_name: p.plan_name ?? null, hospital_type: p.hospital_type ?? null, beds: p.beds ?? null, co_payment: p.co_payment ?? null }))

    const benefits = (merged.benefits ?? []).filter(b => b.benefit_name).map(b => ({ rate_table_id: id, product_code: b.product_title ?? '', plan_code: b.plan_code ?? null, category: b.category ?? null, benefit_name: b.benefit_name, value_text: b.value_text ?? null, value_numeric: b.value_numeric ?? null, unit: b.unit ?? null, notes: b.notes ?? null }))

    const coverage = (merged.coverage ?? []).filter(c => c.item_label).map((c, i) => ({ rate_table_id: id, product_title: c.product_title, member_type: c.member_type ?? null, plan_code: c.plan_code ?? null, item_label: c.item_label, value_numeric: c.value_numeric ?? null, value_text: c.value_text ?? null, unit: c.unit ?? null, sort_order: i }))

    if (plans.length)    await fetch(`${SB_URL}/rest/v1/gb_plans`,    { method: 'POST', headers: sbH(), body: JSON.stringify(plans) }).catch(() => {})
    if (rates.length)    await fetch(`${SB_URL}/rest/v1/gb_rates`,    { method: 'POST', headers: sbH(), body: JSON.stringify(rates) }).catch(() => {})
    if (benefits.length) await fetch(`${SB_URL}/rest/v1/gb_benefits`, { method: 'POST', headers: sbH(), body: JSON.stringify(benefits) }).catch(() => {})
    if (coverage.length) await fetch(`${SB_URL}/rest/v1/gb_coverage`, { method: 'POST', headers: sbH(), body: JSON.stringify(coverage) }).catch(() => {})

    // Write back the table metadata read from the PDF (reviewer can correct). product_code
    // becomes the distinct product titles found (display only; per-row product lives on rates).
    const productTitles = Array.from(new Set((merged.pricing ?? []).map(r => r.product_title).filter(Boolean)))
    const meta: Record<string, unknown> = { status: 'in_review', updated_at: new Date().toISOString() }
    if (insurerName)              meta.insurer_name = insurerName
    if (insurerId)                meta.insurer_id   = insurerId
    if (productTitles.length)     meta.product_code = productTitles.join(' · ')
    if (merged.age_basis)         meta.age_basis    = merged.age_basis
    if (typeof merged.plan_year === 'number') meta.plan_year = merged.plan_year
    if (effDate)                  meta.effective_date = effDate
    await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify(meta) })
    // Clear the progress stage (best-effort — column may not exist yet).
    await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ extract_stage: null }) }).catch(() => {})

    void logActivity({ action: 'gb.extracted', resource_type: 'gb_rate_table', resource_id: id, new_value: { rates: rates.length, conflicts: conflictsOut.length, confidence: judged.confidence } })
    return NextResponse.json({ ok: true, rates: rates.length, plans: plans.length, benefits: benefits.length, conflicts: conflictsOut.length, confidence: judged.confidence, errors: { opus: opus.error ?? null, gemini: gemini.error ?? null } })
  } catch (e) {
    await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'draft' }) }).catch(() => {})
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
