/**
 * GET /api/pricing-matrix/quote/[id]/export-audit
 * Downloads the "how we got this number" audit trail as a PDF — broker-facing, same pattern as
 * export-comparison/route.ts. Reuses the same JSON the /audit route returns; nothing recomputed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { renderQuoteAuditText }      from '@/lib/pm-quote-audit'
import type { ReviewHistory }        from '@/lib/pm-quote-audit'
import { renderAuditPdf }            from '@/lib/pm-audit-pdf'
import type { QuoteResult }          from '@/lib/pm-quote'

export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const row = await fetch(`${SB_URL}/rest/v1/pm_quotations?id=eq.${id}&select=company_name,created_at,calculator_ids,results&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null) as { company_name: string | null; created_at: string; calculator_ids: string[]; results: QuoteResult | null } | null
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
    const generated = new Date(row.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
    const pdf = await renderAuditPdf(row.company_name, generated, row.results, text)

    const stem = (row.company_name ?? 'quote').replace(/[^\w -]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'quote'
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${stem}_audit-trail.pdf"` },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
