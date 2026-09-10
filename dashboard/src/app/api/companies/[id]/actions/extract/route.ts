/** POST /api/companies/[id]/actions/extract → the agent proposes next actions (status "proposed"). */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { getCompany }                from '@/lib/crm/db'
import { extractActions }            from '@/lib/crm/actions'
import { currentUserEmail }          from '@/lib/crm/auth'

export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const user = await currentUserEmail()
    const result = await extractActions(company, user)
    if (result.error && result.created.length === 0) return NextResponse.json({ error: result.error, skipped: result.skipped }, { status: 502 })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
