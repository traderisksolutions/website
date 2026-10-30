/** POST /api/nexus/companies/[id]/case → { case_id, linked } — the client's case with every thread linked, ready to analyse. */
import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'
import { sb } from '@/lib/crm/db'
import { ensureCompanyCase } from '@/lib/nexus/company-view'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Company id is not valid')
  try {
    const r = await ensureCompanyCase(id, (path, init) => sb(path, init))
    return r ? NextResponse.json(r) : fail('Company not found', 404)
  } catch (e) {
    return errorResponse(e)
  }
}
