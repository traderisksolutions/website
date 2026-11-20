/** GET /api/companies/triage → threads with no company, each with its AI suggestion if one exists. */
import { NextResponse } from 'next/server'
import { listUnlinkedThreads }       from '@/lib/crm/triage'
import { listClientCompanies }       from '@/lib/crm/db'
import { withStaffOrCron } from '@/lib/auth/guard'

export const GET = withStaffOrCron(async () => {
  try {
    const [threads, companies] = await Promise.all([listUnlinkedThreads(), listClientCompanies()])
    return NextResponse.json({ threads, companies: companies.map(c => ({ id: c.id, name: c.name, domains: c.domains })) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})
