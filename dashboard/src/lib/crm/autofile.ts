/**
 * Automatic filing: give every email thread a company, creating the company when it is new.
 *
 * The scalable unit here is the DOMAIN, not the email. Behind hundreds of unfiled threads sit a
 * few dozen organisations, so we decide once per domain — who is this, and are they a client, an
 * insurer or a partner — and every thread that domain ever touches then files itself for free.
 * A new domain costs one cheap model call; a new email from a known domain costs nothing.
 *
 * Counterparties become companies too. That is what protects the client records: once QBE owns
 * qbe.com, no client can ever be given that domain by mistake.
 *
 * Order of work:
 *   1. seed insurers from the insurer directory so their domains are claimed
 *   2. gather evidence for every unclaimed external domain
 *   3. name and classify those domains (one batched model call per handful)
 *   4. match each name against the companies we already have, else create
 *   5. link every thread that touches a claimed domain
 *   6. for threads with no client-side domain at all, fall back to the name in the subject
 *   7. leave anything still unresolved for the review queue
 */
import { sb, sbTry, inChunks, enc, emailDomain, isInternal, isAutomated, PUBLIC_EMAIL_DOMAINS, normalizeCompany } from './db'
import { buildCompanyIndex, matchByName, companyCore, type CompanyIndex } from './resolve'
import { buildIdentityIndex, matchName, loadAliases, recordAlias, aliasKey, type IdentityIndex } from './identity'
import { geminiJson } from './ai'
import type { Company, CompanyKind } from './types'

// A domain must be at least this convincing before a company is created for it unattended.
const AUTO_CREATE_CONFIDENCE = 0.75
// Above this, a name match is trusted without review.
const AUTO_MATCH_SCORE = 0.8

export interface DomainEvidence {
  domain: string
  threadIds: string[]
  subjects: string[]
  people: string[]
  contactCompanies: string[]
}

export interface DomainDecision {
  domain: string
  name: string
  kind: CompanyKind
  confidence: number
  reason: string
  action: 'linked-existing' | 'created' | 'queued'
  companyId: string | null
  companyName: string | null
  threads: number
}

export interface AutofileResult {
  insurersSeeded: { name: string; domains: string[]; created: boolean }[]
  domains: DomainDecision[]
  threadsLinked: number
  threadsBySubject: number
  queuedThreads: number
  remaining: number
  errors: string[]
}

type ThreadRow = { id: string; subject: string | null; company_id: string | null; contact_id: string | null; contacts: { id: string; email: string | null; company: string | null; company_id: string | null } | null }
type PartRow = { thread_id: string; email: string; name: string | null }

const THREAD_SELECT = 'id,subject,company_id,contact_id,contacts(id,email,company,company_id)'

// ── 1. Counterparty seeding ───────────────────────────────────────────────────────────────────

/** Every insurer in the directory becomes a company, so its domains are permanently claimed. */
async function seedInsurers(dry: boolean, claimed: Map<string, string>): Promise<AutofileResult['insurersSeeded']> {
  const rows = await sbTry<{ insurers: { id: string; name: string } | null; contacts: { email: string | null } | null }[]>(
    `insurer_contacts?select=insurers(id,name),contacts(email)`, [])
  const byInsurer = new Map<string, Set<string>>()
  for (const r of rows) {
    const name = r.insurers?.name
    const d = emailDomain(r.contacts?.email)
    if (!name || !d || PUBLIC_EMAIL_DOMAINS.has(d)) continue
    byInsurer.set(name, (byInsurer.get(name) ?? new Set()).add(d))
  }

  const existing = (await sbTry<Record<string, unknown>[]>(`companies?select=*&limit=1000`, [])).map(normalizeCompany)
  const out: AutofileResult['insurersSeeded'] = []

  for (const [name, domainSet] of Array.from(byInsurer.entries())) {
    const domains = Array.from(domainSet)
    const core = companyCore(name)
    const match = existing.find(c => companyCore(c.name) === core) ?? existing.find(c => c.domains.some(d => domains.includes(d)))
    if (match) {
      const merged = Array.from(new Set([...match.domains, ...domains]))
      const needsUpdate = merged.length !== match.domains.length || match.kind !== 'insurer'
      if (needsUpdate && !dry) {
        await sbTry(`companies?id=eq.${match.id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ domains: merged, domain: merged[0], kind: 'insurer' }) })
      }
      for (const d of merged) claimed.set(d, match.id)
      out.push({ name: match.name, domains: merged, created: false })
      continue
    }
    if (dry) {
      // Claim the domains anyway so the preview does not report the same insurer twice.
      for (const d of domains) claimed.set(d, `dry-insurer-${name}`)
    } else {
      const id = await createCompany({ name, kind: 'insurer', domains, note: 'Seeded from the insurer directory', confidence: 1 })
      if (id) {
        await recordAlias(id, name, 'seed')
        for (const d of domains) claimed.set(d, id)
      }
    }
    out.push({ name, domains, created: true })
  }
  return out
}

// ── Company creation ──────────────────────────────────────────────────────────────────────────

export async function createCompany(input: { name: string; kind: CompanyKind; domains: string[]; note: string; confidence: number }): Promise<string | null> {
  const domains = input.domains.filter(d => d && !PUBLIC_EMAIL_DOMAINS.has(d))
  const full = {
    company_name: input.name.trim(), kind: input.kind,
    stage: input.kind === 'client' ? 'prospect' : 'client',
    stage_changed_at: new Date().toISOString(),
    domains, domain: domains[0] ?? null, source: 'auto',
    auto_created: true, identity_note: `${input.note} (confidence ${input.confidence.toFixed(2)})`, identity_at: new Date().toISOString(),
  }
  try {
    const rows = await sb<{ id: string }[]>('companies', { method: 'POST', body: JSON.stringify(full) })
    return rows[0]?.id ?? null
  } catch {
    // Before 20260911_company_identity.sql the note columns do not exist yet.
    try {
      const rows = await sb<{ id: string }[]>('companies', { method: 'POST', body: JSON.stringify({ company_name: input.name.trim(), kind: input.kind, stage: full.stage, domains, domain: domains[0] ?? null, source: 'auto' }) })
      return rows[0]?.id ?? null
    } catch { return null }
  }
}

export async function attachDomain(company: Company, domain: string, dry: boolean): Promise<void> {
  if (company.domains.includes(domain) || PUBLIC_EMAIL_DOMAINS.has(domain)) return
  const next = [...company.domains, domain]
  company.domains = next
  if (!dry) await sbTry(`companies?id=eq.${company.id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ domains: next, domain: next[0] }) })
}

// ── 3. Naming and classifying a domain ────────────────────────────────────────────────────────

const SYSTEM = `You identify organisations from their email domain for Trade Risk Solutions (TRS), an insurance broker in Singapore. TRS's clients are businesses that buy insurance through TRS. Insurers underwrite it. Partners are the other professionals around a policy: brokers, managing agents, third-party administrators, clinic and panel networks, loss adjusters, law firms and accountants. Answer only from the evidence given. Plain, professional English.`

const SCHEMA = `Return a JSON array with one item per domain given:
{
  "domain": "the domain exactly as supplied",
  "name": "the organisation's proper name, as it would be written on a policy — e.g. 'Mister Mobile Trading Pte Ltd', not 'Mistermobile' and not the domain",
  "kind": "client | insurer | partner | other",
  "confidence": 0.0 to 1.0,
  "reason": "one short sentence"
}
Rules:
- Use the subjects and people to work out the real name; the domain alone is rarely the name.
- "client" only for a business TRS arranges insurance FOR. If the domain belongs to an insurer, an administrator, a clinic network, a broker or a law firm, it is not a client.
- Use "other" for newsletters, software vendors and anything you cannot place.
- Give a confidence below 0.7 whenever the evidence is thin or the name is a guess.`

type RawDecision = { domain?: unknown; name?: unknown; kind?: unknown; confidence?: unknown; reason?: unknown }

export async function classifyDomains(evidence: DomainEvidence[]): Promise<Map<string, { name: string; kind: CompanyKind; confidence: number; reason: string }>> {
  const out = new Map<string, { name: string; kind: CompanyKind; confidence: number; reason: string }>()
  const kinds = new Set(['client', 'insurer', 'partner', 'other'])

  for (let i = 0; i < evidence.length; i += 8) {
    const batch = evidence.slice(i, i + 8)
    const text = batch.map(e => [
      `domain: ${e.domain}`,
      `threads: ${e.threadIds.length}`,
      `people: ${e.people.slice(0, 6).join('; ') || '-'}`,
      `company field on their contacts: ${Array.from(new Set(e.contactCompanies)).slice(0, 4).join('; ') || '-'}`,
      `subjects:\n${e.subjects.slice(0, 6).map(s => `  - ${s}`).join('\n') || '  -'}`,
    ].join('\n')).join('\n\n---\n\n')

    const res = await geminiJson<RawDecision[]>({ system: SYSTEM, prompt: `${SCHEMA}\n\nDOMAINS:\n\n${text}`, feature: 'crm_triage', temperature: 0 })
    if (!res.data || !Array.isArray(res.data)) continue
    for (const r of res.data) {
      const domain = String(r.domain ?? '').toLowerCase().trim()
      const name = String(r.name ?? '').trim()
      if (!domain || !name || !batch.some(b => b.domain === domain)) continue
      const kind = kinds.has(String(r.kind)) ? String(r.kind) as CompanyKind : 'other'
      const confidence = typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0
      out.set(domain, { name, kind, confidence, reason: String(r.reason ?? '').slice(0, 300) })
    }
  }
  return out
}

// ── The pass ──────────────────────────────────────────────────────────────────────────────────

export async function autofile(opts: { dryRun?: boolean; maxDomains?: number } = {}): Promise<AutofileResult> {
  const dry = !!opts.dryRun
  const errors: string[] = []

  const claimed = new Map<string, string>()   // domain → company id (client and counterparty alike)
  const insurersSeeded = await seedInsurers(dry, claimed)

  let index: CompanyIndex = await buildCompanyIndex()
  let allCompanies = (await sbTry<Record<string, unknown>[]>(`companies?select=*&limit=1000`, [])).map(normalizeCompany)
  let identity: IdentityIndex = buildIdentityIndex(allCompanies, await loadAliases())
  const companyById = new Map(allCompanies.map(c => [c.id, c]))
  for (const c of allCompanies) for (const d of c.domains) claimed.set(d, c.id)

  // Threads still without a company, minus any a person has already ruled out.
  const [threads, ruledOut] = await Promise.all([
    sbTry<ThreadRow[]>(`email_threads?company_id=is.null&deleted_at=is.null&select=${THREAD_SELECT}&limit=2000`, []),
    sbTry<{ thread_id: string }[]>(`company_link_suggestions?status=eq.accepted&verdict=eq.not_client&select=thread_id`, []),
  ])
  const skip = new Set(ruledOut.map(r => r.thread_id))
  const open = threads.filter(t => !skip.has(t.id))

  const parts = open.length
    ? await inChunks(open.map(t => t.id), 100, c => sbTry<PartRow[]>(`email_participants?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,email,name`, []))
    : []
  const partsByThread = new Map<string, PartRow[]>()
  for (const p of parts) partsByThread.set(p.thread_id, [...(partsByThread.get(p.thread_id) ?? []), p])

  // 2. Evidence per unclaimed external domain.
  const evidence = new Map<string, DomainEvidence>()
  for (const t of open) {
    const rows = partsByThread.get(t.id) ?? []
    const emails = [t.contacts?.email, ...rows.map(r => r.email)]
    for (const e of emails) {
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

  // Busiest domains first — they unlock the most threads per decision.
  const ranked = Array.from(evidence.values()).sort((a, b) => b.threadIds.length - a.threadIds.length)
    .slice(0, opts.maxDomains ?? 200)

  // 3 + 4. Name each domain, then match or create.
  const classified = ranked.length ? await classifyDomains(ranked) : new Map()
  const decisions: DomainDecision[] = []

  for (const ev of ranked) {
    const guess = classified.get(ev.domain)
    if (!guess) {
      decisions.push({ domain: ev.domain, name: '', kind: 'other', confidence: 0, reason: 'The model returned nothing for this domain.', action: 'queued', companyId: null, companyName: null, threads: ev.threadIds.length })
      continue
    }

    const match = matchName(guess.name, identity)
    if (match && match.score >= AUTO_MATCH_SCORE) {
      const company = companyById.get(match.companyId)
      if (company) {
        await attachDomain(company, ev.domain, dry)
        claimed.set(ev.domain, company.id)
        if (!dry) await recordAlias(company.id, guess.name, 'ai')
        decisions.push({ domain: ev.domain, name: guess.name, kind: company.kind, confidence: guess.confidence, reason: `Same as ${company.name} (matched on ${match.matchedOn})`, action: 'linked-existing', companyId: company.id, companyName: company.name, threads: ev.threadIds.length })
        continue
      }
    }

    if (guess.confidence >= AUTO_CREATE_CONFIDENCE && guess.kind !== 'other') {
      if (dry) {
        decisions.push({ domain: ev.domain, name: guess.name, kind: guess.kind, confidence: guess.confidence, reason: guess.reason, action: 'created', companyId: null, companyName: guess.name, threads: ev.threadIds.length })
        claimed.set(ev.domain, `dry-${ev.domain}`)
      } else {
        const id = await createCompany({ name: guess.name, kind: guess.kind, domains: [ev.domain], note: guess.reason, confidence: guess.confidence })
        if (!id) { errors.push(`Could not create ${guess.name}`); continue }
        await recordAlias(id, guess.name, 'ai')
        const created = normalizeCompany({ id, company_name: guess.name, kind: guess.kind, domains: [ev.domain] })
        allCompanies = [...allCompanies, created]
        companyById.set(id, created)
        claimed.set(ev.domain, id)
        decisions.push({ domain: ev.domain, name: guess.name, kind: guess.kind, confidence: guess.confidence, reason: guess.reason, action: 'created', companyId: id, companyName: guess.name, threads: ev.threadIds.length })
      }
      continue
    }

    decisions.push({ domain: ev.domain, name: guess.name, kind: guess.kind, confidence: guess.confidence, reason: guess.reason, action: 'queued', companyId: null, companyName: null, threads: ev.threadIds.length })
  }

  // Rebuild the indexes so the newly created companies are matchable by the passes below.
  if (!dry) {
    index = await buildCompanyIndex()
    allCompanies = (await sbTry<Record<string, unknown>[]>(`companies?select=*&limit=1000`, [])).map(normalizeCompany)
    identity = buildIdentityIndex(allCompanies, await loadAliases())
    for (const c of allCompanies) { companyById.set(c.id, c); for (const d of c.domains) claimed.set(d, c.id) }
  }

  // 5. Link every thread that touches a claimed domain.
  let threadsLinked = 0, threadsBySubject = 0
  const stillOpen: ThreadRow[] = []
  for (const t of open) {
    const rows = partsByThread.get(t.id) ?? []
    const emails = [t.contacts?.email, ...rows.map(r => r.email)]
    let companyId: string | null = null
    for (const e of emails) {
      const d = emailDomain(e)
      if (!d || isInternal(e) || isAutomated(e)) continue
      const owner = claimed.get(d)
      if (owner && !owner.startsWith('dry-')) { companyId = owner; break }
      if (owner) { companyId = owner; break }
    }
    if (!companyId) { stillOpen.push(t); continue }
    threadsLinked++
    if (!dry && !companyId.startsWith('dry-')) {
      await sbTry(`email_threads?id=eq.${t.id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
      if (t.contacts?.id && !t.contacts.company_id) {
        await sbTry(`contacts?id=eq.${t.contacts.id}&company_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
      }
    }
  }

  // 6. No client-side domain at all — fall back to the client named in the subject.
  const queuedThreads: string[] = []
  for (const t of stillOpen) {
    const hit = matchByName(t.subject, index)
    if (hit) {
      threadsBySubject++
      if (!dry) await sbTry(`email_threads?id=eq.${t.id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: hit.companyId }) })
      continue
    }
    queuedThreads.push(t.id)
  }

  return {
    insurersSeeded, domains: decisions,
    threadsLinked, threadsBySubject,
    queuedThreads: queuedThreads.length,
    remaining: queuedThreads.length,
    errors,
  }
}

/**
 * The live path: resolve one thread on arrival. Deterministic rules first; if the thread carries
 * an unknown external domain, that single domain is named and classified (one cheap call) and the
 * thread files itself. Anything less certain is left for the queue rather than guessed at.
 */
export async function autofileThread(threadId: string): Promise<{ companyId: string | null; via: string }> {
  const rows = await sbTry<ThreadRow[]>(`email_threads?id=eq.${enc(threadId)}&select=${THREAD_SELECT}&limit=1`, [])
  const t = rows[0]
  if (!t || t.company_id) return { companyId: t?.company_id ?? null, via: 'already filed' }

  // Every message on a thread runs this. If we have already looked at this one and could not
  // place it, do not pay for the same answer again — the free domain check below still runs, so
  // it files itself the moment its domain becomes known.
  const considered = await sbTry<{ status: string }[]>(`company_link_suggestions?thread_id=eq.${enc(threadId)}&select=status&limit=1`, [])
  const alreadyConsidered = considered.length > 0

  const parts = await sbTry<PartRow[]>(`email_participants?thread_id=eq.${enc(threadId)}&deleted_at=is.null&select=thread_id,email,name`, [])
  const emails = [t.contacts?.email, ...parts.map(p => p.email)]

  const index = await buildCompanyIndex()
  for (const e of emails) {
    const d = emailDomain(e)
    if (!d || isInternal(e) || isAutomated(e)) continue
    const owner = index.domains.get(d)
    if (owner) {
      await sbTry(`email_threads?id=eq.${threadId}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: owner }) })
      return { companyId: owner, via: 'domain' }
    }
  }

  const unknown = Array.from(new Set(emails
    .filter(e => e && !isInternal(e) && !isAutomated(e))
    .map(e => emailDomain(e))
    .filter(d => d && !PUBLIC_EMAIL_DOMAINS.has(d) && !index.domains.has(d) && !index.excludedDomains.has(d))))

  if (unknown.length > 0 && !alreadyConsidered) {
    const ev: DomainEvidence = {
      domain: unknown[0], threadIds: [t.id], subjects: t.subject ? [t.subject] : [],
      people: parts.filter(p => emailDomain(p.email) === unknown[0]).map(p => p.name ? `${p.name} <${p.email}>` : p.email).slice(0, 6),
      contactCompanies: t.contacts?.company ? [t.contacts.company] : [],
    }
    const classified = await classifyDomains([ev])
    const guess = classified.get(unknown[0])
    if (guess) {
      const allCompanies = (await sbTry<Record<string, unknown>[]>(`companies?select=*&limit=1000`, [])).map(normalizeCompany)
      const identity = buildIdentityIndex(allCompanies, await loadAliases())
      const match = matchName(guess.name, identity)
      let companyId: string | null = null
      if (match && match.score >= AUTO_MATCH_SCORE) {
        const company = allCompanies.find(c => c.id === match.companyId)
        if (company) { await attachDomain(company, unknown[0], false); companyId = company.id }
      } else if (guess.confidence >= AUTO_CREATE_CONFIDENCE && guess.kind !== 'other') {
        companyId = await createCompany({ name: guess.name, kind: guess.kind, domains: [unknown[0]], note: guess.reason, confidence: guess.confidence })
      }
      if (companyId) {
        await recordAlias(companyId, guess.name, 'ai')
        await sbTry(`email_threads?id=eq.${threadId}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
        if (t.contacts?.id) await sbTry(`contacts?id=eq.${t.contacts.id}&company_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
        return { companyId, via: match ? 'domain matched an existing company' : 'new company created' }
      }
    }
  }

  const hit = matchByName(t.subject, index)
  if (hit) {
    await sbTry(`email_threads?id=eq.${threadId}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: hit.companyId }) })
    return { companyId: hit.companyId, via: 'name in the subject' }
  }

  // Record that it was looked at, which both stops the repeat spend above and puts the thread in
  // front of a person on the filing screen.
  if (!alreadyConsidered) {
    await sbTry(`company_link_suggestions?on_conflict=thread_id`, null, {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ thread_id: threadId, verdict: 'unsure', status: 'pending', rationale: 'No company domain on the thread and no known client named in the subject.' }),
    })
  }
  return { companyId: null, via: 'left for review' }
}

export { aliasKey }
