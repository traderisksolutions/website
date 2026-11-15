/**
 * GET /api/today/mail?relevance=&label=&limit= → every thread the person may see, one row each,
 * newest first: label, who set it, client, open case, with the staff names for "Set by". A thread
 * in a colleague's mailbox is left out.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { mailByLabel } from '@/lib/cases/mail-store'
import { isMailRelevance, MAIL_PAGE } from '@/lib/cases/mail'
import { isLabel } from '@/lib/cases/labels'
import { currentStaff } from '@/lib/casework/queue'
import { todaySGT } from '@/lib/sgt-time'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const q = req.nextUrl.searchParams
  const relevance = q.get('relevance') ?? 'all'
  const label = q.get('label') ?? 'all'
  if (!isMailRelevance(relevance)) return NextResponse.json({ error: 'Unknown view.' }, { status: 400 })
  if (label !== 'all' && !isLabel(label)) return NextResponse.json({ error: 'Unknown label.' }, { status: 400 })
  const limit = Math.min(Math.max(Number(q.get('limit')) || MAIL_PAGE, 1), 20_000)
  try {
    const today = todaySGT()
    const [view, staff] = await Promise.all([mailByLabel(who.actor, { relevance, label, limit }, today), currentStaff()])
    return NextResponse.json({ ...view, staff, me: who.actor, today })
  } catch (e) {
    return caseFail(e)
  }
}
