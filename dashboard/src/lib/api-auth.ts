import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TRS_DOMAIN = 'trade-risksol.com'

// middleware.ts's matcher explicitly excludes /api/* (see its `(?!...|api/|...)` negative
// lookahead), so API routes are NOT protected by the app-wide login gate — each route that
// spends real money/quota (Apollo, Gemini, Gmail sends) must check auth itself.
//
// Two legitimate callers exist for these routes: a signed-in staff member driving the UI from
// the browser (has a Supabase session cookie, no server secret available to attach), and a
// cron/trigger calling headlessly (has CRON_SECRET, no user session). Accept either — requiring
// only one would either lock out the manual UI or leave the automated paths unauthenticated.
//
// Returns null when authorized; otherwise a 401 NextResponse to return directly from the route.
export async function requireStaffOrCron(req: NextRequest): Promise<NextResponse | null> {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email?.toLowerCase().endsWith(`@${TRS_DOMAIN}`)) return null
  } catch { /* fall through to unauthorized */ }

  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}
