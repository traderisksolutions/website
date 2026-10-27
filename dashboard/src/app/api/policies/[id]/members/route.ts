/** GET /api/policies/[id]/members → { members, movements, transactions, weekly, position } */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { errorResponse, fail, isUuid } from '@/lib/placement/api'
import { listMembers, listMovements, policyRow } from '@/lib/policies/members'
import { listTransactions } from '@/lib/policies/transactions'
import { listWeeks } from '@/lib/policies/position'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Policy id is not valid')
  try {
    const policy = await policyRow(id)
    if (!policy) return fail('Policy not found', 404)
    const [members, movements, transactions, weekly] = await Promise.all([listMembers(id), listMovements(id), listTransactions(id), listWeeks(id)])
    const net_to_date = Math.round(transactions.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100
    return NextResponse.json({
      members, movements, transactions, weekly,
      position: { pax_active: members.filter(m => m.status === 'active').length, net_to_date, last_week: weekly[0] ?? null },
    })
  } catch (e) {
    return errorResponse(e)
  }
}
