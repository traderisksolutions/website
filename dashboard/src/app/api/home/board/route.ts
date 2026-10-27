/** GET /api/home/board → the pinned companies as kanban columns. See @/lib/home/board. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { homeBoard }                 from '@/lib/home/board'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json(await homeBoard())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
