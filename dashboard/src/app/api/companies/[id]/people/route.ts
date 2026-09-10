/** GET /api/companies/[id]/people → correspondents ranked by how much they write to us. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { getCompany }                from '@/lib/crm/db'
import { rankPeople }                from '@/lib/crm/people'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const result = await rankPeople(company)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
