/**
 * GET /api/cron/autonomy-send — every 30 minutes, 08:00–18:30 SGT on weekdays (vercel.json).
 * Recounts the ladder, then sends the pending drafts of every class a person switched on, within
 * the caps. ?digest=1 (17:30 SGT) writes the day's digest instead. ?force=1 ignores the hours.
 * Bearer CRON_SECRET, like the other crons; AUTONOMY_AUTOSEND=off stops every send.
 */
import { NextRequest, NextResponse } from 'next/server'
import { autoSendRun, recountLadder, writeDigest } from '@/lib/autonomy'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  if (!(secret !== '' && req.headers.get('authorization') === `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const q = new URL(req.url).searchParams
    if (q.get('digest') === '1') {
      const r = await writeDigest()
      console.log('[autonomy-send] digest', JSON.stringify(r))
      return NextResponse.json({ ok: true, digest: r })
    }
    const ladder = await recountLadder()
    const r = await autoSendRun({ force: q.get('force') === '1' })
    console.log('[autonomy-send]', JSON.stringify({ ladder, considered: r.considered, sent: r.sent, held: r.held.length, failed: r.failed.length, skipped: r.skipped }))
    return NextResponse.json({ ok: true, ladder, ...r })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
