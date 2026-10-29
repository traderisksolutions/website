/**
 * GET /api/cron/data-room — daily at 10:00 SGT (vercel.json "0 2 * * *" is taken by gsc-sync, so
 * "45 2 * * *"). Files every attachment from the last 3 days the extractor did not hand over, and
 * retries Drive failures. Bearer CRON_SECRET, like the other crons.
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
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString()
    const r = await catchUp({ attachments: 120, retries: 40, since })
    console.log(`[data-room] ingested ${r.ingested}, filed ${r.filed}, failed ${r.failed}`)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    console.error('[data-room] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
