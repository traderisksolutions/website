/**
 * GET /api/nexus/follow-ups?view=overdue|week|waiting|done&mine=1
 *   → { rows, counts: { overdue, week, waiting, done }, chaseable, mine_count, actor }
 * The Nexus ledger: who owes what, one view at a time, with the counts behind every filter.
 * mine=1 keeps rows whose owner is the signed-in broker.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate } from '@/lib/placement/api'
import { loadLedger } from '@/lib/nexus/ledger'
import { VIEWS, type View } from '@/lib/nexus/rules'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const q = req.nextUrl.searchParams
  const view = (q.get('view') ?? 'overdue') as View
  if (!VIEWS.includes(view)) return fail(`view must be one of ${VIEWS.join(', ')}`)
  try {
    const ledger = await loadLedger({ view, mine: q.get('mine') === '1', actor })
    return NextResponse.json({ ...ledger, actor })
  } catch (e) {
    return errorResponse(e)
  }
}
