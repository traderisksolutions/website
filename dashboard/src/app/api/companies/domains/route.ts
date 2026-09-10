/**
 * GET  /api/companies/domains        → email domains with no company yet, each with the agent's
 *                                      reading and the closest companies already on file.
 * POST /api/companies/domains        → { domain, decision: 'assign'|'create'|'ignore', ... }
 *                                      applies the decision and files every thread on that domain.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { describeDomains, decideDomain, type DomainDecisionInput } from '@/lib/crm/domains'
import { listClientCompanies }       from '@/lib/crm/db'
import { currentUserEmail }          from '@/lib/crm/auth'
import { COMPANY_KINDS }             from '@/lib/crm/types'
import { logActivity }               from '@/lib/log-activity'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? 40)
    const [domains, companies] = await Promise.all([
      describeDomains(Math.max(1, Math.min(80, limit))),
      listClientCompanies(),
    ])
    return NextResponse.json({ domains, companies: companies.map(c => ({ id: c.id, name: c.name, domains: c.domains })) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const b = await req.json() as { domain?: string; decision?: string; companyId?: string; name?: string; kind?: string }
    if (!b.domain) return NextResponse.json({ error: 'domain required' }, { status: 400 })

    let input: DomainDecisionInput
    if (b.decision === 'assign') {
      if (!b.companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
      input = { decision: 'assign', companyId: b.companyId }
    } else if (b.decision === 'create') {
      if (!b.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
      const kind = (COMPANY_KINDS as readonly string[]).includes(String(b.kind)) ? b.kind as typeof COMPANY_KINDS[number] : 'client'
      input = { decision: 'create', name: b.name.trim(), kind }
    } else if (b.decision === 'ignore') {
      input = { decision: 'ignore' }
    } else {
      return NextResponse.json({ error: 'unknown decision' }, { status: 400 })
    }

    const user = await currentUserEmail()
    const result = await decideDomain(b.domain, input, user)
    void logActivity({ action: 'company.domain_decided', resource_type: 'company', resource_id: result.companyId ?? undefined, new_value: { domain: b.domain, decision: b.decision, threads: result.threadsLinked } })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
