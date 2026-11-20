/**
 * GET /api/renewals/pipeline → { tables, today, rows }: every renewal record, open and closed, with
 * client, policy, next task and risk flags (docs/renewals.md, release 2). No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renewalActor, renewalFail } from '@/lib/renewals/http'
import { renewalTablesReady, renewalsToday } from '@/lib/renewals/store'
import { loadPipeline } from '@/lib/renewals/pipeline-store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const who = await renewalActor(req)
  if ('refused' in who) return who.refused
  try {
    if (!(await renewalTablesReady())) return NextResponse.json({ tables: false, today: renewalsToday(), rows: [] })
    return NextResponse.json(await loadPipeline())
  } catch (e) {
    return renewalFail(e)
  }
}
