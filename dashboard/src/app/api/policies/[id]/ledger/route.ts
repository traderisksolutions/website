/** GET /api/policies/[id]/ledger → { policy, lines }: the policy's money in date order. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { getPolicyLedger } from '@/lib/policies/ledger'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Policy id is not valid' }, { status: 400 })
  try {
    const r = await getPolicyLedger(id)
    if (!r) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
