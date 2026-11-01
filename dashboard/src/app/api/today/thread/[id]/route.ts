/** GET /api/today/thread/:id → one thread for the review modal, rebuilt messages marked. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadThread } from '@/lib/today/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const thread = await loadThread(id)
    if (!thread) return NextResponse.json({ error: 'Thread not found.' }, { status: 404 })
    return NextResponse.json({ thread })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
