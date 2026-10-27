/** GET /api/companies/[id]/drafts → { queue } — every draft waiting on a person for this company. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { errorResponse, fail, isUuid } from '@/lib/placement/api'
import { companyReviewQueue } from '@/lib/policies/queue'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Company id is not valid')
  try {
    return NextResponse.json({ queue: await companyReviewQueue(id) })
  } catch (e) {
    return errorResponse(e)
  }
}
