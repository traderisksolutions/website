/**
 * GET /api/today/recompute → recomputes every open case's pending level (red, amber, green, grey)
 * and stores it. For a cron or a person; Bearer CRON_SECRET or a signed-in staff session.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { recomputePending } from '@/lib/today/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json({ ok: true, ...await recomputePending() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
