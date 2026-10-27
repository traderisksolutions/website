/**
 * GET /api/cron/thread-titles — daily at 10:15 SGT (vercel.json "15 2 * * *").
 * Writes email_threads.display_subject for up to 200 threads that have none, newest first.
 * Idempotent: a titled thread is never selected again. Bearer CRON_SECRET, like the other crons.
 * ?limit=<n> caps the batch for a manual run.
 */
import { NextRequest, NextResponse } from 'next/server'
import { titleUntitledThreads } from '@/lib/crm/thread-title'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const bearer = secret !== '' && req.headers.get('authorization') === `Bearer ${secret}`
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const raw = Number(req.nextUrl.searchParams.get('limit') ?? 200)
    const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.floor(raw))) : 200
    const r = await titleUntitledThreads(limit)
    console.log(`[thread-titles] scanned ${r.scanned}, written ${r.written}, skipped ${r.skipped}`)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    console.error('[thread-titles] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
