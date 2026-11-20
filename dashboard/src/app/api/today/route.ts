/**
 * GET /api/today → the morning list: open items grouped Ready to send, Decide, To act, Read and
 * Come back later (src/lib/today/rules.ts), with each item's draft and paired drafts.
 */
import { NextResponse } from 'next/server'
import { currentUserEmail } from '@/lib/crm/auth'
import { loadToday } from '@/lib/today/data'
import { withStaffOrCron } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export const GET = withStaffOrCron(async () => {
  try {
    const [items, me] = await Promise.all([loadToday(), currentUserEmail()])
    return NextResponse.json({ items, me: me?.toLowerCase() ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
})
