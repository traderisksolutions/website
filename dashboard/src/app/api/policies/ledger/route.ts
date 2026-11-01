/** GET /api/policies/ledger?company_id=<uuid> → { rows }: every policy of the company and its group with its renewal figures. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { getCompanyRenewals } from '@/lib/policies/ledger'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const companyId = req.nextUrl.searchParams.get('company_id') ?? ''
  if (!UUID.test(companyId)) return NextResponse.json({ error: 'company_id is not valid' }, { status: 400 })
  try {
    return NextResponse.json({ rows: await getCompanyRenewals(companyId) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
