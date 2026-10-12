// Who is acting: a signed-in TRS user (for the audit trail) or the cron bearer.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

export const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** The actor's email, or a 401 response. Cron calls act as system:cron. */
export async function actor(req: NextRequest): Promise<{ email: string } | NextResponse> {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return { email: 'system:cron' }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) return { email: user.email.toLowerCase() }
  } catch { /* fall through */ }
  return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE })
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
