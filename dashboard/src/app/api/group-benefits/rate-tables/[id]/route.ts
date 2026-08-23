/**
 * GET    /api/group-benefits/rate-tables/[id]  → full detail (table, plans, rates, benefits, conflicts)
 * PATCH  /api/group-benefits/rate-tables/[id]  → save human review edits + metadata
 *   body: { meta?, plans?, rates?, benefits? }  (arrays replace the candidate for this table)
 * DELETE /api/group-benefits/rate-tables/[id]
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { bandBounds }                from '@/lib/gb-extract'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}
async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const q = (p: string) => fetch(`${SB_URL}/rest/v1/${p}`, { headers: sbH(), cache: 'no-store' }).then(r => r.ok ? r.json() : [])
    const [table, plans, rates, benefits, coverage, judgeRun, runs] = await Promise.all([
      q(`gb_rate_tables?id=eq.${id}&limit=1`),
      q(`gb_plans?rate_table_id=eq.${id}&select=*&order=product_code,plan_code`),
      q(`gb_rates?rate_table_id=eq.${id}&select=*&order=product_code,member_type,plan_code,age_min`),
      q(`gb_benefits?rate_table_id=eq.${id}&select=*&order=product_code,sort_order,id`),
      q(`gb_coverage?rate_table_id=eq.${id}&select=*&order=product_title,member_type,sort_order`),
      q(`gb_extraction_runs?rate_table_id=eq.${id}&extractor=eq.judge&select=conflicts,confidence,raw_json,created_at&order=created_at.desc&limit=1`),
      q(`gb_extraction_runs?rate_table_id=eq.${id}&extractor=in.(opus,gemini,parser)&select=extractor,error,raw_json,created_at&order=created_at.desc`),
    ])
    const t = Array.isArray(table) ? table[0] : null
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Latest status per extractor (errors + rough cell counts) for the review banner.
    const extractors: Record<string, { error: string | null; rates: number }> = {}
    for (const r of (Array.isArray(runs) ? runs : []) as { extractor: string; error: string | null; raw_json: unknown }[]) {
      if (extractors[r.extractor]) continue
      const rj = r.raw_json as { pricing?: unknown[]; rows?: unknown[] } | null
      const cells = r.extractor === 'parser' ? (rj?.rows?.length ?? 0) : (rj?.pricing?.length ?? 0)
      extractors[r.extractor] = { error: r.error ?? null, rates: cells }
    }
    const judgeRaw = judgeRun?.[0]?.raw_json as { wording_diff?: unknown[] } | null
    return NextResponse.json({ table: t, plans, rates, benefits, coverage, conflicts: judgeRun?.[0]?.conflicts ?? [], wordingDiff: judgeRaw?.wording_diff ?? [], confidence: judgeRun?.[0]?.confidence ?? null, extractors })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

type RateIn    = { product_code: string; member_type?: string | null; plan_code: string; band_label: string; age_min: number | null; age_max: number | null; premium: number; renewal_only?: boolean }
type PlanIn    = { product_code: string; plan_code: string; plan_name?: string | null; hospital_type?: string | null; beds?: string | null; co_payment?: string | null; renewal_only?: boolean }
type BenefitIn = { product_code: string; plan_code?: string | null; category?: string | null; benefit_name: string; value_text?: string | null; value_numeric?: number | null; unit?: string | null; notes?: string | null }
type CoverageIn = { product_title?: string | null; member_type?: string | null; plan_code?: string | null; item_label: string; value_numeric?: number | null; value_text?: string | null; unit?: string | null }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const body = await req.json() as {
      meta?: Record<string, unknown>
      plans?: PlanIn[]; rates?: RateIn[]; benefits?: BenefitIn[]; coverage?: CoverageIn[]
    }

    if (body.meta && Object.keys(body.meta).length) {
      await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ ...body.meta, updated_at: new Date().toISOString() }) })
    }
    // Arrays fully replace the candidate rows for this table (the review grid sends the
    // whole edited set).
    if (Array.isArray(body.rates)) {
      // Re-derive age bounds + renewal flag from the (possibly edited) band label, and drop
      // duplicate (product, plan, band) rows so the bulk insert can't fail on the constraint.
      const seen = new Set<string>()
      const rows = body.rates
        .filter(r => r.plan_code && r.band_label && r.premium != null)
        .map(r => { const b = bandBounds(r.band_label); return { rate_table_id: id, ...r, age_min: b.age_min, age_max: b.age_max, renewal_only: b.renewal_only } })
        .filter(r => { const k = `${r.product_code}|${r.member_type ?? ''}|${r.plan_code}|${r.band_label}`; if (seen.has(k)) return false; seen.add(k); return true })
      await fetch(`${SB_URL}/rest/v1/gb_rates?rate_table_id=eq.${id}`, { method: 'DELETE', headers: sbH() })
      if (rows.length) {
        const ins = await fetch(`${SB_URL}/rest/v1/gb_rates`, { method: 'POST', headers: sbH(), body: JSON.stringify(rows) })
        if (!ins.ok) return NextResponse.json({ error: `Failed to save rates: ${(await ins.text()).slice(0, 200)}` }, { status: 500 })
      }
    }
    if (Array.isArray(body.plans)) {
      await fetch(`${SB_URL}/rest/v1/gb_plans?rate_table_id=eq.${id}`, { method: 'DELETE', headers: sbH() })
      const rows = body.plans.filter(p => p.plan_code).map(p => ({ rate_table_id: id, ...p }))
      if (rows.length) await fetch(`${SB_URL}/rest/v1/gb_plans`, { method: 'POST', headers: sbH(), body: JSON.stringify(rows) })
    }
    if (Array.isArray(body.coverage)) {
      await fetch(`${SB_URL}/rest/v1/gb_coverage?rate_table_id=eq.${id}`, { method: 'DELETE', headers: sbH() })
      const rows = body.coverage.filter(c => c.item_label).map((c, i) => ({ rate_table_id: id, sort_order: i, product_title: c.product_title ?? null, member_type: c.member_type ?? null, plan_code: c.plan_code ?? null, item_label: c.item_label, value_numeric: c.value_numeric ?? null, value_text: c.value_text ?? null, unit: c.unit ?? null }))
      if (rows.length) await fetch(`${SB_URL}/rest/v1/gb_coverage`, { method: 'POST', headers: sbH(), body: JSON.stringify(rows) })
    }
    if (Array.isArray(body.benefits)) {
      await fetch(`${SB_URL}/rest/v1/gb_benefits?rate_table_id=eq.${id}`, { method: 'DELETE', headers: sbH() })
      const rows = body.benefits.filter(b => b.benefit_name).map((b, i) => ({ rate_table_id: id, sort_order: i, ...b }))
      if (rows.length) await fetch(`${SB_URL}/rest/v1/gb_benefits`, { method: 'POST', headers: sbH(), body: JSON.stringify(rows) })
    }
    void logActivity({ action: 'gb.review_saved', resource_type: 'gb_rate_table', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'DELETE', headers: sbH() })
    void logActivity({ action: 'gb.rate_table_deleted', resource_type: 'gb_rate_table', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
