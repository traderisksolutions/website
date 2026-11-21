/**
 * GET /api/renewals/forecast → { tables, today, items, owners, notOpened }: every renewal record plus
 * the renewable policies whose record has not opened yet, as forecast items. The page sums them by
 * month (src/lib/renewals/forecast.ts). No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renewalActor, renewalFail } from '@/lib/renewals/http'
import { renewalTablesReady, renewalsToday } from '@/lib/renewals/store'
import { loadForecast } from '@/lib/renewals/pipeline-store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const who = await renewalActor(req)
  if ('refused' in who) return who.refused
  try {
    if (!(await renewalTablesReady())) return NextResponse.json({ tables: false, today: renewalsToday(), items: [], owners: [], notOpened: 0 })
    return NextResponse.json({ tables: true, ...(await loadForecast()) })
  } catch (e) {
    return renewalFail(e)
  }
}
