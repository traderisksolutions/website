/**
 * POST → { tables, opened, due }. Opens a renewal record, with its four tasks, for every policy whose
 * day has come (120 days before expiry, 180 for Employment Benefits) and that has never had one.
 * Running it twice opens nothing new. A person's button calls it; it is not in the admin sweep yet.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renewalActor, renewalFail } from '@/lib/renewals/http'
import { openDueRenewals } from '@/lib/renewals/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const who = await renewalActor(req)
  if ('refused' in who) return who.refused
  try {
    return NextResponse.json(await openDueRenewals())
  } catch (e) {
    return renewalFail(e)
  }
}
