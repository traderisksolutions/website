/** GET /api/companies/referrals → every company of kind partner with what its emails show, for review. */
import { NextResponse } from 'next/server'
import { currentUserEmail }          from '@/lib/crm/auth'
import { referralReview }            from '@/lib/crm/referral-review'
import { withStaffOrCron } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export const GET = withStaffOrCron(async () => {
  try {
    const rows = await referralReview(await currentUserEmail())
    return NextResponse.json({ rows, unchecked: rows.filter(r => !r.checkedAt).length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})
