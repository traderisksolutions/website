/**
 * POST /api/placements/propose { thread_id } → { proposal: IntakeResult | null }
 * The agent reads the client's thread into proposed lines. Nothing is written.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { proposeFromThread } from '@/lib/placement/workflow'
import { errorResponse, fail, isUuid, readBody } from '@/lib/placement/api'
import { withStaffOrCron } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export const POST = withStaffOrCron(async (req: NextRequest) => {
  const b = await readBody<{ thread_id?: unknown }>(req)
  if (!b || !isUuid(b.thread_id)) return fail('thread_id is required')
  try {
    const proposal = await proposeFromThread(b.thread_id)
    return NextResponse.json({ proposal })
  } catch (e) {
    return errorResponse(e)
  }
})
