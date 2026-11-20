/**
 * GET /api/renewals/tasks?who=<email>|all → { tables, today, tasks }: renewal tasks due today or
 * before, not done, on open records (Today › Renewals due). `who` defaults to the person asking.
 * No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renewalActor, renewalFail } from '@/lib/renewals/http'
import { renewalTablesReady, renewalsToday } from '@/lib/renewals/store'
import { loadTasksDue } from '@/lib/renewals/pipeline-store'

export const dynamic = 'force-dynamic'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: NextRequest) {
  const who = await renewalActor(req)
  if ('refused' in who) return who.refused
  const asked = (req.nextUrl.searchParams.get('who') ?? '').trim().toLowerCase()
  const owner = asked === 'all' || EMAIL.test(asked) ? asked : who.actor
  try {
    const today = renewalsToday()
    if (!(await renewalTablesReady())) return NextResponse.json({ tables: false, today, tasks: [] })
    return NextResponse.json({ tables: true, today, tasks: await loadTasksDue(owner, today) })
  } catch (e) {
    return renewalFail(e)
  }
}
