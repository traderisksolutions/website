/**
 * GET  /api/pricing-matrix/quote            → list quotations (newest first)
 * POST /api/pricing-matrix/quote            → compute a quote across selected calculators + save
 *   body: { company_name?, effective_date?, census[], calculator_ids[], selections{} }
 *
 * For each selected calculator we compute the premium ourselves (pm-calc.ts) from its stored,
 * human-approved rate table + rules — no AI call and no external engine at quote time.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { computeQuoteResultForCalculators } from '@/lib/pm-quote-server'
import type { CensusMember, Selection } from '@/lib/pm-quote'

export const maxDuration = 60

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

    const results = await computeQuoteResultForCalculators(ids, census, b.selections ?? {}, { effective_date: b.effective_date || null })

    // Persist.
    const row = {
      company_name: b.company_name || null, effective_date: b.effective_date || null,
      census, calculator_ids: ids, selections: b.selections ?? {}, results, member_count: census.length, created_by: user.id,
    }
    const ins = await fetch(`${SB_URL}/rest/v1/pm_quotations`, { method: 'POST', headers: sbH('return=representation'), body: JSON.stringify(row) })
    const created = ins.ok ? (await ins.json())[0] : null

    void logActivity({ action: 'pm.quote_created', resource_type: 'pm_quotation', resource_id: created?.id, new_value: { insurers: results.insurers.length, members: census.length } })
    return NextResponse.json({ id: created?.id, results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
