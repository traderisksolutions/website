/**
 * GET   /api/pricing-matrix/quote/[id]  → full quotation (inputs + computed comparison results)
 * PATCH /api/pricing-matrix/quote/[id]  → edit an already-saved quote (company/effective date,
 *   census, insurer selection, plan tiers) and recompute results — same compute path as creating
 *   one (computeQuoteResultForCalculators), just re-run against the edited inputs. Quotes have no
 *   "final" lock, so this is available any time; nothing here is re-derived from AI, only pm-calc.ts
 *   pure math against the still-approved rate tables.
 *   body: { company_name?, effective_date?, census?, calculator_ids?, selections? } — omitted
 *   fields keep their current stored value.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { computeQuoteResultForCalculators } from '@/lib/pm-quote-server'
import type { CensusMember, Selection } from '@/lib/pm-quote'

export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const res = await fetch(`${SB_URL}/rest/v1/pm_quotations?id=eq.${id}&limit=1`, { headers: sbH(), cache: 'no-store' })
    const row = res.ok ? (await res.json())[0] : null
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const b = await req.json() as {
      company_name?: string; effective_date?: string
      census?: CensusMember[]; calculator_ids?: string[]; selections?: Record<string, Selection>
    }

    const current = await fetch(`${SB_URL}/rest/v1/pm_quotations?id=eq.${id}&select=company_name,effective_date,census,calculator_ids,selections&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null) as { company_name: string | null; effective_date: string | null; census: CensusMember[]; calculator_ids: string[]; selections: Record<string, Selection> } | null
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const company_name = b.company_name !== undefined ? (b.company_name || null) : current.company_name
    const effective_date = b.effective_date !== undefined ? (b.effective_date || null) : current.effective_date
    const calculator_ids = b.calculator_ids ?? current.calculator_ids ?? []
    const selections = b.selections ?? current.selections ?? {}
    const census = (b.census ?? current.census ?? []).filter(m => (m.name ?? '').trim() || m.date_of_birth || m.age != null)

    if (census.length === 0) return NextResponse.json({ error: 'census is empty' }, { status: 400 })
    if (calculator_ids.length === 0) return NextResponse.json({ error: 'select at least one insurer' }, { status: 400 })

    const results = await computeQuoteResultForCalculators(calculator_ids, census, selections, { effective_date })

    await fetch(`${SB_URL}/rest/v1/pm_quotations?id=eq.${id}`, {
      method: 'PATCH', headers: sbH('return=minimal'),
      body: JSON.stringify({ company_name, effective_date, census, calculator_ids, selections, results, member_count: census.length }),
    })
    void logActivity({ action: 'pm.quote_edited', resource_type: 'pm_quotation', resource_id: id, new_value: { insurers: results.insurers.length, members: census.length } })
    return NextResponse.json({ ok: true, results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
