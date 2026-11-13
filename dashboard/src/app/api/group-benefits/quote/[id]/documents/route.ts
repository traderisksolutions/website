/**
 * GET /api/group-benefits/quote/:id/documents → what New quotation needs to reopen a quotation:
 *   the company, the census, last year's policy as confirmed, the schedule and the details.
 * Census and policy is one screen for a new quotation and for an existing one; Confirm on an
 * existing one reprices it in place (POST /api/group-benefits/analysis with quotation_id).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enc, sbTry } from '@/lib/crm/db'
import { loadAnalysis } from '@/lib/gb/analysis'
import type { LastYear } from '@/lib/gb/last-year'
import type { Schedule } from '@/lib/gb/current'
import type { Member } from '@/lib/gb-quote'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const [q] = await sbTry<{ id: string; company_name: string | null; census: Member[] | null; effective_date: string | null; basis: string | null; requirement: { current_schedule?: Schedule | null; current_insurer?: string | null; last_year?: LastYear | null } | null }[]>(
    `gb_quotations?id=eq.${enc(id)}&select=id,company_name,census,effective_date,basis,requirement&limit=1`, [])
  if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
  const pack = await loadAnalysis(id).catch(() => null)
  const [company] = q.company_name ? await sbTry<{ id: string; company_name: string }[]>(`companies?company_name=ilike.${enc(q.company_name)}&select=id,company_name&limit=1`, []) : []
  return NextResponse.json({
    id: q.id, company: { id: company?.id ?? null, name: q.company_name ?? '' },
    census: q.census ?? [], effectiveDate: q.effective_date, basis: q.basis === 'new_business' ? 'new_business' : 'renewal',
    currentInsurer: q.requirement?.current_insurer ?? pack?.currentInsurer ?? null,
    schedule: q.requirement?.current_schedule ?? pack?.schedule ?? null,
    lastYear: q.requirement?.last_year ?? pack?.lastYear ?? null,
    excluded: pack?.excluded ?? [],
  })
}
