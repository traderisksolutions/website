/**
 * Deterministic company resolution — no AI, no guessing.
 *
 * A thread belongs to a company when one of these is true, in order of confidence:
 *   1. contact   — its contact already belongs to that company
 *   2. domain    — a participant's email domain is one the company owns
 *   3. name      — the company's name appears in the subject line
 *
 * Rule 3 is what unlocks this dataset: TRS staff put the client's name in almost every subject
 * ("TRS (Liberty) : Renewal for Acme Pte Ltd"), including on mail sent by an insurer about that
 * client — which is exactly where it should be filed.
 *
 * Once a thread is linked, the client-side domains on it are learned back onto the company, so
 * the next email from that domain resolves by rule 2 without anyone typing anything. Learning is
 * deliberately cautious: never a public mailbox, never an insurer or our own domain, never a
 * domain another company already claims, and only after it has been seen on two separate threads.
 */
import { sbTry, inChunks, emailDomain, isInternal, isAutomated, PUBLIC_EMAIL_DOMAINS, normalizeCompany } from './db'
import type { Company } from './types'

// Words that carry no identity, stripped only from the END of a company name so internal words
// ("Fong Group 2023") survive.
const TRAILING_NOISE = [
  'pte ltd', 'pte. ltd.', 'pte limited', 'private limited', 'pte', 'ltd', 'ltd.', 'limited', 'llp', 'llc',
  'inc', 'inc.', 'incorporated', 'corporation', 'corp', 'corp.', 'co', 'co.', 'company',
  'singapore branch', 'singapore', 's pte ltd', 'sg',
]
/** Keys this generic would make ambiguous — never used on their own. */
const TOO_GENERIC = new Set(['china', 'group', 'holdings', 'trading', 'services', 'engineering', 'construction', 'capital', 'management', 'international', 'asia', 'global', 'new', 'the'])

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The distinctive core of a company name: normalised, with trailing legal noise removed. */
export function companyCore(name: string): string {
  let core = normalizeName(name)
  for (let changed = true; changed;) {
    changed = false
    for (const noise of TRAILING_NOISE) {
      const suffix = ` ${normalizeName(noise)}`
      if (core.endsWith(suffix) && core.length > suffix.length) { core = core.slice(0, -suffix.length).trim(); changed = true }
    }
  }
  return core
}

/**
 * Is this domain plausibly the company's own, judged by name alone? Used as the final gate on
 * learning a domain, because an insurer, a broker or a third-party administrator appears on a
 * client's threads just as often as the client does. Short labels (qbe, aia, ihp) never qualify.
 */
export function domainMatchesName(domain: string, companyName: string): boolean {
  const label = (domain.split('.')[0] ?? '').replace(/[^a-z0-9]/g, '')
  if (label.length < 4) return false
  const core = companyCore(companyName)
  const squashed = core.replace(/[^a-z0-9]/g, '')
  if (!squashed) return false
  if (label.includes(squashed) || squashed.includes(label)) return true
  return core.split(' ').some(t => t.length >= 4 && label.includes(t))
}

export interface CompanyIndex {
  companies: Company[]
  byId: Map<string, Company>
  /** domain → company id. Only domains owned by exactly one company. */
  domains: Map<string, string>
  /** search key → company id. Only keys that identify exactly one company. */
  keys: Map<string, string>
  /** Domains we must never treat as a client's own. */
  excludedDomains: Set<string>
}

/** Every key a company can be recognised by in a subject line. */
function keysFor(name: string): string[] {
  const core = companyCore(name)
  if (!core) return []
  const keys = new Set<string>()
  if (core.length >= 4) keys.add(core)
  const tokens = core.split(' ')
  // A distinctive opening — "gembridge capital" for "Gembridge Capital Management Pte Ltd".
  if (tokens.length > 2) {
    const prefix = tokens.slice(0, 2).join(' ')
    if (prefix.length >= 10 && !tokens.slice(0, 2).every(t => TOO_GENERIC.has(t))) keys.add(prefix)
  }
  // A single strong word — "soilbuild", "anywheel", "zoomoov".
  if (tokens.length === 1 && tokens[0].length >= 6) keys.add(tokens[0])
  return Array.from(keys).filter(k => !TOO_GENERIC.has(k))
}

/** Pure index builder — no I/O, so the matching rules can be tested directly. */
export function makeCompanyIndex(companies: Company[], extraExcludedDomains: string[] = []): CompanyIndex {
  const domainOwners = new Map<string, Set<string>>()
  const keyOwners = new Map<string, Set<string>>()
  for (const c of companies) {
    for (const d of c.domains) {
      if (!d || PUBLIC_EMAIL_DOMAINS.has(d)) continue
      domainOwners.set(d, (domainOwners.get(d) ?? new Set()).add(c.id))
    }
    for (const k of keysFor(c.name)) keyOwners.set(k, (keyOwners.get(k) ?? new Set()).add(c.id))
  }
  // A key or domain claimed by more than one company identifies nobody.
  const domains = new Map<string, string>()
  domainOwners.forEach((owners, d) => { if (owners.size === 1) domains.set(d, Array.from(owners)[0]) })
  const keys = new Map<string, string>()
  keyOwners.forEach((owners, k) => { if (owners.size === 1) keys.set(k, Array.from(owners)[0]) })

  const excludedDomains = new Set<string>(Array.from(PUBLIC_EMAIL_DOMAINS))
  for (const d of extraExcludedDomains) if (d) excludedDomains.add(d)
  excludedDomains.add('trade-risksol.com')

  return { companies, byId: new Map(companies.map(c => [c.id, c])), domains, keys, excludedDomains }
}

export async function buildCompanyIndex(): Promise<CompanyIndex> {
  const rows = await sbTry<Record<string, unknown>[]>(`companies?select=*&order=company_name.asc&limit=1000`, [])
  const companies = rows.map(normalizeCompany).filter(c => c.kind === 'client')
  // insurer_contacts became a link table into contacts (migration 20260707) — the address lives
  // on the contact, not here. Reading the dropped column would silently yield an empty exclusion
  // list and let insurer domains be mistaken for a client's own.
  const insurerContacts = await sbTry<{ contacts: { email: string | null } | null }[]>(`insurer_contacts?select=contacts(email)`, [])
  const insurerDomains = insurerContacts.map(r => emailDomain(r.contacts?.email)).filter(Boolean)
  return makeCompanyIndex(companies, insurerDomains)
}

/**
 * Cached index for hot paths like email ingest, which resolves one message at a time. A short
 * time-to-live keeps a long-running instance from missing a company created moments ago.
 */
let cached: { at: number; index: CompanyIndex } | null = null
export async function getCompanyIndex(maxAgeMs = 60_000): Promise<CompanyIndex> {
  if (cached && Date.now() - cached.at < maxAgeMs) return cached.index
  const index = await buildCompanyIndex()
  cached = { at: Date.now(), index }
  return index
}

export type ResolveVia = 'contact' | 'domain' | 'name'
export interface ResolveHit { companyId: string; via: ResolveVia; evidence: string }

/** Match a company name inside a subject line, on word boundaries. */
export function matchByName(subject: string | null | undefined, index: CompanyIndex): ResolveHit | null {
  const hay = ` ${normalizeName(subject ?? '')} `
  if (hay.trim().length === 0) return null
  let best: { key: string; id: string } | null = null
  index.keys.forEach((id, key) => {
    if (!hay.includes(` ${key} `)) return
    if (!best || key.length > best.key.length) best = { key, id }   // longest, most specific match wins
  })
  return best ? { companyId: (best as { key: string; id: string }).id, via: 'name', evidence: `subject contains “${(best as { key: string; id: string }).key}”` } : null
}

export function matchByDomain(emails: (string | null | undefined)[], index: CompanyIndex): ResolveHit | null {
  for (const e of emails) {
    const d = emailDomain(e)
    if (!d || index.excludedDomains.has(d)) continue
    const id = index.domains.get(d)
    if (id) return { companyId: id, via: 'domain', evidence: `${d} belongs to this company` }
  }
  return null
}

/**
 * Resolve one thread. `contactCompanyId` short-circuits everything else; otherwise domain, then
 * the subject line. Used by both the bulk sweep and the live email ingest, so a thread lands in
 * the same place whether it arrives now or is swept later.
 */
export function resolveThread(
  input: { subject: string | null; participantEmails: (string | null | undefined)[]; contactCompanyId?: string | null },
  index: CompanyIndex,
): ResolveHit | null {
  if (input.contactCompanyId && index.byId.has(input.contactCompanyId)) {
    return { companyId: input.contactCompanyId, via: 'contact', evidence: 'the contact already belongs to this company' }
  }
  return matchByDomain(input.participantEmails, index) ?? matchByName(input.subject, index)
}

/** Client-side addresses on a thread: not ours, not an insurer's, not a robot, not a webmail. */
export function clientSideDomains(emails: (string | null | undefined)[], index: CompanyIndex): string[] {
  const out = new Set<string>()
  for (const e of emails) {
    if (!e || isInternal(e) || isAutomated(e)) continue
    const d = emailDomain(e)
    if (d && !index.excludedDomains.has(d)) out.add(d)
  }
  return Array.from(out)
}

// ── Bulk sweep ────────────────────────────────────────────────────────────────────────────────

export interface SweepResult {
  threadsLinked: { id: string; subject: string | null; company: string; via: ResolveVia; evidence: string }[]
  domainsLearned: { domain: string; company: string; threads: number }[]
  contactsLinked: { email: string; company: string }[]
  casesLinked: number
  leadsLinked: number
  quotationsLinked: number
  remaining: number
}

type ThreadRow = { id: string; subject: string | null; company_id: string | null; contact_id: string | null; contacts: { id: string; email: string | null; company_id: string | null } | null }
type PartRow = { thread_id: string; email: string }

const THREAD_SELECT = 'id,subject,company_id,contact_id,contacts(id,email,company_id)'

/**
 * Link everything that can be linked deterministically, learn domains from what got linked, then
 * sweep again with the richer index. `dryRun` reports without writing a thing.
 */
export async function sweepCompanyLinks(opts: { dryRun?: boolean } = {}): Promise<SweepResult> {
  const dry = !!opts.dryRun
  let index = await buildCompanyIndex()

  const [threads, decided] = await Promise.all([
    sbTry<ThreadRow[]>(`email_threads?company_id=is.null&deleted_at=is.null&select=${THREAD_SELECT}&limit=2000`, []),
    sbTry<{ thread_id: string }[]>(`company_link_suggestions?status=eq.accepted&verdict=eq.not_client&select=thread_id`, []),
  ])
  // A person has already said these are not client threads. Leave them alone.
  const skip = new Set(decided.map(r => r.thread_id))
  const open = threads.filter(t => !skip.has(t.id))

  const partRows = open.length
    ? await inChunks(open.map(t => t.id), 100, c => sbTry<PartRow[]>(`email_participants?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,email`, []))
    : []
  const partsByThread = new Map<string, string[]>()
  for (const p of partRows) partsByThread.set(p.thread_id, [...(partsByThread.get(p.thread_id) ?? []), p.email])

  const linked: SweepResult['threadsLinked'] = []
  const linkedThreadIds = new Map<string, string>()   // thread id → company id

  const passOver = (rows: ThreadRow[]) => {
    for (const t of rows) {
      if (linkedThreadIds.has(t.id)) continue
      const emails = [t.contacts?.email, ...(partsByThread.get(t.id) ?? [])]
      const hit = resolveThread({ subject: t.subject, participantEmails: emails, contactCompanyId: t.contacts?.company_id ?? null }, index)
      if (!hit) continue
      linkedThreadIds.set(t.id, hit.companyId)
      linked.push({ id: t.id, subject: t.subject, company: index.byId.get(hit.companyId)?.name ?? '?', via: hit.via, evidence: hit.evidence })
    }
  }
  passOver(open)

  // Learn domains from what the first pass linked, plus what was already linked before today.
  const already = await sbTry<ThreadRow[]>(`email_threads?company_id=not.is.null&deleted_at=is.null&select=${THREAD_SELECT}&limit=2000`, [])
  const alreadyParts = already.length
    ? await inChunks(already.map(t => t.id), 100, c => sbTry<PartRow[]>(`email_participants?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,email`, []))
    : []
  for (const p of alreadyParts) partsByThread.set(p.thread_id, [...(partsByThread.get(p.thread_id) ?? []), p.email])

  const seen = new Map<string, Map<string, Set<string>>>()   // company → domain → thread ids
  const noteDomains = (threadId: string, companyId: string) => {
    for (const d of clientSideDomains(partsByThread.get(threadId) ?? [], index)) {
      if (index.domains.has(d)) continue
      const perCompany = seen.get(companyId) ?? new Map<string, Set<string>>()
      perCompany.set(d, (perCompany.get(d) ?? new Set()).add(threadId))
      seen.set(companyId, perCompany)
    }
  }
  linkedThreadIds.forEach((companyId, threadId) => noteDomains(threadId, companyId))
  for (const t of already) if (t.company_id) noteDomains(t.id, t.company_id)

  // Three independent gates before a domain is believed to belong to a company:
  //   - it must appear on at least two of that company's threads (not a one-off cc)
  //   - no other company may have it on any thread (that pattern means a counterparty:
  //     an insurer, broker or administrator who talks to us about many clients)
  //   - it must look like the company's own name, so an insurer we have never catalogued
  //     still cannot slip through
  const anyAppearance = new Map<string, Set<string>>()   // domain → companies it appears with
  seen.forEach((perCompany, companyId) => perCompany.forEach((_tids, d) => {
    anyAppearance.set(d, (anyAppearance.get(d) ?? new Set()).add(companyId))
  }))
  const domainsLearned: SweepResult['domainsLearned'] = []
  seen.forEach((perCompany, companyId) => perCompany.forEach((tids, domain) => {
    if (tids.size < 2) return
    if ((anyAppearance.get(domain)?.size ?? 0) !== 1) return
    const company = index.byId.get(companyId)
    if (!company || !domainMatchesName(domain, company.name)) return
    domainsLearned.push({ domain, company: company.name, threads: tids.size })
    index.domains.set(domain, companyId)
  }))

  // Second pass: threads that only the newly learned domains can place.
  passOver(open)

  const contactsLinked: SweepResult['contactsLinked'] = []
  if (!dry) {
    for (const [threadId, companyId] of Array.from(linkedThreadIds.entries())) {
      await sbTry(`email_threads?id=eq.${threadId}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
    }
    for (const { domain, company } of domainsLearned) {
      const companyId = index.domains.get(domain)!
      const current = index.byId.get(companyId)
      if (!current || current.domains.includes(domain)) continue
      const next = [...current.domains, domain]
      await sbTry(`companies?id=eq.${companyId}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ domains: next, domain: next[0] }) })
      current.domains = next
      void company
    }
    index = await buildCompanyIndex()
  }

  // Contacts: give every contact whose domain a company owns that company.
  const contacts = await sbTry<{ id: string; email: string | null }[]>(`contacts?company_id=is.null&is_employee=not.eq.true&select=id,email&limit=2000`, [])
  for (const c of contacts) {
    const hit = matchByDomain([c.email], index)
    if (!hit) continue
    contactsLinked.push({ email: c.email ?? '', company: index.byId.get(hit.companyId)?.name ?? '?' })
    if (!dry) await sbTry(`contacts?id=eq.${c.id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: hit.companyId }) })
  }

  // Cases, leads and quotations follow the threads and names.
  let casesLinked = 0, leadsLinked = 0, quotationsLinked = 0

  const cases = await sbTry<{ id: string; name: string }[]>(`cases?company_id=is.null&select=id,name`, [])
  for (const c of cases) {
    const links = await sbTry<{ thread_id: string }[]>(`case_threads?case_id=eq.${c.id}&select=thread_id&order=created_at.asc`, [])
    let companyId: string | null = null
    for (const l of links) {
      companyId = linkedThreadIds.get(l.thread_id) ?? null
      if (!companyId) {
        const row = await sbTry<{ company_id: string | null }[]>(`email_threads?id=eq.${l.thread_id}&select=company_id&limit=1`, [])
        companyId = row[0]?.company_id ?? null
      }
      if (companyId) break
    }
    if (!companyId) companyId = matchByName(c.name, index)?.companyId ?? null
    if (!companyId) continue
    casesLinked++
    if (!dry) await sbTry(`cases?id=eq.${c.id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
  }

  const leads = await sbTry<{ id: string; company: string | null; email: string | null; contact_id: string | null }[]>(`inbound_leads?company_id=is.null&select=id,company,email,contact_id`, [])
  for (const l of leads) {
    const hit = matchByDomain([l.email], index) ?? (l.company ? matchByName(l.company, index) : null)
    if (!hit) continue
    leadsLinked++
    if (!dry) await sbTry(`inbound_leads?id=eq.${l.id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: hit.companyId }) })
  }

  const quotes = await sbTry<{ id: string; company_name: string | null }[]>(`pm_quotations?company_id=is.null&select=id,company_name`, [])
  for (const q of quotes) {
    const hit = q.company_name ? matchByName(q.company_name, index) : null
    if (!hit) continue
    quotationsLinked++
    if (!dry) await sbTry(`pm_quotations?id=eq.${q.id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: hit.companyId }) })
  }

  return {
    threadsLinked: linked, domainsLearned, contactsLinked,
    casesLinked, leadsLinked, quotationsLinked,
    remaining: open.length - linked.length,
  }
}
