/** GET /api/today/thread/:id → one thread for the review modal, rebuilt messages marked. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadThread } from '@/lib/today/data'
import { currentUserEmail } from '@/lib/crm/auth'
import { threadVisibleTo, PRIVATE_THREAD } from '@/lib/mail/visibility-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    if (!(await threadVisibleTo(id, await currentUserEmail()))) return NextResponse.json(PRIVATE_THREAD, { status: 403 })
    const thread = await loadThread(id)
    if (!thread) return NextResponse.json({ error: 'Thread not found.' }, { status: 404 })
    return NextResponse.json({ thread })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
