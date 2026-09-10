/**
 * POST /api/companies/autofile   { dryRun?: boolean; maxDomains?: number }
 *
 * Gives every unfiled thread a company, creating companies for organisations we have not met.
 * Decides once per email domain rather than once per email, so the cost is a handful of model
 * calls no matter how much mail is waiting. `dryRun` reports every decision without writing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { autofile }                  from '@/lib/crm/autofile'
import { logActivity }               from '@/lib/log-activity'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { dryRun, maxDomains } = await req.json().catch(() => ({})) as { dryRun?: boolean; maxDomains?: number }
    const r = await autofile({ dryRun, maxDomains })

    const created = r.domains.filter(d => d.action === 'created')
    const byKind = created.reduce<Record<string, number>>((a, d) => { a[d.kind] = (a[d.kind] ?? 0) + 1; return a }, {})

    if (!dryRun) {
      void logActivity({
        action: 'companies.autofile', resource_type: 'company',
        new_value: { threadsLinked: r.threadsLinked, threadsBySubject: r.threadsBySubject, companiesCreated: created.length, byKind, insurersSeeded: r.insurersSeeded.filter(i => i.created).length },
      })
    }

    return NextResponse.json({
      dryRun: !!dryRun,
      insurersSeeded: { total: r.insurersSeeded.length, created: r.insurersSeeded.filter(i => i.created).length },
      companies: { created: created.length, byKind, linkedExisting: r.domains.filter(d => d.action === 'linked-existing').length, queued: r.domains.filter(d => d.action === 'queued').length },
      threads: { byDomain: r.threadsLinked, bySubject: r.threadsBySubject, stillUnfiled: r.remaining },
      domains: r.domains,
      errors: r.errors,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
