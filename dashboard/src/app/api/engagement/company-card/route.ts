/** GET /api/engagement/company-card?id=<company id> → { company, tasks }: one company and its open to-dos, for the Inbox rail. */
import { NextRequest, NextResponse } from 'next/server'
import { withStaffOrCron } from '@/lib/auth/guard'
import { companyCard } from '@/lib/engagement/company-card'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = withStaffOrCron(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!UUID.test(id)) return NextResponse.json({ error: 'A company id is not valid.' }, { status: 400 })
  try {
    return NextResponse.json(await companyCard(id))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
})
