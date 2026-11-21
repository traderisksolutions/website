/**
 * GET /api/cron/policy-position — Monday 01:30 SGT (Cloud Scheduler policy-position "30 17 * * 0" UTC).
 * Writes last week's line (pax, joins, leaves, billed, credited, net) for every live EB policy.
 * Bearer CRON_SECRET, like the other crons.
 */
import { NextResponse } from 'next/server'
import { snapshotAllLive } from '@/lib/policies/position'
import { withCron } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export const GET = withCron(async () => {
  try {
    const r = await snapshotAllLive(new Date())
    console.log(`[policy-position] week ${r.week_start}: ${r.policies} policies, ${r.failed.length} failed`)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    console.error('[policy-position] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}, { error: 'Unauthorized' })
