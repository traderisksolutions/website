/**
 * GET    /api/pricing-matrix/calculators/[id]   → calculator row + its rate_table + benefit_terms
 * PATCH  /api/pricing-matrix/calculators/[id]   → save edits { label?, insurer_name?, effective_date?,
 *                                                  notes?, status?, rate_table?, benefit_terms? }
 * DELETE /api/pricing-matrix/calculators/[id]   → remove the calculator row (files left in storage)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { diffRateTable, diffBenefitTerms } from '@/lib/pm-diff'
import type { DiffEntry } from '@/lib/pm-diff'
import type { RateTable } from '@/lib/pm-rates'
import type { BenefitTerm } from '@/lib/pm-benefits-extract'

const bySide = (diff: DiffEntry[], side: 'from' | 'to') => Object.fromEntries(diff.map(d => [d.path, d[side]]))

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const [calcRes, rtRes, btRes, issuesRes, rulesRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&limit=1`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=eq.${id}&limit=1`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_benefit_terms?calculator_id=eq.${id}&limit=1`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_reconciliation_issues?calculator_id=eq.${id}&order=created_at.asc`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_computation_rules?calculator_id=eq.${id}&limit=1`, { headers: sbH(), cache: 'no-store' }),
    ])
    const row = calcRes.ok ? (await calcRes.json())[0] : null
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const rate_table = rtRes.ok ? (await rtRes.json())[0] ?? null : null
    const benefit_terms = btRes.ok ? (await btRes.json())[0] ?? null : null
    const issues = issuesRes.ok ? await issuesRes.json() : []
    const computation_rules = rulesRes.ok ? (await rulesRes.json())[0] ?? null : null
    return NextResponse.json({ ...row, rate_table, benefit_terms, issues, computation_rules })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const b = await req.json() as Record<string, unknown>

    const calcBody: Record<string, unknown> = {}
    for (const k of ['label', 'insurer_name', 'effective_date', 'notes'] as const) if (k in b) calcBody[k] = b[k]

    // Editing the rate table / benefit terms after review keeps the calculator in review.
    if (('rate_table' in b || 'benefit_terms' in b) && !('status' in b)) calcBody.status = 'in_review'
    if ('status' in b && typeof b.status === 'string') calcBody.status = b.status

    // Fetch what's currently stored BEFORE overwriting, so a human edit (as opposed to the AI's own
    // extraction write) gets a from -> to trail via logActivity — separate from the AI-vs-AI
    // disagreements tracked in pm_reconciliation_issues, this is provenance on values a person typed.
    const [prevRt, prevBt] = await Promise.all([
      b.rate_table ? fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=eq.${id}&select=age_basis,coverages,rules&limit=1`, { headers: sbH(), cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(rows => rows[0] ?? null) as Promise<RateTable | null> : Promise.resolve(null),
      b.benefit_terms ? fetch(`${SB_URL}/rest/v1/pm_benefit_terms?calculator_id=eq.${id}&select=terms&limit=1`, { headers: sbH(), cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(rows => rows[0]?.terms ?? null) as Promise<BenefitTerm[] | null> : Promise.resolve(null),
    ])

    const writes: Promise<Response>[] = []
    if (Object.keys(calcBody).length > 0) {
      writes.push(fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(calcBody) }))
    }
    // Upsert (not PATCH) — a calculator set up manually (skipping Extract) has no pm_rate_tables /
    // pm_benefit_terms row yet, and a plain PATCH against a non-existent row silently updates zero
    // rows, which would make Save a no-op with no error.
    if (b.rate_table && typeof b.rate_table === 'object') {
      const rt = b.rate_table as Record<string, unknown>
      writes.push(fetch(`${SB_URL}/rest/v1/pm_rate_tables?on_conflict=calculator_id`, {
        method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
        body: JSON.stringify({ calculator_id: id, age_basis: rt.age_basis, coverages: rt.coverages, rules: rt.rules, accuracy: rt.accuracy }),
      }))
    }
    if (b.benefit_terms && typeof b.benefit_terms === 'object') {
      const bt = b.benefit_terms as Record<string, unknown>
      writes.push(fetch(`${SB_URL}/rest/v1/pm_benefit_terms?on_conflict=calculator_id`, {
        method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
        body: JSON.stringify({ calculator_id: id, terms: bt.terms, accuracy: bt.accuracy }),
      }))
    }
    // Computation rules have their OWN approval lifecycle (independent from the calculator's
    // rate-table status). Editing the content after it was already approved must knock the
    // status back to 'in_review' (an approved-but-silently-edited rule set would otherwise keep
    // being trusted at quote time with no re-review) — but editing while still draft/in_review
    // just stays as-is, so `status` is only set here when it needs to actively change.
    if (b.computation_rules && typeof b.computation_rules === 'object') {
      const cr = b.computation_rules as Record<string, unknown>
      const curCrRes = await fetch(`${SB_URL}/rest/v1/pm_computation_rules?calculator_id=eq.${id}&select=status&limit=1`, { headers: sbH(), cache: 'no-store' })
      const curCr = curCrRes.ok ? (await curCrRes.json())[0] : null
      writes.push(fetch(`${SB_URL}/rest/v1/pm_computation_rules?on_conflict=calculator_id`, {
        method: 'POST', headers: sbH('return=minimal,resolution=merge-duplicates'),
        body: JSON.stringify({
          calculator_id: id, source: cr.source, rules: cr.rules, variables: cr.variables ?? {}, accuracy: cr.accuracy,
          ...(curCr?.status === 'approved' ? { status: 'in_review' } : {}),
        }),
      }))
    }
    if (writes.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    const results = await Promise.all(writes)
    const failed = results.find(r => !r.ok)
    if (failed) return NextResponse.json({ error: await failed.text() }, { status: 500 })

    const rtDiff = b.rate_table ? diffRateTable(prevRt, b.rate_table as RateTable) : []
    const btDiff = b.benefit_terms ? diffBenefitTerms(prevBt, (b.benefit_terms as { terms?: BenefitTerm[] }).terms) : []
    if (rtDiff.length || btDiff.length) {
      void logActivity({
        action: 'pm.rate_table_edited', resource_type: 'pm_calculator', resource_id: id,
        old_value: { rate_table: bySide(rtDiff, 'from'), benefit_terms: bySide(btDiff, 'from') },
        new_value: { rate_table: bySide(rtDiff, 'to'), benefit_terms: bySide(btDiff, 'to') },
      })
    }
    void logActivity({ action: 'pm.calculator_saved', resource_type: 'pm_calculator', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const res = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}`, { method: 'DELETE', headers: sbH('return=minimal') })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    void logActivity({ action: 'pm.calculator_deleted', resource_type: 'pm_calculator', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
