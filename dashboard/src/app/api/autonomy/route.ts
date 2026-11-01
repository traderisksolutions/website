/**
 * GET /api/autonomy → the ladder (every class with its count and status), the day's auto-sends,
 * and whether the kill switch is set. Staff or cron.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadLadder, autoSentToday, killSwitch } from '@/lib/autonomy'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  try {
    const [ladder, sends] = await Promise.all([loadLadder(), autoSentToday()])
    return NextResponse.json({
      ladder, killSwitch: killSwitch(),
      sentToday: sends.map(r => ({ id: r.id, work_item_id: r.work_item_id ?? null, draft_class: r.draft_class, to: r.to_email, subject: r.subject, client: r.work_items?.client_name ?? null, sent_at: r.sent_at })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
