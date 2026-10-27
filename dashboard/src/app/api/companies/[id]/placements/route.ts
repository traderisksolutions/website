/** GET /api/companies/[id]/placements → { bundle: PlacementBundle, positions: LinePosition[] } */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadBundle } from '@/lib/placement/store'
import { derivePositions } from '@/lib/placement/position'
import { errorResponse, fail, isUuid } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Company id is not valid')
  try {
    const bundle = await loadBundle(id)
    return NextResponse.json({ bundle, positions: derivePositions(bundle) })
  } catch (e) {
    return errorResponse(e)
  }
}
