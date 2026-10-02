/**
 * GET /api/group-benefits/quote/[id]/report-pdf[?download=1]
 *
 * The client report as an A4 PDF, rendered from the saved quotation on every request — so the
 * file anyone previews or downloads is always the current quotation, never a stale copy. Inline
 * by default (the report page previews it); ?download=1 sends it as an attachment.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { buildReportModel, type ReportQuotation } from '@/lib/gb/report-model'
import { renderReportPdf } from '@/lib/gb/report-pdf'
import { COVER_NAMES_KEY, type CoverNames } from '@/lib/gb/cover-names'

export const runtime = 'nodejs'
export const maxDuration = 60

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  const { id } = await params
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
  const h = { apikey: k, Authorization: `Bearer ${k}` }
  try {
    const [qRes, nRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${encodeURIComponent(id)}&select=id,company_name,effective_date,basis,member_count,census,results,category_map,benefits_analysis,notes,created_at,priorities&limit=1`, { headers: h, cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/app_settings?key=eq.${COVER_NAMES_KEY}&select=value&limit=1`, { headers: h, cache: 'no-store' }),
    ])
    const q = qRes.ok ? ((await qRes.json()) as ReportQuotation[])[0] : null
    if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    let names: CoverNames = {}
    try { names = JSON.parse(((nRes.ok ? await nRes.json() : []) as { value: string }[])[0]?.value ?? '{}') } catch { /* canonical names */ }

    const pdf = await renderReportPdf(buildReportModel(q, names))
    const file = `${(q.company_name || 'Quotation').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-')}-group-benefits-comparison.pdf`
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${req.nextUrl.searchParams.get('download') ? 'attachment' : 'inline'}; filename="${file}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not render the report' }, { status: 500 })
  }
}
