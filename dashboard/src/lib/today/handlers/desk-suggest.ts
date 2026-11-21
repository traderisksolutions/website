/**
 * GET /api/today/desk/suggest → { suggestions }: threads of the last three days the signed-in person
 * would likely add to Today, each with its reason and hit rate (src/lib/today/learn.ts). Code only.
 */
import { NextResponse } from 'next/server'
import { currentUserEmail } from '@/lib/crm/auth'
import { suggestFor } from '@/lib/today/learn-server'
import { withStaffOrCron } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export const GET = withStaffOrCron(async () => {
  const me = (await currentUserEmail())?.toLowerCase() ?? null
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  try {
    return NextResponse.json({ suggestions: await suggestFor(me, me) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
})
