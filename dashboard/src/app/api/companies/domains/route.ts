/**
 * GET  /api/companies/domains[?read=1] → email domains with no company yet, each with the closest
 *                                      companies already on file; with read=1 (a person's Read
 *                                      button) also the agent's reading of each.
 * POST /api/companies/domains        → { domain, decision: 'assign'|'create'|'ignore', ... }
 *                                      applies the decision and files every thread on that domain.
 */
import { NextRequest, NextResponse } from 'next/server'
import { describeDomains, decideDomain, type DomainDecisionInput } from '@/lib/crm/domains'
import { listClientCompanies }       from '@/lib/crm/db'
import { currentUserEmail }          from '@/lib/crm/auth'
import { visibleThreadIds }          from '@/lib/mail/visibility-server'
import { COMPANY_KINDS }             from '@/lib/crm/types'
import { logActivity }               from '@/lib/log-activity'
import { withStaffOrCron } from '@/lib/auth/guard'

export const maxDuration = 300

export const GET = withStaffOrCron(async (req: NextRequest) => {
  try {
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? 40)
    const [domains, companies] = await Promise.all([
      describeDomains(Math.max(1, Math.min(80, limit)), { read: req.nextUrl.searchParams.get('read') === '1' }),
      listClientCompanies(),
    ])
    // A colleague's private thread is never previewed (INB-002): its subject and opening line stay out.
    const ids = domains.flatMap(d => d.previews.map(p => p.threadId).filter((x): x is string => !!x))
    const seen = await visibleThreadIds(ids, await currentUserEmail())
    const shown = domains.map(d => {
      const previews = d.previews.filter(p => !p.threadId || seen.has(p.threadId)).map(p => ({ subject: p.subject, snippet: p.snippet, date: p.date }))
      return { ...d, previews, subjects: previews.map(p => p.subject).filter((x): x is string => !!x) }
    })
    return NextResponse.json({ domains: shown, companies: companies.map(c => ({ id: c.id, name: c.name, domains: c.domains })) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})

export const POST = withStaffOrCron(async (req: NextRequest) => {
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
})
