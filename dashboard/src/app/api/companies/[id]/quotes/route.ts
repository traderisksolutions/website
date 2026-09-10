/** GET /api/companies/[id]/quotes → RFQ lines, pricing-matrix and group-benefits quotations, unified. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { getCompany, getCompanyThreadIds } from '@/lib/crm/db'
import { listCompanyQuotes }         from '@/lib/crm/quotes'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const threadIds = await getCompanyThreadIds(id)
    const quotes = await listCompanyQuotes(company, threadIds)
    return NextResponse.json({ quotes })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
