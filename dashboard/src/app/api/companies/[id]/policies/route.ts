/**
 * GET /api/companies/[id]/policies → { policies: PolicyView[] }
 * The company's policy register: every policies row keyed to the company, with billing from
 * the debit notes and (employment benefits) active members and net to date.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { listCompanyPolicies } from '@/lib/policies/spine'
import { errorResponse, fail, isUuid } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Company id is not valid')
  try {
    const policies = await listCompanyPolicies(id)
    return NextResponse.json({ policies })
  } catch (e) {
    return errorResponse(e)
  }
}
