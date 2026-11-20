/** GET /api/companies/misfiled → insurer mail whose subject names a client, grouped by that name; only threads the person may see, `hidden` counts the rest. */
import { NextRequest, NextResponse } from 'next/server'
import { listMisfiledThreads, groupMisfiled } from '@/lib/crm/misfiled'
import { listClientCompanies }       from '@/lib/crm/db'
import { currentUserEmail }          from '@/lib/crm/auth'
import { visibleThreadIds }          from '@/lib/mail/visibility-server'
import { splitVisible }              from '@/lib/crm/threads'
import { withStaffOrCron } from '@/lib/auth/guard'

export const GET = withStaffOrCron(async () => {
  try {
    const [all, companies] = await Promise.all([listMisfiledThreads(), listClientCompanies()])
    // Only the threads the signed-in person may see (INB-002); the rest are a count.
    const seen = await visibleThreadIds(all.map(t => t.id), await currentUserEmail())
    const { shown: rows, hidden } = splitVisible(all, seen)
    return NextResponse.json({
      groups: groupMisfiled(rows),
      total: rows.length,
      hidden,
      companies: companies.map(c => ({ id: c.id, name: c.name, domains: c.domains })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})
