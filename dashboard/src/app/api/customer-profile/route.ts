import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { getCustomerProfile }        from '@/lib/customer-profile'

// GET /api/customer-profile?contactId=X
// The customer-memory layer for Engagement — structured facts (company, policies) plus a
// cross-thread history rollup. See src/lib/customer-profile.ts for the aggregation itself;
// this is a thin auth-gated wrapper, reused as-is by the draft route (called directly, not
// over HTTP, from there).
export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  const contactId = req.nextUrl.searchParams.get('contactId')
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  try {
    const profile = await getCustomerProfile(contactId)
    if (!profile) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    return NextResponse.json(profile)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
