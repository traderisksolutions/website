/** GET /api/companies/misfiled → insurer mail whose subject names a client, grouped by that name. */
import { NextResponse } from 'next/server'
import { listMisfiledThreads, groupMisfiled } from '@/lib/crm/misfiled'
import { listClientCompanies }       from '@/lib/crm/db'
import { withStaffOrCron } from '@/lib/auth/guard'

export const GET = withStaffOrCron(async () => {
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
})
