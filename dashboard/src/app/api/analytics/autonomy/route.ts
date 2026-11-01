/**
 * GET /api/analytics/autonomy?days=90
 *
 * The autonomy share: how much outgoing mail came from an agent's draft, by week, by class of
 * work, by sender and by client, from the outbound_origin rows. Staff only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadRows } from '@/lib/analytics/autonomy/compute'
import { metrics, TARGET_SHARE } from '@/lib/analytics/autonomy/metrics'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  try {
    const days = Math.min(365, Math.max(7, Number(new URL(req.url).searchParams.get('days') ?? 90) || 90))
    const rows = await loadRows(days)
    const m = metrics(rows)
    const last = rows.reduce((a, r) => (r.sent_at > a ? r.sent_at : a), '')
    return NextResponse.json({ days, target: TARGET_SHARE, computedThrough: last || null, ...m })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
