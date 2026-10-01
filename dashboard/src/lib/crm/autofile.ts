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
 *   4. match each domain's stem, then each name, against the companies we already have —
 *      including the ones born from a debit note that have a name but no domain yet
 *   5. otherwise CREATE, whatever the model's confidence, and mark the record unconfirmed
 *      for a person to glance at. A queue nobody clears is what left mail unfiled for a week.
 *   6. link every thread that touches a claimed domain
 *   7. for threads with no client-side domain at all, fall back to the name in the subject
 *   8. give every contact a company from their email domain
 *
 * Only threads carrying nothing but personal or excluded addresses are left for a person.
 */
import { sb, sbTry, inChunks, enc, emailDomain, isInternal, isAutomated, PUBLIC_EMAIL_DOMAINS, NOT_A_CLIENT_DOMAINS, normalizeCompany } from './db'
import { buildCompanyIndex, matchByName, companyCore, domainSuitsName, domainMatchesName, type CompanyIndex } from './resolve'
import { buildIdentityIndex, matchName, loadAliases, recordAlias, aliasKey, type IdentityIndex } from './identity'
import { geminiJson } from './ai'
import { GEMINI_LITE } from '@/lib/gemini-models'
import type { Company, CompanyKind } from './types'

// Above this, a name match is trusted without review.
const AUTO_MATCH_SCORE = 0.8

export interface DomainEvidence {
  domain: string
  threadIds: string[]
  subjects: string[]
  people: string[]
  contactCompanies: string[]
  /** Insurers and partners already on file who appear on the same threads. The strongest signal
   *  there is: an insurer writes to TRS *about* a client, so their presence argues this domain
   *  is the client, and their absence argues it is a counterparty itself. */
  counterparties: string[]
  /** Other outside domains copied on the same threads, with how often. */
  alsoOn: { domain: string; threads: number }[]
  /** Subject and opening line per thread, so a person can read the queue without leaving it. */
  previews: { subject: string | null; snippet: string | null; date: string | null }[]
  /** Who opened the conversation: mail from them, against mail TRS sent them. */
  inbound: number
  outbound: number
  /** The TRS people who handle it. A claims handler and a new-business broker mean different things. */
  handledBy: string[]
}

/** An empty evidence record. Every field present, so a partial builder cannot drop one. */
export function blankEvidence(domain: string): DomainEvidence {
  return { domain, threadIds: [], subjects: [], people: [], contactCompanies: [], counterparties: [], alsoOn: [], previews: [], inbound: 0, outbound: 0, handledBy: [] }
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
  /** Contacts given a company from their email domain at the end of the sweep. */
  contactsLinked: number
  errors: string[]
}

type ThreadRow = { id: string; subject: string | null; snippet: string | null; last_message_at: string | null; company_id: string | null; contact_id: string | null; contacts: { id: string; email: string | null; company: string | null; company_id: string | null } | null }
type PartRow = { thread_id: string; email: string; name: string | null }

const THREAD_SELECT = 'id,subject,snippet,last_message_at,company_id,contact_id,contacts(id,email,company,company_id)'

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
    // The directory is hand-kept and occasionally holds a contact at an unrelated address — a
    // vendor or a colleague filed under an insurer. Trusting it blindly hands that insurer
    // somebody else's domain and every thread on it, so the name has to fit the domain.
    if (!domainSuitsName(d, name)) continue
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
    // Everyone we deal with is a client until sales outreach is wired up and can tell us
    // otherwise; "prospect" belongs to that flow, not to a company we are already emailing.
    stage: 'client',
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

const SYSTEM = `You identify an organisation from its email domain for Trade Risk Solutions (TRS), a commercial insurance broker in Singapore.

TRS sits between two sides, and every domain you see is one of four things:

- client   — a business that buys insurance THROUGH TRS. Usually an operating company: a
             contractor, a logistics firm, a restaurant group, a clinic, a manufacturer. They ask
             TRS for cover, quotes, renewals, certificates and claims help.
- insurer  — a company that UNDERWRITES the risk and issues the policy. In Singapore these are
             names like AIA, Chubb, QBE, MSIG, Income, Great Eastern, Liberty, Sompo, Tokio
             Marine, Zurich, Allianz, ECICS, EQ Insurance, HL Assurance, Etiqa, Raffles Health.
             They quote, issue policy numbers, and pay claims.
- partner  — everyone else professional around a policy: other brokers and managing agents,
             third-party administrators, clinic and panel networks, loss adjusters, surveyors,
             law firms, accountants, banks issuing bonds, reinsurers.
- other    — not part of the business at all: newsletters, vendors selling to TRS, recruiters,
             software, personal mail, spam.

HOW TO READ THE EVIDENCE

1. TRS subject lines follow a house convention, and it is the strongest evidence you have:
       "(TRS) <Insurer> - <Client> | <cover>"      e.g. "(TRS) Liberty - BLL Transport | Motor"
       "TRS (<Insurer>) : <Client> - <matter>"     e.g. "TRS (QBE) : Talent Trader - Renewal"
   So if the domain you are judging appears in the FIRST slot it is probably the insurer, and in
   the SECOND slot probably the client. Staff are not perfectly consistent, so weigh it, do not
   obey it.

2. "Insurers and partners also on these threads" is a counterparty list. An insurer writes to TRS
   ABOUT a client, so when known insurers sit on the same threads, this domain is very likely the
   client being discussed. When no counterparty appears and the domain itself quotes, issues
   policy numbers or asks for underwriting information, it is more likely an insurer or partner.

3. Direction matters. A domain that mostly writes IN with enquiries is usually a client or a
   counterparty answering. A domain TRS mostly writes OUT to, cold, may be a prospect or nobody.

4. Cover words in a subject (WIC, D&O, PI, GPA, cargo, performance bond, employee benefits) name
   a product, never an organisation. Never return one as a name.

NAMING

Return the organisation's proper trading name as a person would write it on a debit note, not the
domain string. "getsolar.ai" is "GetSolar", not "Getsolar.ai". Keep a legal suffix only when the
evidence shows it ("Pte Ltd", "LLP", "Sdn Bhd"). Never invent one.

Answer only from the evidence given. If the evidence does not support a confident answer, say so
in the confidence rather than inventing a story. Plain, professional English, no marketing words.`

const SCHEMA = `Return a JSON array, one object per domain given, in the same order:

{
  "domain": "the domain exactly as given",
  "name": "the organisation's trading name",
  "kind": "client" | "insurer" | "partner" | "other",
  "confidence": 0.0 to 1.0,
  "reason": "one short sentence saying what this organisation is and what it does with TRS",
  "evidence": "the single line of evidence that decided it, quoted or named",
  "alternative": { "kind": "...", "why": "..." } | null
}

Rules:
- One object per domain. Never merge two domains, never invent one.
- confidence below 0.7 whenever the evidence is thin, the name is a guess, or the kind is a
  close call between two readings.
- Fill "alternative" whenever a second reading is genuinely possible, and leave it null when the
  evidence is clear. A wrong insurer is expensive: if a client domain is recorded as an insurer,
  that client's mail files under the wrong side for good.
- "evidence" must point at something actually given to you: a subject line, a person, a
  counterparty name, the direction of the mail. Never a general impression.`

type RawDecision = { domain?: unknown; name?: unknown; kind?: unknown; confidence?: unknown; reason?: unknown; evidence?: unknown; alternative?: { kind?: unknown; why?: unknown } | null }

export type DomainGuess = { name: string; kind: CompanyKind; confidence: number; reason: string; evidence: string | null; alternative: { kind: CompanyKind; why: string } | null }

export async function classifyDomains(evidence: DomainEvidence[]): Promise<Map<string, DomainGuess>> {
  const out = new Map<string, DomainGuess>()
  const kinds = new Set(['client', 'insurer', 'partner', 'other'])

  for (let i = 0; i < evidence.length; i += 8) {
    const batch = evidence.slice(i, i + 8)
    const text = batch.map(e => [
      `domain: ${e.domain}`,
      `threads: ${e.threadIds.length}  (${e.inbound} from them, ${e.outbound} from TRS)`,
      `people writing from this domain: ${e.people.slice(0, 6).join('; ') || '-'}`,
      `company written on their contact records: ${Array.from(new Set(e.contactCompanies)).slice(0, 4).join('; ') || '-'}`,
      `insurers and partners also on these threads: ${e.counterparties.slice(0, 8).join('; ') || 'none'}`,
      `other outside domains copied in: ${e.alsoOn.slice(0, 6).map(a => a.domain).join('; ') || 'none'}`,
      `TRS people handling it: ${e.handledBy.slice(0, 4).join('; ') || '-'}`,
      `subject lines on these threads: ${Array.from(new Set(e.subjects)).slice(0, 8).join(' | ') || '-'}`,
      `threads:\n${e.previews.slice(0, 6).map(p => `  - ${p.subject ?? '(no subject)'}${p.snippet ? `\n      ${p.snippet.slice(0, 300)}` : ''}`).join('\n') || '  -'}`,
    ].join('\n')).join('\n\n---\n\n')

    // Housekeeping tier: naming and classifying a domain from subjects and counterparties is a
    // short structured judgement, batched a handful at a time. Lite answers it at $0.0002 per
    // domain, and the decision is reviewable in the domain queue either way.
    const res = await geminiJson<RawDecision[]>({ system: SYSTEM, prompt: `${SCHEMA}\n\nDOMAINS:\n\n${text}`, feature: 'crm_triage', model: GEMINI_LITE, temperature: 0 })
    if (!res.data || !Array.isArray(res.data)) {
      // Say so. Without this the sweep quietly names every domain after its own stem.
      console.error(`[autofile] domain classification returned nothing for ${batch.length} domains: ${res.error ?? 'no data'}`)
      continue
    }
    for (const r of res.data) {
      const domain = String(r.domain ?? '').toLowerCase().trim()
      const name = String(r.name ?? '').trim()
      if (!domain || !name || !batch.some(b => b.domain === domain)) continue
      const kind = kinds.has(String(r.kind)) ? String(r.kind) as CompanyKind : 'other'
      const confidence = typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0
      const altKind = r.alternative && kinds.has(String(r.alternative.kind)) ? String(r.alternative.kind) as CompanyKind : null
      out.set(domain, {
        name, kind, confidence,
        reason: String(r.reason ?? '').slice(0, 300),
        evidence: r.evidence ? String(r.evidence).slice(0, 300) : null,
        alternative: altKind && altKind !== kind ? { kind: altKind, why: String(r.alternative?.why ?? '').slice(0, 200) } : null,
      })
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
      const ev = evidence.get(d) ?? blankEvidence(d)
      if (!ev.threadIds.includes(t.id)) ev.threadIds.push(t.id)
      if (t.subject && ev.subjects.length < 8 && !ev.subjects.includes(t.subject)) ev.subjects.push(t.subject)
      // The classifier prompt reads `previews`, not `subjects`. This loop filled only the
      // latter, so in the sweep the model was shown "threads: -" and had nothing but the domain
      // string to name the organisation from — which is why it returned stems like "Getsolar"
      // and "Fengchen" instead of the name people actually write in their mail.
      if (ev.previews.length < 6 && !ev.previews.some(p => p.subject === t.subject)) {
        ev.previews.push({ subject: t.subject, snippet: t.snippet, date: t.last_message_at })
      }
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
    if (NOT_A_CLIENT_DOMAINS.has(ev.domain)) {
      decisions.push({ domain: ev.domain, name: '', kind: 'other', confidence: 1, reason: 'On the not-a-client list.', action: 'queued', companyId: null, companyName: null, threads: ev.threadIds.length })
      continue
    }

    // The domain's stem names a company we already have — typically one born from a debit
    // note with a name and no domain. Attach rather than create a twin.
    const stemHits = allCompanies.filter(c => c.kind === 'client' && domainMatchesName(ev.domain, c.name))
    if (stemHits.length === 1) {
      const company = stemHits[0]
      await attachDomain(company, ev.domain, dry)
      claimed.set(ev.domain, company.id)
      decisions.push({ domain: ev.domain, name: company.name, kind: company.kind, confidence: 0.9, reason: `The domain names ${company.name}`, action: 'linked-existing', companyId: company.id, companyName: company.name, threads: ev.threadIds.length })
      continue
    }

    const guess = classified.get(ev.domain) ?? null
    const signed = ev.contactCompanies.find(n => n && n.trim().length >= 3)?.trim()
    const name = guess?.name?.trim() || signed || nameFromDomain(ev.domain)
    const kind: CompanyKind = guess
      ? (guess.kind === 'insurer' || guess.kind === 'partner') ? guess.kind
        : (guess.kind === 'other' && guess.confidence >= 0.6) ? 'partner'
        : 'client'
      : 'client'
    const confidence = guess?.confidence ?? 0
    const reason = guess?.reason ?? `Named from the domain; the model did not answer.`

    const match = matchName(name, identity)
    if (match && match.score >= AUTO_MATCH_SCORE) {
      const company = companyById.get(match.companyId)
      if (company) {
        await attachDomain(company, ev.domain, dry)
        claimed.set(ev.domain, company.id)
        if (!dry) await recordAlias(company.id, name, 'ai')
        decisions.push({ domain: ev.domain, name, kind: company.kind, confidence, reason: `Same as ${company.name} (matched on ${match.matchedOn})`, action: 'linked-existing', companyId: company.id, companyName: company.name, threads: ev.threadIds.length })
        continue
      }
    }

    // Create, whatever the confidence. A weak guess becomes an unconfirmed record a person
    // renames in a second; a queue nobody clears is what left 11 threads unfiled for a week.
    if (dry) {
      decisions.push({ domain: ev.domain, name, kind, confidence, reason, action: 'created', companyId: null, companyName: name, threads: ev.threadIds.length })
      claimed.set(ev.domain, `dry-${ev.domain}`)
    } else {
      const id = await createCompany({ name, kind, domains: [ev.domain], note: reason, confidence })
      if (!id) { errors.push(`Could not create ${name}`); continue }
      await recordAlias(id, name, 'ai')
      await sbTry(`companies?id=eq.${id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ confirmed_at: null }) })
      const created = normalizeCompany({ id, company_name: name, kind, domains: [ev.domain] })
      allCompanies = [...allCompanies, created]
      companyById.set(id, created)
      claimed.set(ev.domain, id)
      decisions.push({ domain: ev.domain, name, kind, confidence, reason, action: 'created', companyId: id, companyName: name, threads: ev.threadIds.length })
    }
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

  const contactsLinked = opts.dryRun ? 0 : await linkContactsByDomain().catch(() => 0)

  return {
    insurersSeeded, domains: decisions,
    threadsLinked, threadsBySubject,
    queuedThreads: queuedThreads.length,
    remaining: queuedThreads.length,
    contactsLinked,
    errors,
  }
}

/**
 * The live path: resolve one thread the moment it arrives. This is the locked workflow.
 *
 *   1. A domain we already know → file under its owner.
 *   2. A domain nobody owns, but whose stem matches an existing company's name (@flavia →
 *      "Flavia Holdings Pte Ltd") → attach the domain to that company and file. This is how a
 *      client that first arrived by debit note, with a name and no domain, is found by their
 *      first email instead of being created twice.
 *   3. The organisation named in the sender's signature matches a company → same.
 *   4. The client is named in the subject → file.
 *   5. Otherwise a company is CREATED for the domain — named by the model when it answers,
 *      from the domain itself when it does not — and marked unconfirmed for a person to
 *      glance at. Nothing waits in a queue; every email files somewhere.
 *
 * Domains on the not-a-client list (our sister company, ISPs) and insurer-owned domains never
 * become clients.
 */
export async function autofileThread(threadId: string): Promise<{ companyId: string | null; via: string }> {
  type ThreadRow = { id: string; subject: string | null; company_id: string | null; contacts: { id: string; email: string | null; company: string | null; company_id: string | null } | null }
  type PartRow = { thread_id: string; email: string; name: string | null }

  const rows = await sbTry<ThreadRow[]>(`email_threads?id=eq.${enc(threadId)}&select=id,subject,company_id,contacts(id,email,company,company_id)&limit=1`, [])
  const t = rows[0]
  if (!t || t.company_id) return { companyId: t?.company_id ?? null, via: 'already filed' }

  const parts = await sbTry<PartRow[]>(`email_participants?thread_id=eq.${enc(threadId)}&deleted_at=is.null&select=thread_id,email,name`, [])
  const emails = [t.contacts?.email, ...parts.map(p => p.email)]

  const index = await buildCompanyIndex()
  const file = async (companyId: string, via: string) => {
    await sbTry(`email_threads?id=eq.${threadId}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
    if (t.contacts?.id && !t.contacts.company_id) {
      await sbTry(`contacts?id=eq.${t.contacts.id}&company_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
    }
    // Close any earlier "could not place this" placeholder so the queue stays honest.
    await sbTry(`company_link_suggestions?thread_id=eq.${enc(threadId)}&status=eq.pending`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'accepted', verdict: 'existing', suggested_company_id: companyId, decided_at: new Date().toISOString(), decided_by: 'autofile' }) })
    return { companyId, via }
  }

  // 1. Known domain.
  for (const e of emails) {
    const d = emailDomain(e)
    if (!d || isInternal(e) || isAutomated(e)) continue
    const owner = index.domains.get(d)
    if (owner) return file(owner, 'domain')
  }

  // The external domains on this thread that nobody owns and that could be a client.
  const unknown = Array.from(new Set(emails
    .filter(e => e && !isInternal(e) && !isAutomated(e))
    .map(e => emailDomain(e))
    .filter(d => d && !PUBLIC_EMAIL_DOMAINS.has(d) && !NOT_A_CLIENT_DOMAINS.has(d) && !index.domains.has(d) && !index.excludedDomains.has(d))))

  const clients = index.companies.filter(c => c.kind === 'client')

  // 2. Domain stem names an existing company (the debit-note-born ones have no domain yet).
  for (const d of unknown) {
    const hits = clients.filter(c => domainMatchesName(d, c.name))
    if (hits.length === 1) {
      await attachDomain(hits[0], d, false)
      return file(hits[0].id, `domain "${d}" matched ${hits[0].name}`)
    }
  }

  // 3. The organisation as written in the sender's signature.
  const identity = buildIdentityIndex(index.companies, await loadAliases())
  const signed = t.contacts?.company?.trim()
  if (signed && signed.length >= 3) {
    const m = matchName(signed, identity)
    if (m && m.score >= AUTO_MATCH_SCORE) {
      const company = index.byId.get(m.companyId)
      if (company && company.kind === 'client') {
        for (const d of unknown) if (domainSuitsName(d, company.name) || unknown.length === 1) await attachDomain(company, d, false)
        await recordAlias(company.id, signed, 'learned')
        return file(company.id, `signature named ${company.name}`)
      }
    }
  }

  // 4. Client named in the subject.
  const hit = matchByName(t.subject, index)
  if (hit) return file(hit.companyId, 'name in the subject')

  // 5. Create. One company for the first unknown domain; the rest attach to it if they suit.
  if (unknown.length === 0) {
    // Only public or excluded addresses on this thread — a person has to decide.
    await sbTry(`company_link_suggestions?on_conflict=thread_id`, null, {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ thread_id: threadId, verdict: 'unsure', status: 'pending', rationale: 'Only personal or excluded email addresses on this thread.' }),
    })
    return { companyId: null, via: 'left for review' }
  }

  const domain = unknown[0]
  const ev: DomainEvidence = {
    ...blankEvidence(domain),
    threadIds: [t.id], subjects: t.subject ? [t.subject] : [],
    people: parts.filter(p => emailDomain(p.email) === domain).map(p => p.name ? `${p.name} <${p.email}>` : p.email).slice(0, 6),
    contactCompanies: signed ? [signed] : [],
    previews: [{ subject: t.subject ?? null, snippet: null, date: null }],
  }
  const guess = (await classifyDomains([ev]).catch(() => new Map())).get(domain) ?? null

  // The model may name an insurer or partner we have not seeded; honour that rather than make
  // it a client. Something it is fairly sure is NOT a client — a hospital, a bank, a TPA on a
  // claims thread — files as a partner, which keeps it off the client list. Only when it has
  // no view at all does "create" mean "create a client".
  const kind: CompanyKind = guess
    ? (guess.kind === 'insurer' || guess.kind === 'partner') ? guess.kind
      : (guess.kind === 'other' && guess.confidence >= 0.6) ? 'partner'
      : 'client'
    : 'client'
  const name = guess?.name?.trim() || signed || nameFromDomain(domain)

  // A confident model name might still be one of ours under a different spelling.
  const m = matchName(name, identity)
  if (m && m.score >= AUTO_MATCH_SCORE) {
    const company = index.byId.get(m.companyId)
    if (company) {
      await attachDomain(company, domain, false)
      await recordAlias(company.id, name, 'ai')
      return file(company.id, `"${name}" matched ${company.name}`)
    }
  }

  const companyId = await createCompany({
    name, kind, domains: unknown.filter(d => d === domain || domainSuitsName(d, name)),
    note: guess ? guess.reason : `Named from the email domain ${domain}; the model did not answer.`,
    confidence: guess?.confidence ?? 0,
  })
  if (!companyId) return { companyId: null, via: 'could not create a company' }
  await recordAlias(companyId, name, 'ai')
  // Created unattended: flag it so a person confirms the name at their leisure.
  await sbTry(`companies?id=eq.${companyId}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ confirmed_at: null }) })
  return file(companyId, `created ${kind} "${name}"${guess ? '' : ' from the domain'}`)
}

/** "axismachines.org" → "Axismachines". Good enough to file under until a person renames it. */
export function nameFromDomain(domain: string): string {
  const label = domain.split('.')[0] ?? domain
  return label.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Give every contact a company from their email domain where one company owns that domain.
 * Cheap, deterministic, idempotent. Run at the end of every sweep so the People tab and the
 * per-contact resolution both see the whole picture.
 */
export async function linkContactsByDomain(): Promise<number> {
  const index = await buildCompanyIndex()
  const rows = await sbTry<{ id: string; email: string | null }[]>(`contacts?company_id=is.null&email=not.is.null&select=id,email&limit=2000`, [])
  const byCompany = new Map<string, string[]>()
  for (const c of rows) {
    const d = emailDomain(c.email)
    if (!d || PUBLIC_EMAIL_DOMAINS.has(d) || isInternal(c.email)) continue
    const owner = index.domains.get(d)
    if (!owner) continue
    byCompany.set(owner, [...(byCompany.get(owner) ?? []), c.id])
  }
  let linked = 0
  for (const [companyId, ids] of Array.from(byCompany.entries())) {
    await inChunks(ids, 100, async c => {
      await sbTry(`contacts?id=in.(${c.join(',')})&company_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
      return []
    })
    linked += ids.length
  }
  return linked
}

export { aliasKey }
