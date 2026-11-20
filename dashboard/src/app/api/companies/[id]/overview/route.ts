/** GET /api/companies/[id]/overview → alerts, where we left off, to-do, last threads, stakeholders, status line. */
import { NextRequest, NextResponse } from 'next/server'
import { getCompany }                from '@/lib/crm/db'
import { buildOverview }             from '@/lib/crm/overview'
import { currentUserEmail }          from '@/lib/crm/auth'
import { withStaffOrCron } from '@/lib/auth/guard'

export const GET = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const overview = await buildOverview(company, await currentUserEmail())
    return NextResponse.json({ company, ...overview })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})
