/** GET /api/contacts/people → People: every outside contact with its company and the threads the viewer may see. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { currentUserEmail }          from '@/lib/crm/auth'
import { listPeople }                from '@/lib/clients/people'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json({ people: await listPeople(await currentUserEmail()) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
