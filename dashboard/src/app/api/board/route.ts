/** GET /api/board → every client company with its pressing items, the staff list, recent activity. */
import { NextRequest, NextResponse } from 'next/server'
import { listBoard }                 from '@/lib/crm/board'
import { withStaffOrCron } from '@/lib/auth/guard'

export const GET = withStaffOrCron(async (req: NextRequest, _ctx, { user }) => {
  try {
    const [board, me] = await Promise.all([listBoard(), user?.email.toLowerCase() ?? null])
    return NextResponse.json({ ...board, me })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})
