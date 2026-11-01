/**
 * GET /api/placements/endorsements/sweep — daily (vercel.json "5 1 * * *", 09:05 SGT). Queues the
 * loop's daily work (sync approved batches, close the batches whose window ended, chase quiet
 * insurers) and drains the eb_movements agent for up to 4 minutes. ?today=YYYY-MM-DD replays a day.
 * Bearer CRON_SECRET, like the other crons; a signed-in staff member may run it too.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { drain } from '@/lib/admin'
import { enqueue } from '@/lib/agent-tasks/queue'
import { endorsementSweepTasks } from '@/lib/admin/b/policy-agents'
import { todaySGT } from '@/lib/sgt-time'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const q = new URL(req.url).searchParams.get('today')
    const today = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todaySGT()
    await enqueue(endorsementSweepTasks(today))
    const r = await drain({ agents: ['eb_movements'], budgetMs: 240_000 })
    console.log('[endorsements-sweep]', today, JSON.stringify(r))
    return NextResponse.json({ ok: true, today, ...r })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
