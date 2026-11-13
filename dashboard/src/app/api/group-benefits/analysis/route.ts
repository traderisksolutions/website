/**
 * POST /api/group-benefits/analysis
 *   { census, schedule, company_name, company_id?, effective_date, basis, current_insurer?, excluded?: string[], last_year?, quotation_id? }
 *
 * With quotation_id (the quotation's census or policy edited), that quotation is repriced in place.
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
import { runCurrent } from '@/lib/gb/analysis'
import { CHANGES, groupsFor, type Schedule } from '@/lib/gb/current'
import { specCovers } from '@/lib/gb/custom'
import { normaliseLastYear } from '@/lib/gb/last-year'
import { depositEvent } from '@/lib/admin/k/deposit'
import { sb, sbTry, enc } from '@/lib/crm/db'
import type { Member } from '@/lib/gb-quote'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { census?: Member[]; schedule?: Schedule; company_name?: string; company_id?: string | null; effective_date?: string; basis?: string; current_insurer?: string | null; excluded?: string[]; source?: { label: string; href: string } | null; last_year?: unknown; quotation_id?: string | null } | null
  const census = (body?.census ?? []).filter(m => m && typeof m.name === 'string' && m.name.trim())
  const eff = parseDocumentDate(body?.effective_date ?? null)
  if (!census.length) return NextResponse.json({ error: 'The census is empty' }, { status: 400 })
  if (!eff) return NextResponse.json({ error: 'Policy start date is missing or unreadable' }, { status: 400 })
  if (census.length > 5000) return NextResponse.json({ error: 'Over 5,000 lives; split the census' }, { status: 400 })
  const schedule = body?.schedule
  if (!schedule?.GHS || !Object.values(schedule.GHS).some(Boolean)) return NextResponse.json({ error: 'State the current hospital cover for at least one plan' }, { status: 400 })
  const basis = body?.basis === 'renewal' ? 'renewal' : 'new_business'
  const currentInsurer = body?.current_insurer?.trim() || null
  const excluded = Array.isArray(body?.excluded) ? body!.excluded!.filter(x => typeof x === 'string').slice(0, 10) : []
  const effectiveDate = `${eff.y}-${String(eff.m).padStart(2, '0')}-${String(eff.d).padStart(2, '0')}`
  const companyName = body?.company_name?.trim() || 'Untitled quote'
  // Last year's policy as confirmed on Review; bounded again here, never trusted as sent.
  const lastYear = body?.last_year ? normaliseLastYear(body.last_year) : null

  // Editing a quotation's census or policy reprices it in place.
  const replaceId = typeof body?.quotation_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.quotation_id) ? body.quotation_id : null
  if (replaceId && !(await sbTry<{ id: string }[]>(`gb_quotations?id=eq.${enc(replaceId)}&select=id&limit=1`, [])).length) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

  try {
    // The quotation holds the census and the largest group's current cover; the analysis holds the rest.
    const groups = groupsFor(census, schedule, CHANGES[0]) ?? []
    const largest = groups.filter(g => !g.foreignWorker).sort((a, b) => b.members.length - a.members.length)[0] ?? groups[0]
    if (!largest) return NextResponse.json({ error: 'No one on the census matches a scheduled hospital plan' }, { status: 400 })
    const d = await draftQuotation({
      census, covers: specCovers(largest.spec), companyName, effectiveDate, basis, source: 'csv', createdBy: user.id, replaceId,
      notesHead: ['Employment benefits analysis: the current cover as scheduled, then one change at a time, at every insurer.'],
    })
    await sb(`gb_quotations?id=eq.${enc(d.quotationId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ requirement: { current_schedule: schedule, current_insurer: currentInsurer, last_year: lastYear, categories: [], employee_categories: {}, budget: null, tier_b: false } }) })
    const source = body?.source ?? (body?.company_id ? { label: companyName, href: `/companies/${body.company_id}?tab=eb` } : { label: 'Employment Benefits', href: '/pricing-matrix' })
    const pack = await runCurrent({ quotationId: d.quotationId, members: census, schedule, effectiveDate, basis, currentInsurer, excluded, source, by: user.email ?? null, lastYear })
    void logActivity({ action: replaceId ? 'gb.quote_repriced' : 'gb.quote_generated', resource_type: 'gb_quotation', resource_id: d.quotationId, new_value: { company: companyName, members: census.length, via: 'analysis', changes: pack.rungs.length - 1 } })
    fileEbCompanyFolder(companyName)
    // The client's knowledge base records the quotation (src/lib/admin/k/deposit.ts).
    await depositEvent('gb_quotations', d.quotationId).catch(e => console.error('[analysis] ledger', e))
    return NextResponse.json({ quotation_id: d.quotationId })
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: 422 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
