/**
 * POST /api/companies/resolve-all   { dryRun?: boolean }
 *
 * Files everything that can be filed deterministically: threads by contact, email domain or the
 * client name in the subject; then learns domains from what was filed and sweeps again; then
 * carries the result into contacts, Nexus cases, inbound leads and quotations. No AI, no guessing.
 * `dryRun` reports exactly what would change without writing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { sweepCompanyLinks }         from '@/lib/crm/resolve'
import { logActivity }               from '@/lib/log-activity'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { dryRun } = await req.json().catch(() => ({})) as { dryRun?: boolean }
    const r = await sweepCompanyLinks({ dryRun })

    const byVia = r.threadsLinked.reduce<Record<string, number>>((acc, t) => { acc[t.via] = (acc[t.via] ?? 0) + 1; return acc }, {})
    if (!dryRun && r.threadsLinked.length > 0) {
      void logActivity({ action: 'companies.resolve_all', resource_type: 'company', new_value: { threads: r.threadsLinked.length, byVia, domains: r.domainsLearned.length, contacts: r.contactsLinked.length } })
    }

    return NextResponse.json({
      dryRun: !!dryRun,
      threads: { linked: r.threadsLinked.length, byVia, remaining: r.remaining, sample: r.threadsLinked.slice(0, 40) },
      domainsLearned: r.domainsLearned,
      aliasesLearned: { count: r.aliasesLearned.length, sample: r.aliasesLearned.slice(0, 15) },
      movedOffCounterparties: { count: r.counterpartyMoved.length, sample: r.counterpartyMoved.slice(0, 20) },
      contacts: { linked: r.contactsLinked.length, sample: r.contactsLinked.slice(0, 20) },
      cases: r.casesLinked, leads: r.leadsLinked, quotations: r.quotationsLinked,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
