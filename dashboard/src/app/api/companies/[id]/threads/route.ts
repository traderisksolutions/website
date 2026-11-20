/**
 * GET /api/companies/[id]/threads
 * The company's email threads with reply state, who each waits on, latest summary and case links,
 * plus insurer threads that name the company (marked `via`). Only threads the signed-in person may
 * see (src/lib/mail/visibility.ts); the rest are a count, `hidden`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { currentUserEmail }          from '@/lib/crm/auth'
import { listVisibleCompanyThreads } from '@/lib/crm/threads'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    // A staff session always has an email here; null only on a cron call, which sees everything.
    const { threads, hidden } = await listVisibleCompanyThreads(id, await currentUserEmail(), { insurers: true })
    return NextResponse.json({ threads, hidden })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
