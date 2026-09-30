/** GET /api/companies/misfiled → insurer mail whose subject names a client, grouped by that name. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { listMisfiledThreads, groupMisfiled } from '@/lib/crm/misfiled'
import { listClientCompanies }       from '@/lib/crm/db'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [rows, companies] = await Promise.all([listMisfiledThreads(), listClientCompanies()])
    return NextResponse.json({
      groups: groupMisfiled(rows),
      total: rows.length,
      companies: companies.map(c => ({ id: c.id, name: c.name, domains: c.domains })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
