/**
 * GET /api/analytics/autonomy/recompute?days=3
 *
 * Recomputes outbound_origin for the last `days` of outgoing mail (default 3), so late ingests
 * and drafts sent after their message was stored are counted. Meant for a daily cron
 * (vercel.json: add "/api/analytics/autonomy/recompute" at a quiet hour). Bearer CRON_SECRET or
 * a signed-in staff member, like the other crons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { computeWindow } from '@/lib/analytics/autonomy/compute'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  try {
    const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get('days') ?? 3) || 3))
    const to = new Date().toISOString()
    const from = new Date(Date.now() - days * 86_400_000).toISOString()
    const r = await computeWindow(from, to, { write: true })
    console.log('[autonomy/recompute]', JSON.stringify({ days, messages: r.messages, byOrigin: r.byOrigin }))
    return NextResponse.json({ ok: true, days, messages: r.messages, byOrigin: r.byOrigin })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
