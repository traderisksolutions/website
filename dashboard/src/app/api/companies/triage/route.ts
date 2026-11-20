/**
 * GET /api/companies/triage → threads with no company that the signed-in person may see, each with
 * its suggestion when made in the last 14 days; `hidden` counts colleagues' private ones.
 */
import { NextRequest, NextResponse } from 'next/server'
import { listUnfiledForViewer }      from '@/lib/crm/triage'
import { currentUserEmail }          from '@/lib/crm/auth'
import { listClientCompanies }       from '@/lib/crm/db'
import { withStaffOrCron } from '@/lib/auth/guard'

export const GET = withStaffOrCron(async () => {
  try {
    const [{ threads, hidden }, companies] = await Promise.all([listUnfiledForViewer(await currentUserEmail()), listClientCompanies()])
    return NextResponse.json({ threads, hidden, companies: companies.map(c => ({ id: c.id, name: c.name, domains: c.domains })) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})
