/**
 * GET /api/cron/insurer-threads — daily (vercel.json "50 2 * * *"). Files the last 3 days' threads
 * under their insurers and suggests the policy. ?all=1 sweeps every thread (the backfill).
 * Bearer CRON_SECRET, like the other crons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sweepInsurerThreads } from '@/lib/insurers/thread-sweep'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  if (!(secret !== '' && req.headers.get('authorization') === `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const all = new URL(req.url).searchParams.get('all') === '1'
    const r = await sweepInsurerThreads({ since: all ? undefined : new Date(Date.now() - 3 * 86_400_000).toISOString(), agentLimit: all ? 120 : 40 })
    console.log('[insurer-threads]', JSON.stringify(r))
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
