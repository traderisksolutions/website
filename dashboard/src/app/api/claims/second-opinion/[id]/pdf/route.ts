/** GET /api/claims/second-opinion/[id]/pdf[?download=1] — the saved report as the client PDF. Staff only. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { getClaimIntake } from '@/lib/claim-review/store'
import { renderClaimReportPdf } from '@/lib/claim-review/report-pdf'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  const row = await getClaimIntake(params.id)
  const report = row?.answers.second_opinion
  if (!row || !report) return NextResponse.json({ error: 'No report for this claim yet.' }, { status: 404 })
  const client = row.contact_name || 'Policyholder'
  const pdf = await renderClaimReportPdf(report, { client, market: String(row.answers.market ?? 'SG'), ref: row.id.slice(0, 8).toUpperCase() })
  const file = `${client.replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-') || 'claim'}-second-opinion.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.nextUrl.searchParams.get('download') ? 'attachment' : 'inline'}; filename="${file}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
