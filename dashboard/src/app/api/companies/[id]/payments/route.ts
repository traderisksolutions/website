/** GET /api/companies/[id]/payments → debit notes with derived status plus totals by currency. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { loadCompanyPayments }       from '@/lib/crm/payments-server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const { notes, summary } = await loadCompanyPayments(id)
    return NextResponse.json({ notes, summary })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
