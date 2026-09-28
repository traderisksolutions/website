/** GET /api/board → every client company with its pressing items, the staff list, recent activity. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { currentUserEmail }          from '@/lib/crm/auth'
import { listBoard }                 from '@/lib/crm/board'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [board, me] = await Promise.all([listBoard(), currentUserEmail()])
    return NextResponse.json({ ...board, me })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
