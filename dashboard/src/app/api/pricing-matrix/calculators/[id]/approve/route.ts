/**
 * POST /api/pricing-matrix/calculators/[id]/approve
 * Marks a reviewed calculator live. Archives any prior approved calculator for the same insurer and
 * bumps the version. Requires a runnable rate table and ALL flagged rule/term conflicts resolved.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { rateTableIsRunnable, runnableIssues } from '@/lib/pm-rates'
import type { RateTable }            from '@/lib/pm-rates'
import type { BenefitTerm }          from '@/lib/pm-benefits-extract'
import { diffRateTable, diffBenefitTerms } from '@/lib/pm-diff'
import { buildWorkbookAnalysisSummary, renderChangeSummary } from '@/lib/pm-summary'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const calc = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=insurer_id,insurer_name,version&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!calc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const rt = await fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=eq.${id}&select=age_basis,coverages,rules,accuracy&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null) as RateTable | null
    if (!rateTableIsRunnable(rt)) return NextResponse.json({ error: runnableIssues(rt)[0] ?? 'Rate table is incomplete' }, { status: 400 })
    const openItems = await fetch(`${SB_URL}/rest/v1/pm_reconciliation_issues?calculator_id=eq.${id}&status=eq.open&select=id`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then((rows: unknown[]) => rows.length)
    if (openItems > 0) return NextResponse.json({ error: `Resolve ${openItems} flagged item${openItems === 1 ? '' : 's'} before approving` }, { status: 400 })

    // Archive prior approved calculators for the same insurer (match on id, else on name).
    const filter = calc.insurer_id ? `insurer_id=eq.${calc.insurer_id}` : `insurer_name=eq.${encodeURIComponent(calc.insurer_name ?? '')}`
    const priorApproved = await fetch(`${SB_URL}/rest/v1/pm_calculators?${filter}&status=eq.approved&select=id,version`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])) as { id: string; version: number }[]
    const maxVersion = priorApproved.reduce((mx, r) => Math.max(mx, r.version ?? 1), 0)
    for (const p of priorApproved) {
      if (p.id === id) continue
      await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${p.id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'archived' }) })
    }

    // Deterministic, templated summaries — no AI, no re-reading the source files. The workbook
    // summary always regenerates; the "what changed" summary only exists when a prior approved
    // version of this insurer is being superseded.
    const analysis_summary = buildWorkbookAnalysisSummary(rt as RateTable)
    let change_summary: { text: string; rate_diff: unknown; term_diff: unknown } | null = null
    const prev = priorApproved.find(p => p.id !== id && p.version === maxVersion)
    if (prev) {
      const [prevRt, prevBt, newBt] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=eq.${prev.id}&select=age_basis,coverages,rules&limit=1`, { headers: sbH(), cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(rows => rows[0] ?? null) as Promise<RateTable | null>,
        fetch(`${SB_URL}/rest/v1/pm_benefit_terms?calculator_id=eq.${prev.id}&select=terms&limit=1`, { headers: sbH(), cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(rows => rows[0]?.terms ?? null) as Promise<BenefitTerm[] | null>,
        fetch(`${SB_URL}/rest/v1/pm_benefit_terms?calculator_id=eq.${id}&select=terms&limit=1`, { headers: sbH(), cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(rows => rows[0]?.terms ?? null) as Promise<BenefitTerm[] | null>,
      ])
      const rateDiff = diffRateTable(prevRt, rt as RateTable)
      const termDiff = diffBenefitTerms(prevBt, newBt)
      change_summary = { text: renderChangeSummary(rateDiff, termDiff), rate_diff: rateDiff, term_diff: termDiff }
    }

    await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}`, {
      method: 'PATCH', headers: sbH('return=minimal'),
      body: JSON.stringify({
        status: 'approved', version: Math.max(maxVersion + 1, calc.version ?? 1), approved_by: user.id, approved_at: new Date().toISOString(),
        analysis_summary, change_summary,
      }),
    })
    void logActivity({ action: 'pm.calculator_approved', resource_type: 'pm_calculator', resource_id: id, new_value: { insurer: calc.insurer_name } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
