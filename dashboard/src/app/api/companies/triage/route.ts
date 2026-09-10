/** GET /api/companies/triage → threads with no company, each with its AI suggestion if one exists. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { listUnlinkedThreads }       from '@/lib/crm/triage'
import { listClientCompanies }       from '@/lib/crm/db'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [threads, companies] = await Promise.all([listUnlinkedThreads(), listClientCompanies()])
    return NextResponse.json({ threads, companies: companies.map(c => ({ id: c.id, name: c.name, domains: c.domains })) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
