/** GET /api/companies/[id]/quotes → RFQ lines, pricing-matrix and group-benefits quotations, unified. */
import { NextRequest, NextResponse } from 'next/server'
import { getCompany, getCompanyThreadIds } from '@/lib/crm/db'
import { listCompanyQuotes }         from '@/lib/crm/quotes'
import { withStaffOrCron } from '@/lib/auth/guard'

export const GET = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const threadIds = await getCompanyThreadIds(id)
    const quotes = await listCompanyQuotes(company)
    return NextResponse.json({ quotes })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})
