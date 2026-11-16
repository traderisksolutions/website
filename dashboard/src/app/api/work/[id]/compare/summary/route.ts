/**
 * GET /api/work/:id/compare/summary → the client summary of the case's comparison as a PDF, inline.
 * Built fresh from the saved comparison each time; nothing is stored by this route.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { buildCompareSummary } from '@/lib/cases/compare-summary'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  try {
    const r = await buildCompareSummary(id)
    if (!r) return NextResponse.json({ error: 'Save the comparison first.' }, { status: 404 })
    return new NextResponse(new Uint8Array(r.pdf), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${r.filename}"`, 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return caseFail(e)
  }
}
