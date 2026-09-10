/** GET /api/companies/[id]/overview → alerts, where we left off, to-do, last threads, stakeholders, status line. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { getCompany }                from '@/lib/crm/db'
import { buildOverview }             from '@/lib/crm/overview'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const overview = await buildOverview(company)
    return NextResponse.json({ company, ...overview })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
