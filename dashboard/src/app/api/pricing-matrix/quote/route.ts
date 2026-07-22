/**
 * GET  /api/pricing-matrix/quote            → list quotations (newest first)
 * POST /api/pricing-matrix/quote            → compute a quote across selected calculators + save
 *   body: { company_name?, effective_date?, census[], calculator_ids[], selections{} }
 *
 * For each selected calculator we RUN its real Excel formula graph (pm_run.py) with the census ×
 * that insurer's plan selection, then assemble a side-by-side comparison. No numbers are derived
 * here — every premium/total comes from the insurer's own workbook.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH, signRead }     from '@/lib/pm-storage'
import { buildMembers, toInsurerResult, alignLines } from '@/lib/pm-quote'
import type { CensusMember, Selection, InsurerResult, QuoteResult } from '@/lib/pm-quote'
import type { CellMapProfile }       from '@/lib/pm-profile'

export const maxDuration = 300

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const url = `${SB_URL}/rest/v1/pm_quotations?select=id,company_name,effective_date,member_count,calculator_ids,created_at&order=created_at.desc&limit=200`
    const res = await fetch(url, { headers: sbH(), cache: 'no-store' })
    return NextResponse.json(res.ok ? await res.json() : [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const b = await req.json() as {
      company_name?: string; effective_date?: string
      census?: CensusMember[]; calculator_ids?: string[]; selections?: Record<string, Selection>
    }
    const census = (b.census ?? []).filter(m => (m.name ?? '').trim() || m.date_of_birth || m.age != null)
    const ids = b.calculator_ids ?? []
    if (census.length === 0) return NextResponse.json({ error: 'census is empty' }, { status: 400 })
    if (ids.length === 0) return NextResponse.json({ error: 'select at least one insurer' }, { status: 400 })

    // Load the selected approved calculators.
    const inList = ids.map(i => `"${i}"`).join(',')
    const calcs = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=in.(${inList})&status=eq.approved&select=id,insurer_name,label,effective_date,xlsx_path,profile`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])) as { id: string; insurer_name: string | null; label: string | null; effective_date: string | null; xlsx_path: string; profile: CellMapProfile }[]

    const origin = new URL(req.url).origin
    const globals = { effective_date: b.effective_date || null }

    // Run each calculator (in parallel) through the real engine.
    const insurers: InsurerResult[] = await Promise.all(calcs.map(async (c): Promise<InsurerResult> => {
      const name = c.insurer_name || c.label || 'Untitled'
      const base: InsurerResult = { calculator_id: c.id, insurer_name: name, effective_date: c.effective_date, coverage_lines: (c.profile?.coverage_lines ?? []).map(l => ({ code: l.code, label: l.label })), by_line: {}, grand: null, member_count: 0, avg_per_life: null, members: [] }
      try {
        const members = buildMembers(census, (b.selections?.[c.id] ?? {}) as Selection, c.profile?.coverage_lines ?? [])
        const xlsx_url = await signRead(c.xlsx_path)
        const runRes = await fetch(`${origin}/api/pm_run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xlsx_url, profile: c.profile, members, globals }) })
        const run = await runRes.json().catch(() => ({ error: 'pm_run non-JSON' }))
        if (!runRes.ok || run.error) return { ...base, error: run.error ?? `pm_run ${runRes.status}` }
        return toInsurerResult(c.id, name, c.effective_date, c.profile, run)
      } catch (e) {
        return { ...base, error: String(e) }
      }
    }))

    const results: QuoteResult = { insurers, lines_union: alignLines(insurers), census_size: census.length }

    // Persist.
    const row = {
      company_name: b.company_name || null, effective_date: b.effective_date || null,
      census, calculator_ids: ids, selections: b.selections ?? {}, results, member_count: census.length, created_by: user.id,
    }
    const ins = await fetch(`${SB_URL}/rest/v1/pm_quotations`, { method: 'POST', headers: sbH('return=representation'), body: JSON.stringify(row) })
    const created = ins.ok ? (await ins.json())[0] : null

    void logActivity({ action: 'pm.quote_created', resource_type: 'pm_quotation', resource_id: created?.id, new_value: { insurers: insurers.length, members: census.length } })
    return NextResponse.json({ id: created?.id, results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
