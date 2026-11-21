/**
 * GET /api/cron/microsoft — the Microsoft folder watch (src/lib/microsoft/watch.ts). Bearer
 * CRON_SECRET, like the other crons. Answers { off: true } until MS_GRAPH=on and the app's
 * credentials are set. Not scheduled: Jarod adds a schedule when the connection is approved
 * (docs/expenses.md › Proposed).
 */
import { NextResponse } from 'next/server'
import { withCron } from '@/lib/auth/guard'
import { watchMicrosoftFolder } from '@/lib/microsoft/watch'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export const GET = withCron(async () => {
  try {
    return NextResponse.json(await watchMicrosoftFolder())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}, { error: 'Unauthorized' })
