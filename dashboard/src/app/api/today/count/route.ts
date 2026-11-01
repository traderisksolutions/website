/** GET /api/today/count → { count }: items on Today to go through (not those set for later). */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadToday } from '@/lib/today/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const items = await loadToday()
    return NextResponse.json({ count: items.filter(i => i.group !== 'later').length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
