/**
 * GET /api/cron/evals-improve   (scheduled)
 *
 * Closes the self-improvement loop automatically: periodically synthesises the
 * captured draft evaluations into refreshed prompt_overrides for every surface
 * (replies, RFQ, etc). Manual synthesis is still available on the Evals page.
 */
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  try {
    // Vercel cron requests carry the deployment's CRON secret; also allow a header.
    const auth = req.headers.get('authorization') ?? ''
    const secret = process.env.CRON_SECRET ?? ''
    const viaHeader = req.headers.get('x-internal-secret') === secret
    const viaBearer = secret && auth === `Bearer ${secret}`
    // Vercel-scheduled invocations set x-vercel-cron; accept those too.
    const viaVercel = !!req.headers.get('x-vercel-cron')
    if (!viaHeader && !viaBearer && !viaVercel) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const origin = new URL(req.url).origin
    // improve-prompt now requires requireStaffOrCron — forward the same cron secret this route
    // was itself authorized with, or the call 401s.
    const res = await fetch(`${origin}/api/engagement/improve-prompt`, {
      method: 'POST', headers: { Authorization: `Bearer ${secret}` },
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({ ok: res.ok, ...data })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
