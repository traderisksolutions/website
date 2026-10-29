/**
 * GET /api/cron/data-room — daily at 10:00 SGT (vercel.json "0 2 * * *" is taken by gsc-sync, so
 * "45 2 * * *"). Files every attachment from the last 3 days the extractor did not hand over, and
 * retries Drive failures. Bearer CRON_SECRET, like the other crons. ?all=1&batch=N backfills.
 */
import { NextRequest, NextResponse } from 'next/server'
import { catchUp } from '@/lib/documents/ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const bearer = secret !== '' && req.headers.get('authorization') === `Bearer ${secret}`
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    // ?all=1&batch=N runs the backfill over every attachment on file, N at a time (call it again
    // until ingested is 0). The daily run looks at the last 3 days.
    const q = new URL(req.url).searchParams
    const all = q.get('all') === '1'
    const batch = Math.min(Math.max(Number(q.get('batch')) || 120, 1), 400)
    const since = all ? undefined : new Date(Date.now() - 3 * 86_400_000).toISOString()
    const r = await catchUp({ attachments: batch, retries: 1000, since, budgetMs: 240_000 })
    console.log(`[data-room] ingested ${r.ingested}, filed ${r.filed}, failed ${r.failed}`)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    console.error('[data-room] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
