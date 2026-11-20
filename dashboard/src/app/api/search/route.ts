/**
 * GET /api/search?q=<words>[&open=1][&limit=n]
 *   → { index: true, threads, people, companies, files }   from thread_search (docs/search.md)
 *   → { index: false }                                       before the migration is applied: the
 *                                                            caller uses /api/engagement/conversations?q=
 * Spotlight (⌘K) and Today › Add email threads. Every connected inbox and Operations; a thread in a
 * colleague's private inbox is listed by its subject, people and files only, marked canOpen false.
 * &open=1 lists only threads the viewer may open.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { searchThreads } from '@/lib/search/thread-search-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 120)
  const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get('limit') ?? 40) || 40))
  try {
    const viewer = (await currentUserEmail())?.toLowerCase() ?? null
    const answer = await searchThreads(q, viewer, { limit, openOnly: req.nextUrl.searchParams.get('open') === '1' })
    return NextResponse.json(answer ?? { index: false })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
