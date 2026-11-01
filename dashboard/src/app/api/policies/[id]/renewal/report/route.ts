/**
 * GET /api/policies/[id]/renewal/report?as_of=YYYY-MM-DD → the renewal report PDF, inline.
 * Built fresh from the policy's pack each time; nothing is stored by this route. The stored copy
 * is the one attached to the draft (POST /api/policies/[id]/renewal { action: 'draft' }).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { buildRenewalReport } from '@/lib/policies/ledger/report'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Policy id is not valid' }, { status: 400 })
  const asOf = req.nextUrl.searchParams.get('as_of')
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return NextResponse.json({ error: 'as_of must be YYYY-MM-DD' }, { status: 400 })
  try {
    const r = await buildRenewalReport(id, asOf ?? undefined)
    if (!r) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
    return new NextResponse(new Uint8Array(r.pdf), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${r.filename.replace(/"/g, '')}"`, 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
