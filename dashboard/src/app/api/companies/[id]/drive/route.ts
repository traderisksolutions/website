/**
 * POST /api/companies/[id]/drive → { url }
 * Finds or creates the company's Drive folder (the one debit notes archive into) and returns its
 * link. POST because the first call creates the folder.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { getCompany } from '@/lib/crm/db'
import { ensureCompanyFolder } from '@/lib/company-drive'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ url: await ensureCompanyFolder(company.name) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Drive folder failed' }, { status: 500 })
  }
}
