/**
 * POST /api/group-benefits/quick-quote
 *   { census, covers: CoverSpec[], company_name, effective_date, basis }
 *
 * The manual way in: a census and the covers wanted, priced at every insurer with a current rate
 * table, saved as a quotation and compared. No model is called — plans are chosen by rule
 * (src/lib/gb/plan-rules.ts). The email agent runs the same engine (src/lib/gb/draft.ts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/log-activity'
import { draftQuotation, DraftError } from '@/lib/gb/draft'
import { parseDocumentDate } from '@/lib/dates/dob'
import type { CoverSpec } from '@/lib/gb/plan-rules'
import type { Member } from '@/lib/gb-quote'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { census?: Member[]; covers?: CoverSpec[]; company_name?: string; effective_date?: string; basis?: string } | null
  const census = (body?.census ?? []).filter(m => m && typeof m.name === 'string' && m.name.trim())
  const covers = (body?.covers ?? []).filter(c => c && typeof c.code === 'string')
  const eff = parseDocumentDate(body?.effective_date ?? null)
  if (!census.length) return NextResponse.json({ error: 'The census is empty' }, { status: 400 })
  if (!covers.length) return NextResponse.json({ error: 'Choose at least one cover' }, { status: 400 })
  if (!eff) return NextResponse.json({ error: 'Policy start date is missing or unreadable' }, { status: 400 })
  if (census.length > 2000) return NextResponse.json({ error: 'Over 2,000 members; split the census' }, { status: 400 })

  try {
    const d = await draftQuotation({
      census, covers,
      companyName: body?.company_name?.trim() || 'Untitled quote',
      effectiveDate: `${eff.y}-${String(eff.m).padStart(2, '0')}-${String(eff.d).padStart(2, '0')}`,
      basis: body?.basis === 'renewal' ? 'renewal' : 'new_business',
      source: 'csv', createdBy: user.id,
    })
    void logActivity({ action: 'gb.quote_generated', resource_type: 'gb_quotation', resource_id: d.quotationId,
                       new_value: { company: body?.company_name, members: census.length, covers: covers.map(c => c.code), via: 'quick-quote' } })
    return NextResponse.json({ quotation_id: d.quotationId, complete: d.complete.length, partial: d.partial, notes: d.notes })
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: 422 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
