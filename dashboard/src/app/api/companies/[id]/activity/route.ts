/** GET /api/companies/[id]/activity → merged timeline (emails, money, quotes, cases, actions, stage). */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { getCompany, getCompanyThreadIds, sbTry } from '@/lib/crm/db'
import { loadCompanyPayments }       from '@/lib/crm/payments-server'
import { listCompanyQuotes }         from '@/lib/crm/quotes'
import { listCompanyCases }          from '@/lib/crm/cases'
import { buildActivity }             from '@/lib/crm/activity'
import type { CompanyAction }        from '@/lib/crm/types'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const threadIds = await getCompanyThreadIds(id)
    const [payments, quotes, cases, actions] = await Promise.all([
      loadCompanyPayments(id),
      listCompanyQuotes(company, threadIds),
      listCompanyCases(id, threadIds),
      sbTry<CompanyAction[]>(`company_actions?company_id=eq.${id}&status=eq.done&select=*&order=completed_at.desc&limit=30`, []),
    ])
    const events = await buildActivity(id, { threadIds, payments: payments.notes, quotes, cases, actions })
    return NextResponse.json({ events })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
