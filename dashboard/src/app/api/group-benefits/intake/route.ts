/**
 * POST /api/group-benefits/intake   { thread_id, message_id? }
 *
 * The group benefits agent's front door. The inbox classifier posts here when it marks a thread
 * `group_benefits`; a signed-in broker can post here to run it again on a thread. Answers at
 * once and does the work after the response, within this function's own time budget, so the
 * classifier is never held open. The work is in src/lib/gb/intake.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/error-log'
import { runGroupBenefitIntake } from '@/lib/gb/intake'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const internal = !!process.env.CRON_SECRET && req.headers.get('x-internal-secret') === process.env.CRON_SECRET
  if (!internal) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const { thread_id, message_id, wait } = await req.json().catch(() => ({})) as
    { thread_id?: string; message_id?: string; wait?: boolean }
  if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

  const run = runGroupBenefitIntake(thread_id, message_id ?? null).catch(e => {
    void logError({ source: 'internal', feature: 'gb_intake', message: e instanceof Error ? e.message : String(e), threadId: thread_id })
    return { status: 'skipped' as const, reason: e instanceof Error ? e.message : String(e) }
  })
  // A broker re-running it waits for the answer; the classifier does not.
  if (wait && !internal) return NextResponse.json(await run)
  waitUntil(run)
  return NextResponse.json({ ok: true, accepted: true }, { status: 202 })
}
