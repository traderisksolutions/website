/**
 * POST /api/companies/triage/run   { mode: 'exact' | 'suggest', limit? }
 *   exact   → link threads whose contact or email domain already maps to a client company
 *   suggest → ask the agent to propose a company for threads that have no suggestion yet
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { runExactLinking, suggestLinks } from '@/lib/crm/triage'

export const maxDuration = 150

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { mode, limit } = await req.json().catch(() => ({})) as { mode?: string; limit?: number }
    if (mode === 'exact') return NextResponse.json(await runExactLinking())
    if (mode === 'suggest') {
      const r = await suggestLinks({ limit: typeof limit === 'number' ? Math.max(1, Math.min(60, limit)) : undefined })
      if (r.error && r.suggested === 0) return NextResponse.json(r, { status: 502 })
      return NextResponse.json(r)
    }
    return NextResponse.json({ error: 'mode must be exact or suggest' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
