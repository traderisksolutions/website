/**
 * GET /api/today/desk/suggest → { suggestions }: threads of the last three days the signed-in person
 * would likely add to Today, each with its reason and hit rate (src/lib/today/learn.ts). Code only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { suggestFor } from '@/lib/today/learn-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const me = (await currentUserEmail())?.toLowerCase() ?? null
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  try {
    return NextResponse.json({ suggestions: await suggestFor(me, me) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
