/**
 * Linking threads to companies.
 *
 * Exact matches happen without review: a thread whose contact already belongs to a company, or
 * whose contact's email domain is one of a client company's domains. Everything else goes to
 * the triage queue, where the agent proposes a company (existing or new) or says the sender is
 * not a client at all (insurer, lawyer, adjuster, newsletter). Staff accept or reject. Nothing
 * is created and nothing is linked from an AI proposal until a person confirms it.
 */
import { sb, sbTry, inChunks, enc, listClientCompanies, isInternal, isAutomated, emailDomain, PUBLIC_EMAIL_DOMAINS } from './db'
import { geminiJson } from './ai'
import { GEMINI_FLASH } from '@/lib/gemini-models'
import { personName } from './format'
import type { Company, LinkSuggestion, LinkVerdict, Stage } from './types'
import { logActivity } from '@/lib/log-activity'

type ContactMini = { id: string; email: string | null; first_name: string | null; last_name: string | null; company: string | null; company_id: string | null }
type ThreadRow = {
  id: string; subject: string | null; snippet: string | null; category: string | null; status: string; last_message_at: string | null
  contact_id: string | null; contacts: ContactMini | null
}
type Participant = { thread_id: string; email: string; name: string | null; role: string }

export interface UnlinkedThread extends ThreadRow {
  participants: { email: string; name: string | null }[]
  suggestion: LinkSuggestion | null
}

const THREAD_SELECT = 'id,subject,snippet,category,status,last_message_at,contact_id,contacts(id,email,first_name,last_name,company,company_id)'

// ── Queue ─────────────────────────────────────────────────────────────────────────────────────

export async function listUnlinkedThreads(): Promise<UnlinkedThread[]> {
  const [threads, suggestions] = await Promise.all([
    sbTry<ThreadRow[]>(`email_threads?company_id=is.null&deleted_at=is.null&select=${THREAD_SELECT}&order=last_message_at.desc.nullslast&limit=500`, []),
    sbTry<LinkSuggestion[]>(`company_link_suggestions?select=*`, []),
  ])
  const sugByThread = new Map(suggestions.map(s => [s.thread_id, s]))
  // A thread whose suggestion was accepted as "not a client" is handled — keep it out of the queue.
  const visible = threads.filter(t => { const s = sugByThread.get(t.id); return !(s && s.status === 'accepted' && s.verdict === 'not_client') })
  const ids = visible.map(t => t.id)
  const parts = ids.length ? await inChunks(ids, 100, c => sbTry<Participant[]>(`email_participants?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,email,name,role`, [])) : []
  const byThread = new Map<string, Map<string, string | null>>()
  for (const p of parts) {
    const email = (p.email ?? '').toLowerCase().trim()
    if (!email || isInternal(email) || isAutomated(email)) continue
    const m = byThread.get(p.thread_id) ?? new Map<string, string | null>()
    if (!m.has(email) || (!m.get(email) && p.name)) m.set(email, p.name?.trim() || null)
    byThread.set(p.thread_id, m)
  }
  return visible.map(t => ({
    ...t,
    participants: Array.from((byThread.get(t.id) ?? new Map()).entries()).slice(0, 6).map(([email, name]) => ({ email, name })),
    suggestion: sugByThread.get(t.id) ?? null,
  }))
}

// ── Exact linking ─────────────────────────────────────────────────────────────────────────────

export async function linkThreadToCompany(threadId: string, companyId: string, opts: { contactId?: string | null; contactEmail?: string | null } = {}): Promise<void> {
  await sb(`email_threads?id=eq.${enc(threadId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
  if (opts.contactId) {
    // Stamp the contact and every other still-unlinked thread of that contact in one go.
    await sbTry(`contacts?id=eq.${enc(opts.contactId)}&company_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
    await sbTry(`email_threads?contact_id=eq.${enc(opts.contactId)}&company_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })
  }
  const domain = emailDomain(opts.contactEmail)
  if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) await addCompanyDomain(companyId, domain)
}

export async function addCompanyDomain(companyId: string, domain: string): Promise<void> {
  const rows = await sbTry<{ domains?: string[] }[]>(`companies?id=eq.${enc(companyId)}&select=domains&limit=1`, [])
  const current = rows[0]?.domains
  if (!Array.isArray(current) || current.includes(domain)) return
  await sbTry(`companies?id=eq.${enc(companyId)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ domains: [...current, domain] }) })
}

export async function runExactLinking(): Promise<{ linked: number; remaining: number }> {
  const [threads, companies] = await Promise.all([
    sbTry<ThreadRow[]>(`email_threads?company_id=is.null&deleted_at=is.null&select=${THREAD_SELECT}&limit=1000`, []),
    listClientCompanies(),
  ])
  const byDomain = new Map<string, Company>()
  for (const c of companies) for (const d of c.domains) if (!PUBLIC_EMAIL_DOMAINS.has(d)) byDomain.set(d, c)

  let linked = 0
  for (const t of threads) {
    const c = t.contacts
    if (!c) continue
    let companyId: string | null = c.company_id ?? null
    if (!companyId) {
      const d = emailDomain(c.email)
      if (d && byDomain.has(d)) companyId = byDomain.get(d)!.id
    }
    if (!companyId) continue
    await linkThreadToCompany(t.id, companyId, { contactId: c.id, contactEmail: c.email })
    linked++
  }
  return { linked, remaining: threads.length - linked }
}

// ── AI suggestions ────────────────────────────────────────────────────────────────────────────

const SYSTEM = `You help an insurance broker (Trade Risk Solutions, Singapore) file email threads under the right CLIENT company. Clients are the businesses that buy insurance through TRS. Insurers (QBE, Chubb, Liberty, Allianz, AIG, MSIG, Income, Great Eastern, ECICS, Sompo, Zurich, EQ, Berkley, Tokio Marine, HLAS, and similar), law firms, loss adjusters, third-party administrators, newsletters and vendors are NOT clients. Be conservative: when the sender is clearly an insurer or a service provider, say not_client. When a thread is about a client but comes from an insurer (for example an insurer quoting for a named insured), still file it under that client if the insured's company is identifiable.`

type ProposalRaw = { thread_id?: unknown; verdict?: unknown; company_id?: unknown; company_name?: unknown; domain?: unknown; confidence?: unknown; rationale?: unknown }

export async function suggestLinks(opts: { limit?: number } = {}): Promise<{ suggested: number; error?: string }> {
  const limit = opts.limit ?? 24
  const [queue, companies] = await Promise.all([listUnlinkedThreads(), listClientCompanies()])
  // Only threads that have never been looked at. Rejected suggestions stay rejected — staff
  // said the proposal was wrong, so asking the same model again would just repeat it.
  const todo = queue.filter(t => !t.suggestion).slice(0, limit)
  if (todo.length === 0) return { suggested: 0 }

  const candidates = companies.map(c => `${c.id} | ${c.name} | domains: ${c.domains.join(', ') || '-'}`).join('\n')
  let suggested = 0
  let lastError: string | undefined
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8)
    const threadsText = batch.map(t => {
      const contact = t.contacts ? `${personName(t.contacts.first_name, t.contacts.last_name, t.contacts.email)} <${t.contacts.email ?? ''}>${t.contacts.company ? ` (company field: ${t.contacts.company})` : ''}` : 'unknown'
      return `thread_id: ${t.id}\nsubject: ${t.subject ?? '(none)'}\ncategory: ${t.category ?? '?'}\ncontact: ${contact}\nparticipants: ${t.participants.map(p => `${p.name ?? ''} <${p.email}>`).join('; ') || '-'}\nsnippet: ${(t.snippet ?? '').replace(/\s+/g, ' ').slice(0, 400)}`
    }).join('\n\n---\n\n')

    const prompt = `EXISTING CLIENT COMPANIES (id | name | domains):\n${candidates || '(none yet)'}\n\nTHREADS TO FILE:\n\n${threadsText}\n\nFor every thread return one item in a JSON array:\n{ "thread_id": "...", "verdict": "existing|new|not_client|unsure", "company_id": "id from the list when verdict is existing, else null", "company_name": "proper company name when verdict is new, else null", "domain": "the client's email domain when known and not a public mailbox provider, else null", "confidence": 0.0 to 1.0, "rationale": "one short sentence" }`

    const res = await geminiJson<ProposalRaw[]>({ system: SYSTEM, prompt, feature: 'crm_triage', model: GEMINI_FLASH, temperature: 0 })
    if (!res.data || !Array.isArray(res.data)) { lastError = res.error; continue }

    const validIds = new Set(companies.map(c => c.id))
    const rows = res.data.map(p => {
      const threadId = String(p.thread_id ?? '')
      if (!batch.some(t => t.id === threadId)) return null
      const verdictRaw = String(p.verdict ?? 'unsure')
      const verdict: LinkVerdict = (['existing', 'new', 'not_client', 'unsure'] as const).includes(verdictRaw as LinkVerdict) ? verdictRaw as LinkVerdict : 'unsure'
      const companyId = verdict === 'existing' && validIds.has(String(p.company_id)) ? String(p.company_id) : null
      const domain = typeof p.domain === 'string' && p.domain.includes('.') ? p.domain.toLowerCase().trim() : null
      return {
        thread_id: threadId,
        verdict: verdict === 'existing' && !companyId ? 'unsure' : verdict,
        suggested_company_id: companyId,
        suggested_name: verdict === 'new' && p.company_name ? String(p.company_name).trim() : null,
        suggested_domain: domain && !PUBLIC_EMAIL_DOMAINS.has(domain) ? domain : null,
        confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : null,
        rationale: p.rationale ? String(p.rationale).slice(0, 400) : null,
        status: 'pending', model: res.model, decided_by: null, decided_at: null,
      }
    }).filter(Boolean)

    if (rows.length === 0) continue
    try {
      await sb('company_link_suggestions?on_conflict=thread_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) })
      suggested += rows.length
    } catch (e) { lastError = String(e) }
  }
  return { suggested, error: suggested === 0 ? lastError : undefined }
}

// ── Decisions ─────────────────────────────────────────────────────────────────────────────────

export type TriageDecision =
  | { decision: 'accept' }
  | { decision: 'reject' }
  | { decision: 'link'; companyId: string }
  | { decision: 'create'; name: string; domain?: string | null; stage?: Stage }
  | { decision: 'not_client' }

export async function decideLink(threadId: string, d: TriageDecision, userEmail: string | null): Promise<{ ok: true; companyId: string | null } | { ok: false; error: string }> {
  const [threads, sugs] = await Promise.all([
    sbTry<ThreadRow[]>(`email_threads?id=eq.${enc(threadId)}&select=${THREAD_SELECT}&limit=1`, []),
    sbTry<LinkSuggestion[]>(`company_link_suggestions?thread_id=eq.${enc(threadId)}&select=*&limit=1`, []),
  ])
  const thread = threads[0]
  if (!thread) return { ok: false, error: 'Thread not found.' }
  const suggestion = sugs[0] ?? null
  const now = new Date().toISOString()
  const markSuggestion = async (status: 'accepted' | 'rejected', verdictOverride?: LinkVerdict) => {
    const patch: Record<string, unknown> = { status, decided_by: userEmail, decided_at: now }
    if (verdictOverride) patch.verdict = verdictOverride
    if (suggestion) await sbTry(`company_link_suggestions?id=eq.${suggestion.id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
    else await sbTry('company_link_suggestions', null, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ thread_id: threadId, verdict: verdictOverride ?? 'unsure', ...patch }) })
  }

  if (d.decision === 'reject') { await markSuggestion('rejected'); return { ok: true, companyId: null } }
  if (d.decision === 'not_client') { await markSuggestion('accepted', 'not_client'); return { ok: true, companyId: null } }

  let companyId: string | null = null
  const stageForNew: Stage = 'client'

  if (d.decision === 'link') companyId = d.companyId
  else if (d.decision === 'create') {
    companyId = await createClientCompany({ name: d.name, domain: d.domain ?? emailDomain(thread.contacts?.email), stage: d.stage ?? stageForNew, source: 'triage' })
  } else if (d.decision === 'accept') {
    if (!suggestion || suggestion.status !== 'pending') return { ok: false, error: 'There is no pending suggestion to accept.' }
    if (suggestion.verdict === 'not_client') { await markSuggestion('accepted'); return { ok: true, companyId: null } }
    if (suggestion.verdict === 'existing' && suggestion.suggested_company_id) companyId = suggestion.suggested_company_id
    else if (suggestion.verdict === 'new' && suggestion.suggested_name) companyId = await createClientCompany({ name: suggestion.suggested_name, domain: suggestion.suggested_domain ?? emailDomain(thread.contacts?.email), stage: stageForNew, source: 'triage' })
    else return { ok: false, error: 'This suggestion is not specific enough to accept. Link a company by hand instead.' }
  }
  if (!companyId) return { ok: false, error: 'No company resolved.' }

  await linkThreadToCompany(threadId, companyId, { contactId: thread.contacts?.id ?? null, contactEmail: thread.contacts?.email ?? null })
  await markSuggestion('accepted', d.decision === 'create' ? 'new' : 'existing')
  void logActivity({ action: 'thread.linked', resource_type: 'company', resource_id: companyId, new_value: { thread_id: threadId, decision: d.decision } })
  return { ok: true, companyId }
}

export async function createClientCompany(input: { name: string; domain?: string | null; stage?: Stage; source?: string; ownerEmail?: string | null; industry?: string | null; address?: string | null }): Promise<string> {
  const name = input.name.trim()
  // Plain URL-encoding only: PostgREST keeps double quotes literal in an ilike value, so a
  // quoted pattern never matches and every call would create a duplicate company.
  const existing = await sbTry<{ id: string }[]>(`companies?company_name=ilike.${enc(name)}&select=id&limit=1`, [])
  if (existing[0]) {
    if (input.domain && !PUBLIC_EMAIL_DOMAINS.has(input.domain)) await addCompanyDomain(existing[0].id, input.domain)
    return existing[0].id
  }
  const domains = input.domain && !PUBLIC_EMAIL_DOMAINS.has(input.domain) ? [input.domain.toLowerCase()] : []
  const full = { company_name: name, address: input.address ?? null, industry: input.industry ?? null, kind: 'client', stage: input.stage ?? 'client', stage_changed_at: new Date().toISOString(), owner_email: input.ownerEmail ?? null, domains, domain: domains[0] ?? null, source: input.source ?? 'manual' }
  try {
    const rows = await sb<{ id: string }[]>('companies', { method: 'POST', body: JSON.stringify(full) })
    return rows[0].id
  } catch {
    // Before the migration lands the CRM columns do not exist — fall back to the legacy shape.
    const rows = await sb<{ id: string }[]>('companies', { method: 'POST', body: JSON.stringify({ company_name: name, address: input.address ?? null, industry: input.industry ?? null, domain: domains[0] ?? null }) })
    return rows[0].id
  }
}
