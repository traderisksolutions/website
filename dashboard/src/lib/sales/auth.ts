// Who is acting: a signed-in TRS user (for the audit trail) or the cron bearer.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { isCron, staffUser } from '@/lib/auth/guard'

export const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** The actor's email, or a 401 response. Cron calls act as system:cron. */
export async function actor(req: NextRequest): Promise<{ email: string } | NextResponse> {
  if (isCron(req)) return { email: 'system:cron' }
  const user = await staffUser()
  if (user) return { email: user.email.toLowerCase() }
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
