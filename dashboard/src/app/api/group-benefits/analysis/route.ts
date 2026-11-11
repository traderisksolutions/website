/**
 * POST /api/group-benefits/analysis
 *   { census, company_name, company_id?, effective_date, basis, current_insurer?, excluded?: string[] }
 *
 * One census in, one analysis out. Saves the census as a quotation priced at the suggested
 * package (the same draft the quick quote makes), then prices every package at every insurer in
 * one run (src/lib/gb/analysis.ts) and answers with the quotation id; the report lives at
 * /pricing-matrix/quote/<id>/analysis. No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/log-activity'
import { fileEbCompanyFolder } from '@/lib/company-drive'
import { draftQuotation, DraftError } from '@/lib/gb/draft'
import { parseDocumentDate } from '@/lib/dates/dob'
import { packageByKey, packageCovers, suggestedRung } from '@/lib/gb/packages'
import { runAnalysis } from '@/lib/gb/analysis'
import type { Member } from '@/lib/gb-quote'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { census?: Member[]; company_name?: string; effective_date?: string; basis?: string; current_insurer?: string | null; excluded?: string[] } | null
  const census = (body?.census ?? []).filter(m => m && typeof m.name === 'string' && m.name.trim())
  const eff = parseDocumentDate(body?.effective_date ?? null)
  if (!census.length) return NextResponse.json({ error: 'The census is empty' }, { status: 400 })
  if (!eff) return NextResponse.json({ error: 'Policy start date is missing or unreadable' }, { status: 400 })
  if (census.length > 2000) return NextResponse.json({ error: 'Over 2,000 members; split the census' }, { status: 400 })
  const basis = body?.basis === 'renewal' ? 'renewal' : 'new_business'
  const currentInsurer = body?.current_insurer?.trim() || null
  const excluded = Array.isArray(body?.excluded) ? body!.excluded!.filter(x => typeof x === 'string').slice(0, 10) : []
  const effectiveDate = `${eff.y}-${String(eff.m).padStart(2, '0')}-${String(eff.d).padStart(2, '0')}`
  const companyName = body?.company_name?.trim() || 'Untitled quote'

  try {
    const suggested = suggestedRung(basis, null)
    const d = await draftQuotation({
      census, covers: packageCovers(packageByKey(suggested.key)!), companyName, effectiveDate, basis, source: 'csv', createdBy: user.id,
      notesHead: [`EB analysis: five packages at every insurer; this quotation holds the ${suggested.key} package.`],
    })
    const pack = await runAnalysis({ quotationId: d.quotationId, members: census, effectiveDate, basis, currentInsurer, excluded, by: user.email ?? null })
    void logActivity({ action: 'gb.quote_generated', resource_type: 'gb_quotation', resource_id: d.quotationId, new_value: { company: companyName, members: census.length, via: 'analysis', suggested: pack.suggested } })
    fileEbCompanyFolder(companyName)
    return NextResponse.json({ quotation_id: d.quotationId, suggested: pack.suggested })
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: 422 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
