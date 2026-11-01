/**
 * GET /api/today → the morning list: open items grouped Ready to send, Decide, To act, Read and
 * Come back later (src/lib/today/rules.ts), with each item's draft and paired drafts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { loadToday } from '@/lib/today/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [items, me] = await Promise.all([loadToday(), currentUserEmail()])
    return NextResponse.json({ items, me: me?.toLowerCase() ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
