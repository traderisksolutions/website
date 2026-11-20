/**
 * GET /api/today/edit-options?company_id=&q= → what the case editor needs: current staff, the
 * client's policies, and clients matching q (for refiling).
 */
import { NextRequest, NextResponse } from 'next/server'
import { editOptions } from '@/lib/today/data'
import { withStaffOrCron } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export const GET = withStaffOrCron(async (req: NextRequest) => {
  const u = new URL(req.url)
  try {
    return NextResponse.json(await editOptions({ company_id: u.searchParams.get('company_id'), q: u.searchParams.get('q') }))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
})
