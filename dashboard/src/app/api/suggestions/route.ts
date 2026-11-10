/** GET /api/suggestions → the suggestions across the viewer's client threads, last 14 days (src/lib/chief/suggest.ts). */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { recentSuggestions } from '@/lib/chief/suggest'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json({ items: await recentSuggestions(await currentUserEmail()) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
