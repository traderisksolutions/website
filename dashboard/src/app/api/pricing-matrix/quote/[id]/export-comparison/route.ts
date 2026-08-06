/**
 * GET /api/pricing-matrix/quote/[id]/export-comparison
 * Downloads the client-facing "Coverage Comparison" PDF (pricing summary + plan selection + full
 * benefit schedule, side by side) built from the stored quote results + each insurer's approved
 * rate table/benefit terms. Replaces the previous manual spreadsheet process — every number here
 * is copied from what the quote already computed, never re-derived.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { buildComparisonDoc }        from '@/lib/pm-comparison-doc'
import type { ComparisonDocInsurer } from '@/lib/pm-comparison-doc'
import { renderComparisonPdf }       from '@/lib/pm-comparison-pdf'
import type { QuoteResult, Selection, CensusMember } from '@/lib/pm-quote'
import type { RateTable }            from '@/lib/pm-rates'
import type { BenefitTerm }          from '@/lib/pm-benefits-extract'

export const maxDuration = 60

type QuotationRow = {
  company_name: string | null; effective_date: string | null; created_at: string
  census: CensusMember[]; calculator_ids: string[]; selections: Record<string, Selection>; results: QuoteResult | null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const row = await fetch(`${SB_URL}/rest/v1/pm_quotations?id=eq.${id}&select=company_name,effective_date,created_at,census,calculator_ids,selections,results&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null) as QuotationRow | null
    if (!row || !row.results) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ids = row.calculator_ids.map(cid => `"${cid}"`).join(',')
    const [calcRes, rtRes, termsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/pm_calculators?id=in.(${ids})&select=id,insurer_name,label`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=in.(${ids})&select=calculator_id,age_basis,coverages,rules`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_benefit_terms?calculator_id=in.(${ids})&select=calculator_id,terms`, { headers: sbH(), cache: 'no-store' }),
    ])
    const calcs = calcRes.ok ? await calcRes.json() as { id: string; insurer_name: string | null; label: string | null }[] : []
    const rts = rtRes.ok ? await rtRes.json() as (RateTable & { calculator_id: string })[] : []
    const termRows = termsRes.ok ? await termsRes.json() as { calculator_id: string; terms: BenefitTerm[] }[] : []
    const rtByCalc = new Map(rts.map(r => [r.calculator_id, r]))
    const termsByCalc = new Map(termRows.map(r => [r.calculator_id, r.terms ?? []]))

    const insurers: ComparisonDocInsurer[] = calcs
      .map(c => ({
        calculator_id: c.id, insurer_name: c.insurer_name || c.label || 'Untitled',
        rate_table: rtByCalc.get(c.id), benefit_terms: termsByCalc.get(c.id) ?? [], selection: row.selections?.[c.id] ?? {},
      }))
      .filter((i): i is ComparisonDocInsurer => !!i.rate_table)

    const doc = buildComparisonDoc({
      company: row.company_name, quotation_date: new Date(row.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }),
      effective_date: row.effective_date, census: row.census ?? [], insurers, result: row.results,
    })
    const pdf = await renderComparisonPdf(doc)

    const stem = (row.company_name ?? 'comparison').replace(/[^\w -]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'comparison'
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${stem}_coverage-comparison.pdf"` },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
