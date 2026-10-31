/**
 * GET /api/work → the open work items, ranked, each with its draft and threads.
 *   ?done=1 includes closed items.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { listWork, currentStaff } from '@/lib/casework/queue'
import { todaySGT } from '@/lib/sgt-time'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [items, staff] = await Promise.all([listWork({ today: todaySGT(), includeDone: req.nextUrl.searchParams.get('done') === '1' }), currentStaff()])
    return NextResponse.json({ items, staff })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
