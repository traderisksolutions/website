/**
 * GET /api/group-benefits/quote/:id/compare/report-pdf[?download=1] → the client report from
 * Compare cover (src/lib/gb/compare-report.ts) with the choices saved now. Inline, or as a download.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadCompare } from '@/lib/gb/compare-cover'
import { buildCompareReport } from '@/lib/gb/compare-report'
import { renderCompareReportPdf, reportFilename } from '@/lib/gb/compare-report-pdf'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  const { id } = await params
  const d = await loadCompare(id)
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: d.status })
  const m = buildCompareReport(d)
  const pdf = await renderCompareReportPdf(m)
  const how = new URL(req.url).searchParams.get('download') ? 'attachment' : 'inline'
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${how}; filename="${reportFilename(m.company)}"`, 'Cache-Control': 'no-store' } })
}
