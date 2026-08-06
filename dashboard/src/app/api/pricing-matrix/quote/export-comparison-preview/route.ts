/**
 * POST /api/pricing-matrix/quote/export-comparison-preview
 *   body: { company_name?, effective_date?, census[], calculator_ids[], selections{} }
 *
 * Same "Coverage Comparison" PDF as GET .../quote/[id]/export-comparison, but computed directly
 * from a request body instead of a saved quotation — lets the wizard preview the PDF as plan
 * tiers are toggled, without creating a pm_quotations row each time. No persistence at all.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { computeQuoteResultForCalculators } from '@/lib/pm-quote-server'
import { buildComparisonDoc }        from '@/lib/pm-comparison-doc'
import type { ComparisonDocInsurer } from '@/lib/pm-comparison-doc'
import { renderComparisonPdf }       from '@/lib/pm-comparison-pdf'
import type { CensusMember, Selection } from '@/lib/pm-quote'
import type { RateTable }            from '@/lib/pm-rates'
import type { BenefitTerm }          from '@/lib/pm-benefits-extract'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
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

    const inList = ids.map(cid => `"${cid}"`).join(',')
    const [calcRes, rtRes, termsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/pm_calculators?id=in.(${inList})&select=id,insurer_name,label`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=in.(${inList})&select=calculator_id,age_basis,coverages,rules`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_benefit_terms?calculator_id=in.(${inList})&select=calculator_id,terms`, { headers: sbH(), cache: 'no-store' }),
    ])
    const calcs = calcRes.ok ? await calcRes.json() as { id: string; insurer_name: string | null; label: string | null }[] : []
    const rts = rtRes.ok ? await rtRes.json() as (RateTable & { calculator_id: string })[] : []
    const termRows = termsRes.ok ? await termsRes.json() as { calculator_id: string; terms: BenefitTerm[] }[] : []
    const rtByCalc = new Map(rts.map(r => [r.calculator_id, r]))
    const termsByCalc = new Map(termRows.map(r => [r.calculator_id, r.terms ?? []]))

    const insurers: ComparisonDocInsurer[] = calcs
      .map(c => ({
        calculator_id: c.id, insurer_name: c.insurer_name || c.label || 'Untitled',
        rate_table: rtByCalc.get(c.id), benefit_terms: termsByCalc.get(c.id) ?? [], selection: b.selections?.[c.id] ?? {},
      }))
      .filter((i): i is ComparisonDocInsurer => !!i.rate_table)

    const doc = buildComparisonDoc({
      company: b.company_name || null, quotation_date: new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }),
      effective_date: b.effective_date || null, census, insurers, result: results,
    })
    const pdf = await renderComparisonPdf(doc)

    const stem = (b.company_name ?? 'comparison').replace(/[^\w -]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'comparison'
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${stem}_coverage-comparison.pdf"` },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
