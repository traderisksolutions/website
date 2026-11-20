/** GET /api/contacts/people → People: every outside contact with its company and the threads the viewer may see. */
import { NextRequest, NextResponse } from 'next/server'
import { currentUserEmail }          from '@/lib/crm/auth'
import { listPeople }                from '@/lib/clients/people'
import { withStaffOrCron } from '@/lib/auth/guard'

export const GET = withStaffOrCron(async (req: NextRequest) => {
  try {
    return NextResponse.json({ people: await listPeople(await currentUserEmail()) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})
