/**
 * GET /api/today/edit-options?company_id=&q= → what the case editor needs: current staff, the
 * client's policies, and clients matching q (for refiling).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { editOptions } from '@/lib/today/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const u = new URL(req.url)
  try {
    return NextResponse.json(await editOptions({ company_id: u.searchParams.get('company_id'), q: u.searchParams.get('q') }))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
