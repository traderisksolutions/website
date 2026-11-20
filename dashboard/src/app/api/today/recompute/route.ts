/**
 * GET /api/today/recompute → recomputes every open case's pending level (red, amber, green, grey)
 * and stores it. For a cron or a person; Bearer CRON_SECRET or a signed-in staff session.
 */
import { NextResponse } from 'next/server'
import { recomputePending } from '@/lib/today/data'
import { withStaffOrCron } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export const GET = withStaffOrCron(async () => {
  try {
    return NextResponse.json({ ok: true, ...await recomputePending() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
})
