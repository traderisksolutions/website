/**
 * The annual benefit-schedule scan for one insurer rate table.
 *
 *   GET    → the candidates waiting on a person, with what is live for each line beside them
 *   POST   → read the brochure onto the canon and replace this table's candidates
 *   PATCH  → accept or reject candidates; accepted rows are copied into gb_benefits
 *
 * Nothing a scan produces reaches a quotation until somebody accepts it. The three tables on
 * record are all approved and quoting today, so a scan that wrote straight through would change
 * what a client is quoted the moment a model finished reading a PDF.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/log-activity'
import { extractSchedule } from '@/lib/gb/ingest'
import { resolveProduct } from '@/lib/gb/resolve'
import { BENEFIT_BY_CODE } from '@/lib/gb/canon'
import { loadDocument } from '@/lib/gb/documents'

export const maxDuration = 300

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}
const storageH = () => ({ apikey: process.env.SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY!}` })

type Table = {
  id: string; insurer_name: string | null; product_code: string; product_name: string | null
  plan_year: number | null; source_pdf_url: string | null; source_pdf_name: string | null
  schedule_status: string; schedule_scanned_at: string | null; schedule_notes: string | null
  schedule_unmatched: unknown
}
type Candidate = {
  id: string; product_code: string; plan_code: string | null; canon_benefit: string
  value_text: string; value_numeric: number | null; source: string | null
  current_text: string | null; status: string
}

async function me() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
async function loadTable(id: string): Promise<Table | null> {
  const res = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}` +
    `&select=id,insurer_name,product_code,product_name,plan_year,source_pdf_url,source_pdf_name,` +
    `schedule_status,schedule_scanned_at,schedule_notes,schedule_unmatched&limit=1`,
    { headers: sbH(), cache: 'no-store' })
  return res.ok ? (await res.json() as Table[])[0] ?? null : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!await me()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const table = await loadTable(id)
    if (!table) return NextResponse.json({ error: 'Rate table not found' }, { status: 404 })
    const res = await fetch(`${SB_URL}/rest/v1/gb_benefit_candidates?rate_table_id=eq.${id}` +
      `&select=id,product_code,plan_code,canon_benefit,value_text,value_numeric,source,current_text,status` +
      `&order=product_code,canon_benefit,plan_code&limit=2000`, { headers: sbH(), cache: 'no-store' })
    const candidates = res.ok ? await res.json() as Candidate[] : []
    return NextResponse.json({
      table: {
        id: table.id, insurerName: table.insurer_name, planYear: table.plan_year,
        pdfName: table.source_pdf_name, status: table.schedule_status,
        scannedAt: table.schedule_scanned_at, notes: table.schedule_notes,
        unmatched: table.schedule_unmatched ?? [],
      },
      candidates: candidates.map(c => ({ ...c, benefitName: BENEFIT_BY_CODE[c.canon_benefit]?.name ?? c.canon_benefit })),
      pending: candidates.filter(c => c.status === 'pending').length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const table = await loadTable(id)
    if (!table) return NextResponse.json({ error: 'Rate table not found' }, { status: 404 })

    // Which canonical products this table covers, and which plan tiers are already on record —
    // both go into the prompt, so the scan fills named slots rather than inventing a shape.
    const productCodes = resolveProduct(table.product_code).codes
    if (!productCodes.length) {
      return NextResponse.json({ error: `"${table.product_code}" maps to no canonical product. Map the label first.` }, { status: 400 })
    }
    const plansRes = await fetch(`${SB_URL}/rest/v1/gb_plans?rate_table_id=eq.${id}&select=plan_code,canon_codes&limit=500`,
      { headers: sbH(), cache: 'no-store' })
    const planRows = plansRes.ok ? await plansRes.json() as { plan_code: string; canon_codes: string[] | null }[] : []
    const planCodes: Record<string, string[]> = {}
    for (const pc of productCodes) {
      planCodes[pc] = Array.from(new Set(planRows
        .filter(p => !p.canon_codes?.length || p.canon_codes.includes(pc))
        .map(p => p.plan_code)))
    }

    const setStatus = (s: string, extra: Record<string, unknown> = {}) =>
      fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(),
        body: JSON.stringify({ schedule_status: s, ...extra }) }).catch(() => {})
    await setStatus('scanning')

    // gb_documents, not source_pdf_url: those URLs all point at the Supabase bucket retired in
    // September, which answers every object path with the string "trs api" rather than a 404.
    // The URL is still tried as a fallback so a restored bucket would work without a change here.
    let b64 = (await loadDocument(id, 'brochure'))?.base64 ?? null
    if (!b64 && table.source_pdf_url) {
      const pdfRes = await fetch(table.source_pdf_url, { headers: storageH(), cache: 'no-store' }).catch(() => null)
      const buf = pdfRes?.ok ? Buffer.from(await pdfRes.arrayBuffer()) : null
      // Anything that small is the catch-all string, not a PDF.
      if (buf && buf.length > 1024 && buf.subarray(0, 4).toString() === '%PDF') b64 = buf.toString('base64')
    }
    if (!b64) {
      await setStatus('failed', { schedule_notes: 'No brochure on file for this table.' })
      return NextResponse.json({ error: 'No brochure on file for this table. Upload one first.' }, { status: 400 })
    }

    const out = await extractSchedule(b64, { insurerName: table.insurer_name ?? 'this insurer', productCodes, planCodes })
    if (out.error && !out.rows.length) {
      await setStatus('failed', { schedule_notes: out.error })
      return NextResponse.json({ error: out.error }, { status: 502 })
    }

    // What is live now, so the reviewer compares against a fixed point rather than a moving one.
    const liveRes = await fetch(`${SB_URL}/rest/v1/gb_benefits?rate_table_id=eq.${id}` +
      `&select=plan_code,canon_benefit,value_text&limit=5000`, { headers: sbH(), cache: 'no-store' })
    const live = liveRes.ok ? await liveRes.json() as { plan_code: string | null; canon_benefit: string | null; value_text: string | null }[] : []
    const liveBy = new Map(live.filter(l => l.canon_benefit).map(l => [`${l.canon_benefit}|${l.plan_code ?? ''}`, l.value_text]))

    // A re-scan replaces this table's candidates; accumulating two years of them would make the
    // review list meaningless.
    await fetch(`${SB_URL}/rest/v1/gb_benefit_candidates?rate_table_id=eq.${id}`, { method: 'DELETE', headers: sbH() }).catch(() => {})

    const rows = out.rows.map(r => ({
      rate_table_id: id, product_code: r.product_code, plan_code: r.plan_code,
      canon_benefit: r.canon_benefit, value_text: r.value_text, value_numeric: r.value_numeric,
      source: r.source, current_text: liveBy.get(`${r.canon_benefit}|${r.plan_code ?? ''}`) ?? null,
      status: 'pending',
    }))
    if (rows.length) {
      const ins = await fetch(`${SB_URL}/rest/v1/gb_benefit_candidates?on_conflict=rate_table_id,product_code,canon_benefit,plan_code`,
        { method: 'POST', headers: sbH('resolution=merge-duplicates,return=minimal'), body: JSON.stringify(rows) })
      if (!ins.ok) {
        await setStatus('failed')
        return NextResponse.json({ error: (await ins.text()).slice(0, 300) }, { status: 500 })
      }
    }
    await setStatus(rows.length ? 'in_review' : 'failed', {
      schedule_scanned_at: new Date().toISOString(), schedule_model: out.model,
      schedule_notes: out.notes ?? out.error ?? null, schedule_unmatched: out.unmatched,
    })
    void logActivity({ action: 'gb.schedule_scanned', resource_type: 'gb_rate_table', resource_id: id,
                       new_value: { rows: rows.length, unmatched: out.unmatched.length, model: out.model } })
    return NextResponse.json({ scanned: rows.length, unmatched: out.unmatched, notes: out.notes, model: out.model })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

/** Accept or reject candidates. Accepted rows are copied into gb_benefits and go live. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const { decision, candidateIds } = await req.json() as
      { decision?: 'accepted' | 'rejected'; candidateIds?: string[] }
    if (decision !== 'accepted' && decision !== 'rejected') {
      return NextResponse.json({ error: "decision must be 'accepted' or 'rejected'" }, { status: 400 })
    }

    // No list means every pending candidate on this table — the common case, accepting a scan
    // the reviewer has read through.
    const filter = candidateIds?.length
      ? `id=in.(${candidateIds.map(c => `"${c}"`).join(',')})`
      : `rate_table_id=eq.${id}&status=eq.pending`
    const res = await fetch(`${SB_URL}/rest/v1/gb_benefit_candidates?${filter}` +
      `&select=id,product_code,plan_code,canon_benefit,value_text,value_numeric,source&limit=2000`,
      { headers: sbH(), cache: 'no-store' })
    const picked = res.ok ? await res.json() as Candidate[] : []
    if (!picked.length) return NextResponse.json({ error: 'Nothing to decide' }, { status: 400 })

    if (decision === 'accepted') {
      // gb_benefits has no unique key on (table, canon_benefit, plan), so an accepted line
      // replaces its predecessor by deletion first — otherwise the comparison would read two
      // values for one line and take whichever came back first.
      for (const c of picked) {
        const planFilter = c.plan_code == null ? 'plan_code=is.null' : `plan_code=eq.${encodeURIComponent(c.plan_code)}`
        await fetch(`${SB_URL}/rest/v1/gb_benefits?rate_table_id=eq.${id}` +
          `&canon_benefit=eq.${c.canon_benefit}&${planFilter}`, { method: 'DELETE', headers: sbH() }).catch(() => {})
      }
      const canon = (code: string) => BENEFIT_BY_CODE[code]
      const ins = await fetch(`${SB_URL}/rest/v1/gb_benefits`, {
        method: 'POST', headers: sbH(),
        body: JSON.stringify(picked.map(c => ({
          rate_table_id: id,
          // The printed product label stays as extracted elsewhere; what matters for comparison
          // is canon_benefit and canon_codes, which are set from the canon, not from wording.
          product_code: c.product_code,
          plan_code: c.plan_code,
          category: canon(c.canon_benefit)?.productCode ?? null,
          benefit_name: canon(c.canon_benefit)?.name ?? c.canon_benefit,
          value_text: c.value_text,
          value_numeric: c.value_numeric,
          notes: c.source ? `Read from ${c.source}` : null,
          canon_benefit: c.canon_benefit,
          canon_codes: [c.product_code],
        }))),
      })
      if (!ins.ok) return NextResponse.json({ error: (await ins.text()).slice(0, 300) }, { status: 500 })
    }

    await fetch(`${SB_URL}/rest/v1/gb_benefit_candidates?id=in.(${picked.map(c => `"${c.id}"`).join(',')})`, {
      method: 'PATCH', headers: sbH(),
      body: JSON.stringify({ status: decision, decided_at: new Date().toISOString(), decided_by: user.email ?? null }),
    })

    const leftRes = await fetch(`${SB_URL}/rest/v1/gb_benefit_candidates?rate_table_id=eq.${id}&status=eq.pending&select=id&limit=1`,
      { headers: sbH(), cache: 'no-store' })
    const pendingLeft = leftRes.ok ? (await leftRes.json() as unknown[]).length : 0
    if (!pendingLeft) {
      await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(),
        body: JSON.stringify({ schedule_status: 'approved' }) }).catch(() => {})
    }

    void logActivity({ action: `gb.schedule_${decision}`, resource_type: 'gb_rate_table', resource_id: id,
                       new_value: { lines: picked.length } })
    return NextResponse.json({ ok: true, [decision]: picked.length, pendingLeft })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
