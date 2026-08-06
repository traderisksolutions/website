/**
 * Server-only: load approved calculators + their rate tables and price a census against each —
 * the shared compute step behind both POST /api/pricing-matrix/quote (computes + saves) and
 * POST /api/pricing-matrix/quote/export-comparison-preview (computes + PDF, no save). Pricing
 * itself is pm-calc.ts's computeInsurerQuote — pure math, no AI, no re-reading source files;
 * this module only does the Supabase fetch + per-insurer orchestration around it.
 */
import { SB_URL, sbH } from '@/lib/pm-storage'
import { coverageCodes } from '@/lib/pm-rates'
import type { RateTable } from '@/lib/pm-rates'
import { computeInsurerQuote } from '@/lib/pm-calc'
import { alignLines } from '@/lib/pm-quote'
import type { CensusMember, Selection, InsurerResult, QuoteResult } from '@/lib/pm-quote'

export async function computeQuoteResultForCalculators(
  calculator_ids: string[], census: CensusMember[], selections: Record<string, Selection>,
  globals: { effective_date: string | null },
): Promise<QuoteResult> {
  const inList = calculator_ids.map(i => `"${i}"`).join(',')
  const [calcs, rts] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/pm_calculators?id=in.(${inList})&status=eq.approved&select=id,insurer_name,label,effective_date`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])) as Promise<{ id: string; insurer_name: string | null; label: string | null; effective_date: string | null }[]>,
    fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=in.(${inList})&select=calculator_id,age_basis,coverages,rules`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])) as Promise<(RateTable & { calculator_id: string })[]>,
  ])
  const rtByCalc = new Map(rts.map(r => [r.calculator_id, r]))

  const insurers: InsurerResult[] = calcs.map((c): InsurerResult => {
    const name = c.insurer_name || c.label || 'Untitled'
    const rt = rtByCalc.get(c.id)
    if (!rt) return { calculator_id: c.id, insurer_name: name, effective_date: c.effective_date, coverage_lines: [], by_line: {}, grand: null, member_count: 0, avg_per_life: null, members: [], error: 'No approved rate table for this insurer' }
    try {
      return computeInsurerQuote(c.id, name, c.effective_date, rt, census, (selections?.[c.id] ?? {}) as Selection, globals)
    } catch (e) {
      return { calculator_id: c.id, insurer_name: name, effective_date: c.effective_date, coverage_lines: coverageCodes(rt), by_line: {}, grand: null, member_count: 0, avg_per_life: null, members: [], error: String(e) }
    }
  })

  return { insurers, lines_union: alignLines(insurers), census_size: census.length }
}
