/** GET /api/nexus/companies/[id] → the client's correspondence, open follow-ups and latest analysis. */
import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'
import { loadCompanyNexus } from '@/lib/nexus/company-view'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Company id is not valid')
  try {
    const view = await loadCompanyNexus(id)
    return view ? NextResponse.json(view) : fail('Company not found', 404)
  } catch (e) {
    return errorResponse(e)
  }
}
