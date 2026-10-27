/**
 * GET /api/cron/placement-chase — daily at 09:30 SGT (vercel.json "30 1 * * *").
 * Every request whose chase date has passed gets a follow-up draft in the review queue.
 * Bearer CRON_SECRET, like the other crons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runChases } from '@/lib/placement/workflow'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const bearer = secret !== '' && req.headers.get('authorization') === `Bearer ${secret}`
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const r = await runChases(new Date())
    console.log(`[placement-chase] drafted ${r.drafted}, skipped ${r.skipped}`)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    console.error('[placement-chase] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
