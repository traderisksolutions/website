/** GET /api/companies/referrals → every company of kind partner with what its emails show, for review. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { currentUserEmail }          from '@/lib/crm/auth'
import { referralReview }            from '@/lib/crm/referral-review'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const rows = await referralReview(await currentUserEmail())
    return NextResponse.json({ rows, unchecked: rows.filter(r => !r.checkedAt).length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
