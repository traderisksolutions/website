/** POST /api/autonomy/pause-all { reason? } → every auto or candidate class paused. Signed-in staff. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { pauseAll } from '@/lib/autonomy'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  const actor = await currentUserEmail()
  if (!actor) return NextResponse.json({ error: 'Sign in to pause auto-send.' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { reason?: string }
  try {
    const paused = await pauseAll(actor.toLowerCase(), body.reason?.trim() || 'paused all')
    return NextResponse.json({ ok: true, paused })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
