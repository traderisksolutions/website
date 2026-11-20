'use server'
/**
 * Unfiled threads (21 Nov 2026): the reads and decisions behind /companies/triage, the thread
 * list's Link and the Inbox's "File all from <domain>". They replace /api/companies/triage,
 * /api/companies/triage/[threadId], /misfiled, /referrals, /domains and /merge.
 * Mail visibility: every list is cut to the threads the signed-in person may see.
 */
import { staffAction } from '@/lib/auth/action'
import { listUnfiledForViewer, decideLink, type TriageDecision } from '@/lib/crm/triage'
import { listMisfiledThreads, groupMisfiled } from '@/lib/crm/misfiled'
import { referralReview } from '@/lib/crm/referral-review'
import { describeDomains, decideDomain, findDuplicates, mergeCompanies, type DomainDecisionInput } from '@/lib/crm/domains'
import { listClientCompanies } from '@/lib/crm/db'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { splitVisible } from '@/lib/crm/threads'
import { isStage } from '@/lib/crm/stage'
import { COMPANY_KINDS } from '@/lib/crm/types'
import { logActivity } from '@/lib/log-activity'

async function companyChoices() {
  return (await listClientCompanies()).map(c => ({ id: c.id, name: c.name, domains: c.domains }))
}

export async function unfiledThreads() {
  return staffAction('unfiled threads', async user => {
    const [{ threads, hidden }, companies] = await Promise.all([listUnfiledForViewer(user.email), companyChoices()])
    return { threads, hidden, companies }
  })
}

export type ThreadDecision = { decision?: string; companyId?: string | null; name?: string; domain?: string | null; stage?: string }

/** Files one thread: accept or reject the suggestion, not a client, link to a company, or create one. */
export async function decideThread(threadId: string, b: ThreadDecision) {
  return staffAction('triage decision', async user => {
    let d: TriageDecision
    switch (b.decision) {
      case 'accept':     d = { decision: 'accept' }; break
      case 'reject':     d = { decision: 'reject' }; break
      case 'not_client': d = { decision: 'not_client' }; break
      case 'link':
        if (!b.companyId) throw new Error('Choose the company.')
        d = { decision: 'link', companyId: b.companyId }; break
      case 'create':
        if (!b.name?.trim()) throw new Error('Name the company.')
        d = { decision: 'create', name: b.name.trim(), domain: b.domain ?? null, stage: isStage(b.stage) ? b.stage : undefined }; break
      default: throw new Error('Unknown decision.')
    }
    const result = await decideLink(threadId, d, user.email)
    if (!result.ok) throw new Error(result.error)
    return result
  })
}

export async function misfiledThreads() {
  return staffAction('misfiled threads', async user => {
    const [all, companies] = await Promise.all([listMisfiledThreads(), companyChoices()])
    const seen = await visibleThreadIds(all.map(t => t.id), user.email)
    const { shown, hidden } = splitVisible(all, seen)
    return { groups: groupMisfiled(shown), total: shown.length, hidden, companies }
  })
}

export async function referralRows() {
  return staffAction('referrals', async user => {
    const rows = await referralReview(user.email)
    return { rows, unchecked: rows.filter(r => !r.checkedAt).length }
  })
}

/** Outside domains with unfiled mail. `read` asks for the deeper read of each domain. */
export async function unknownDomains(opts: { read?: boolean; limit?: number } = {}) {
  return staffAction('domains', async user => {
    const [domains, companies] = await Promise.all([
      describeDomains(Math.max(1, Math.min(80, opts.limit ?? 40)), { read: !!opts.read }),
      companyChoices(),
    ])
    const ids = domains.flatMap(d => d.previews.map(p => p.threadId).filter((x): x is string => !!x))
    const seen = await visibleThreadIds(ids, user.email)
    const shown = domains.map(d => {
      const previews = d.previews.filter(p => !p.threadId || seen.has(p.threadId)).map(p => ({ subject: p.subject, snippet: p.snippet, date: p.date }))
      return { ...d, previews, subjects: previews.map(p => p.subject).filter((x): x is string => !!x) }
    })
    return { domains: shown, companies }
  })
}

export type DomainDecision = { domain?: string | null; decision?: string; companyId?: string | null; name?: string; kind?: string }

/** Files every unfiled thread from a domain: assign to a company, create one, or ignore the domain. */
export async function decideDomainThreads(b: DomainDecision) {
  return staffAction('domain decision', async user => {
    if (!b.domain) throw new Error('Choose the domain.')
    let input: DomainDecisionInput
    if (b.decision === 'assign') {
      if (!b.companyId) throw new Error('Choose the company.')
      input = { decision: 'assign', companyId: b.companyId }
    } else if (b.decision === 'create') {
      if (!b.name?.trim()) throw new Error('Name the company.')
      const kind = (COMPANY_KINDS as readonly string[]).includes(String(b.kind)) ? b.kind as typeof COMPANY_KINDS[number] : 'client'
      input = { decision: 'create', name: b.name.trim(), kind }
    } else if (b.decision === 'ignore') {
      input = { decision: 'ignore' }
    } else {
      throw new Error('Unknown decision.')
    }
    const result = await decideDomain(b.domain, input, user.email)
    void logActivity({ action: 'company.domain_decided', resource_type: 'company', resource_id: result.companyId ?? undefined, new_value: { domain: b.domain, decision: b.decision, threads: result.threadsLinked } })
    return result
  })
}

export async function duplicateCompanies() {
  return staffAction('duplicate companies', async () => {
    const pairs = await findDuplicates()
    return pairs.map(p => ({
      score: p.score, matchedOn: p.matchedOn,
      a: { id: p.a.id, name: p.a.name, kind: p.a.kind, domains: p.a.domains, created_at: p.a.created_at },
      b: { id: p.b.id, name: p.b.name, kind: p.b.kind, domains: p.b.domains, created_at: p.b.created_at },
    }))
  })
}

/** Merges the loser into the winner: its threads, policies and contacts move; the loser goes. */
export async function mergeCompanyInto(loserId: string, winnerId: string) {
  return staffAction('merge companies', async user => {
    if (!loserId || !winnerId) throw new Error('Choose both companies.')
    const r = await mergeCompanies(loserId, winnerId, user.email)
    void logActivity({ action: 'company.merged', resource_type: 'company', resource_id: winnerId, old_value: { merged_from: loserId }, new_value: r.moved })
    return r
  })
}
