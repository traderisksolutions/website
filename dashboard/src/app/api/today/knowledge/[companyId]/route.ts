/** GET /api/today/knowledge/:companyId?before=<iso> → the company's knowledge log, newest first. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadKnowledge } from '@/lib/today/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { companyId } = await params
  const before = req.nextUrl.searchParams.get('before')
  if (before && Number.isNaN(Date.parse(before))) return NextResponse.json({ error: 'before must be a date.' }, { status: 400 })
  try {
    const r = await loadKnowledge(companyId, before)
    if (!r) return NextResponse.json({ error: 'Company not found.' }, { status: 404 })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
