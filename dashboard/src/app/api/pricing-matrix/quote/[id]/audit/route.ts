/**
 * GET /api/pricing-matrix/quote/[id]/audit
 * The "how we got this number" audit trail for a saved quote — machine-readable JSON (the
 * QuoteAudit already stored per insurer on the quotation, plus review-provenance counts) and a
 * plain-English paragraph per insurer, ready to drop into a PDF (see export-audit/route.ts).
 * Nothing here is re-derived — the numbers/rules were computed once at quote-creation time.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { renderQuoteAuditText }      from '@/lib/pm-quote-audit'
import type { ReviewHistory }        from '@/lib/pm-quote-audit'
import type { QuoteResult }          from '@/lib/pm-quote'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const row = await fetch(`${SB_URL}/rest/v1/pm_quotations?id=eq.${id}&select=company_name,effective_date,calculator_ids,results&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null) as { company_name: string | null; effective_date: string | null; calculator_ids: string[]; results: QuoteResult | null } | null
    if (!row?.results) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ids = row.calculator_ids.map(cid => `"${cid}"`).join(',')
    const [issuesRes, editsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/pm_reconciliation_issues?calculator_id=in.(${ids})&status=eq.resolved&select=calculator_id`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/audit_logs?resource_id=in.(${ids})&action=eq.pm.rate_table_edited&select=resource_id`, { headers: sbH(), cache: 'no-store' }),
    ])
    const issueRows = issuesRes.ok ? await issuesRes.json() as { calculator_id: string }[] : []
    const editRows = editsRes.ok ? await editsRes.json() as { resource_id: string }[] : []

    const history: Record<string, ReviewHistory> = {}
    for (const cid of row.calculator_ids) history[cid] = { resolvedIssues: 0, humanEdits: 0 }
    for (const r of issueRows) if (history[r.calculator_id]) history[r.calculator_id].resolvedIssues++
    for (const r of editRows) if (history[r.resource_id]) history[r.resource_id].humanEdits++

    const text = renderQuoteAuditText(row.results, history)
    const audit = Object.fromEntries(row.results.insurers.map(i => [i.calculator_id, i.audit ?? null]))
    return NextResponse.json({ company_name: row.company_name, effective_date: row.effective_date, audit, history, text })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
