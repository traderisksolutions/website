/**
 * GET /api/cron/todo-digest → the to-do digest to each owner (src/lib/today/digest.ts).
 * 08:30 SGT working days: everything open. ?afternoon=1 (14:00 SGT): what moved since the morning.
 * ?dry=1 builds and reports without sending. Bearer CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendTodoDigests } from '@/lib/today/digest'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  if (!(secret !== '' && req.headers.get('authorization') === `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams
  try {
    const r = await sendTodoDigests({ afternoon: q.get('afternoon') === '1', dry: q.get('dry') === '1' })
    console.log('[todo-digest]', JSON.stringify(r))
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
