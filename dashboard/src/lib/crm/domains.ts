/**
 * The domain review queue — the human half of automatic filing.
 *
 * Filing decides once per email domain, so this is where a person confirms the handful the agent
 * would not commit to on its own. Each entry carries what we know (who writes from there, what
 * the subjects say), the agent's reading, and the closest companies already on file, so the
 * choice is usually one click: this is that company, or this is a new one, or this is nobody we
 * need to track.
 */
import { sb, sbTry, inChunks, enc, emailDomain, isInternal, isAutomated, PUBLIC_EMAIL_DOMAINS, normalizeCompany } from './db'
import { buildIdentityIndex, matchName, loadAliases, recordAlias, aliasKey } from './identity'
import { classifyDomains, createCompany, attachDomain, type DomainEvidence } from './autofile'
import type { Company, CompanyKind } from './types'

export interface DomainCandidate {
  domain: string
  threads: number
  people: string[]
  subjects: string[]
  suggestion: { name: string; kind: CompanyKind; confidence: number; reason: string } | null
  nearest: { companyId: string; name: string; kind: CompanyKind; score: number; matchedOn: string }[]
}

type ThreadRow = { id: string; subject: string | null; contacts: { id: string; email: string | null; company: string | null } | null }
type PartRow = { thread_id: string; email: string; name: string | null }

/** Every external domain on an unfiled thread that no company owns yet. */
export async function collectUnclaimedDomains(): Promise<DomainEvidence[]> {
  const companies = (await sbTry<Record<string, unknown>[]>(`companies?select=*&limit=1000`, [])).map(normalizeCompany)
  const claimed = new Set<string>()
  for (const c of companies) for (const d of c.domains) claimed.add(d)

  const [threads, ruledOut] = await Promise.all([
    sbTry<ThreadRow[]>(`email_threads?company_id=is.null&deleted_at=is.null&select=id,subject,contacts(id,email,company)&limit=2000`, []),
    sbTry<{ thread_id: string }[]>(`company_link_suggestions?status=eq.accepted&verdict=eq.not_client&select=thread_id`, []),
  ])
  const skip = new Set(ruledOut.map(r => r.thread_id))
  const open = threads.filter(t => !skip.has(t.id))
  if (open.length === 0) return []

  const parts = await inChunks(open.map(t => t.id), 100, c =>
    sbTry<PartRow[]>(`email_participants?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,email,name`, []))
  const byThread = new Map<string, PartRow[]>()
  for (const p of parts) byThread.set(p.thread_id, [...(byThread.get(p.thread_id) ?? []), p])

  const evidence = new Map<string, DomainEvidence>()
  for (const t of open) {
    const rows = byThread.get(t.id) ?? []
    for (const e of [t.contacts?.email, ...rows.map(r => r.email)]) {
      const d = emailDomain(e)
      if (!d || PUBLIC_EMAIL_DOMAINS.has(d) || isInternal(e) || isAutomated(e) || claimed.has(d)) continue
      const ev = evidence.get(d) ?? { domain: d, threadIds: [], subjects: [], people: [], contactCompanies: [] }
      if (!ev.threadIds.includes(t.id)) ev.threadIds.push(t.id)
      if (t.subject && ev.subjects.length < 8 && !ev.subjects.includes(t.subject)) ev.subjects.push(t.subject)
      for (const r of rows) {
        if (emailDomain(r.email) !== d) continue
        const label = r.name ? `${r.name} <${r.email}>` : r.email
        if (ev.people.length < 8 && !ev.people.includes(label)) ev.people.push(label)
      }
      if (t.contacts?.company && emailDomain(t.contacts.email) === d) ev.contactCompanies.push(t.contacts.company)
      evidence.set(d, ev)
    }
  }
  return Array.from(evidence.values()).sort((a, b) => b.threadIds.length - a.threadIds.length)
}

/** Add the agent's reading and the closest existing companies to each unclaimed domain. */
export async function describeDomains(limit = 40): Promise<DomainCandidate[]> {
  const evidence = (await collectUnclaimedDomains()).slice(0, limit)
  if (evidence.length === 0) return []

  const companies = (await sbTry<Record<string, unknown>[]>(`companies?select=*&limit=1000`, [])).map(normalizeCompany)
  const identity = buildIdentityIndex(companies, await loadAliases())
  const byId = new Map(companies.map(c => [c.id, c]))
  const classified = await classifyDomains(evidence)

  return evidence.map(ev => {
    const guess = classified.get(ev.domain) ?? null
    const nearest: DomainCandidate['nearest'] = []
    // Offer the closest name matches for the agent's reading and for the domain label itself.
    for (const probe of [guess?.name, ev.domain.split('.')[0], ...ev.contactCompanies].filter(Boolean) as string[]) {
      const m = matchName(probe, identity)
      if (!m) continue
      const c = byId.get(m.companyId)
      if (!c || nearest.some(n => n.companyId === c.id)) continue
      nearest.push({ companyId: c.id, name: c.name, kind: c.kind, score: m.score, matchedOn: m.matchedOn })
    }
    return { domain: ev.domain, threads: ev.threadIds.length, people: ev.people, subjects: ev.subjects, suggestion: guess, nearest: nearest.sort((a, b) => b.score - a.score).slice(0, 3) }
  })
}

/**
 * Unfiled threads with anyone from this domain on them. Deliberately independent of whether the
 * domain is already claimed: a decision has to be able to file the backlog for a domain that was
 * claimed a moment ago, or by an earlier run.
 */
export async function threadsOnDomain(domain: string): Promise<string[]> {
  const d = domain.toLowerCase().trim()
  const unfiled = await sbTry<{ id: string }[]>(`email_threads?company_id=is.null&deleted_at=is.null&select=id&limit=2000`, [])
  if (unfiled.length === 0) return []
  const ids = unfiled.map(t => t.id)
  const parts = await inChunks(ids, 100, c =>
    sbTry<{ thread_id: string; email: string }[]>(`email_participants?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,email`, []))
  const hit = new Set<string>()
  for (const p of parts) if (emailDomain(p.email) === d) hit.add(p.thread_id)
  return Array.from(hit)
}

export type DomainDecisionInput =
  | { decision: 'assign'; companyId: string }
  | { decision: 'create'; name: string; kind: CompanyKind }
  | { decision: 'ignore' }

/** Apply a decision to a domain and file every thread it touches. */
export async function decideDomain(domain: string, input: DomainDecisionInput, userEmail: string | null): Promise<{ companyId: string | null; threadsLinked: number }> {
  const d = domain.toLowerCase().trim()
  let companyId: string | null = null

  const threadIds = await threadsOnDomain(d)

  if (input.decision === 'assign') {
    const rows = (await sbTry<Record<string, unknown>[]>(`companies?id=eq.${enc(input.companyId)}&select=*&limit=1`, [])).map(normalizeCompany)
    const company: Company | undefined = rows[0]
    if (!company) throw new Error('That company no longer exists.')
    await attachDomain(company, d, false)
    companyId = company.id
  } else if (input.decision === 'create') {
    companyId = await createCompany({ name: input.name, kind: input.kind, domains: [d], note: `Confirmed by ${userEmail ?? 'staff'} from the domain queue`, confidence: 1 })
    if (!companyId) throw new Error('The company could not be created.')
    await recordAlias(companyId, input.name, 'manual', userEmail)
  }

  // Mark every thread on this domain as handled, either by filing it or by ruling it out.
  let threadsLinked = 0
  for (const threadId of threadIds) {
    if (companyId) {
      await sbTry(`email_threads?id=eq.${threadId}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
      threadsLinked++
    } else {
      await sbTry(`company_link_suggestions?on_conflict=thread_id`, null, {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ thread_id: threadId, verdict: 'not_client', status: 'accepted', rationale: `Domain ${d} marked as nobody we track`, decided_by: userEmail, decided_at: new Date().toISOString() }),
      })
    }
  }
  return { companyId, threadsLinked }
}

/**
 * Fold one company into another: everything that pointed at the duplicate now points at the
 * survivor, the duplicate's names become aliases so the spelling still resolves, and the
 * duplicate row is removed.
 */
export async function mergeCompanies(loserId: string, winnerId: string, userEmail: string | null): Promise<{ moved: Record<string, number> }> {
  if (loserId === winnerId) throw new Error('A company cannot be merged into itself.')
  const rows = (await sbTry<Record<string, unknown>[]>(`companies?id=in.(${enc(loserId)},${enc(winnerId)})&select=*`, [])).map(normalizeCompany)
  const loser = rows.find(c => c.id === loserId)
  const winner = rows.find(c => c.id === winnerId)
  if (!loser || !winner) throw new Error('One of those companies no longer exists.')

  const moved: Record<string, number> = {}
  const move = async (table: string, column = 'company_id') => {
    const before = await sbTry<{ id: string }[]>(`${table}?${column}=eq.${enc(loserId)}&select=id&limit=2000`, [])
    if (before.length === 0) { moved[table] = 0; return }
    await sbTry(`${table}?${column}=eq.${enc(loserId)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ [column]: winnerId }) })
    moved[table] = before.length
  }
  for (const table of ['email_threads', 'contacts', 'cases', 'debit_notes', 'inbound_leads', 'pm_quotations', 'customers', 'company_actions', 'company_contacts', 'pm_classification_tiers']) {
    await move(table)
  }

  // Keep every spelling working, and take over any domain only the duplicate knew.
  await recordAlias(winnerId, loser.name, 'manual', userEmail)
  await sbTry(`company_aliases?company_id=eq.${enc(loserId)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: winnerId }) })
  const domains = Array.from(new Set([...winner.domains, ...loser.domains]))
  if (domains.length !== winner.domains.length) {
    await sbTry(`companies?id=eq.${enc(winnerId)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ domains, domain: domains[0] }) })
  }

  await sb(`companies?id=eq.${enc(loserId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  return { moved }
}

/**
 * Companies that look like the same organisation recorded twice. These are candidates for a
 * person to judge, never merged automatically, so the bar is deliberately lower than the bar for
 * filing: a short name that opens a longer one ("BLL" against "BLL's Transportation and Trading")
 * is worth showing even though it is too weak to act on unattended.
 */
export async function findDuplicates(): Promise<{ a: Company; b: Company; score: number; matchedOn: string }[]> {
  const companies = (await sbTry<Record<string, unknown>[]>(`companies?select=*&limit=1000`, [])).map(normalizeCompany)
  const out: { a: Company; b: Company; score: number; matchedOn: string }[] = []
  const seen = new Set<string>()
  const add = (a: Company, b: Company, score: number, matchedOn: string) => {
    const key = [a.id, b.id].sort().join(':')
    if (seen.has(key)) return
    seen.add(key)
    const sharesDomain = a.domains.some(d => b.domains.includes(d))
    out.push({ a, b, score: sharesDomain ? 1 : score, matchedOn })
  }

  for (const c of companies) {
    const others = companies.filter(o => o.id !== c.id)
    const m = matchName(c.name, buildIdentityIndex(others, []))
    if (!m || m.score < 0.75) continue
    const other = companies.find(o => o.id === m.companyId)
    if (other) add(c, other, m.score, m.matchedOn)
  }

  // One name opening another, which the filing rules deliberately ignore as too weak.
  const cores = companies.map(c => ({ c, core: aliasKey(c.name) })).filter(x => x.core)
  for (let i = 0; i < cores.length; i++) {
    for (let j = i + 1; j < cores.length; j++) {
      const [x, y] = [cores[i], cores[j]]
      const [short, long] = x.core.length <= y.core.length ? [x, y] : [y, x]
      if (short.core === long.core) { add(short.c, long.c, 0.9, short.core); continue }
      if (!long.core.startsWith(`${short.core} `)) continue
      const firstToken = short.core.split(' ')[0]
      if (firstToken.length < 3) continue
      add(short.c, long.c, 0.7, short.core)
    }
  }
  return out.sort((p, q) => q.score - p.score)
}
