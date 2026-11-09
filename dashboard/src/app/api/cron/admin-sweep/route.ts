/**
 * GET /api/cron/admin-sweep — daily (vercel.json "10 1 * * *", 09:10 SGT). Queues the day's
 * renewals, chases and claims sync, then drains the Phase B agents for up to 4 minutes. Every
 * draft waits on /work for a person. ?today=YYYY-MM-DD replays a day.
 * Bearer CRON_SECRET, like the other crons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { drain } from '@/lib/admin'
import { PHASE_B_AGENTS } from '@/lib/admin/handlers-b'
import { enqueue } from '@/lib/agent-tasks/queue'
import { dailySweepTasks } from '@/lib/admin/b/sweeps'
import { checkMailboxes } from '@/lib/gmail/health'
import { todaySGT } from '@/lib/sgt-time'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  if (!(secret !== '' && req.headers.get('authorization') === `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const q = new URL(req.url).searchParams.get('today')
    const today = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todaySGT()
    const mail = await checkMailboxes().catch(() => [] as string[])
    await enqueue(dailySweepTasks(today))
    const r = await drain({ agents: [...PHASE_B_AGENTS], budgetMs: 240_000 })
    console.log('[admin-sweep]', today, JSON.stringify(r))
    return NextResponse.json({ ok: true, today, mail, ...r })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
