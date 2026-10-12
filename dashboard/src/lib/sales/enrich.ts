// Email lookup via Netrows, in the order that unblocks the most approvals per credit (1 credit
// per call): find emails for pending drafts whose contact has none; verify unverified ones; then
// the decision-maker at the strongest accounts with no contact. Without NETROWS_API_KEY this only
// counts what it would do.
import 'server-only'
import { enc, sb } from './db'
import { countEventsSince, logSalesEvent } from './events'
import { startOfSgtDay } from './db'
import { lookupConfigured, salesConfig } from './config'

const BASE = process.env.NETROWS_API_BASE || 'https://www.netrows.com/api/v1'
const ACTOR = 'system:sales-enrich'

export type FoundEmail = { email: string; status: 'verified' | 'suggested'; raw: string | null; name: string | null; title: string | null; linkedinUrl: string | null }

export class NetrowsError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export function parseNetrows(json: unknown): FoundEmail | null {
  const root = (json ?? {}) as Record<string, unknown>
  let d = (root.data ?? root.result ?? root) as Record<string, unknown> | Record<string, unknown>[]
  if (Array.isArray(d)) d = d[0] ?? {}
  const email = typeof d.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) ? d.email.toLowerCase() : null
  if (!email) return null
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const raw = str(d.email_status)
  return {
    email, status: ['valid', 'verified', 'deliverable'].includes((raw ?? '').toLowerCase()) ? 'verified' : 'suggested', raw,
    name: str(d.person_full_name) ?? str(d.full_name), title: str(d.person_job_title) ?? str(d.job_title), linkedinUrl: str(d.person_linkedin_url) ?? str(d.linkedin_url),
  }
}

async function get(path: string, params: Record<string, string | null | undefined>): Promise<FoundEmail | null> {
  const key = process.env.NETROWS_API_KEY
  if (!key) throw new NetrowsError('NETROWS_API_KEY not set', 0)
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: { 'x-api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new NetrowsError(`netrows ${path} ${res.status}`, res.status)
  return parseNetrows(await res.json().catch(() => null))
}

export const cleanDomain = (d: string | null) => (d ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '') || null

type Contact = { id: string; full_name: string | null; email: string | null; email_status: string | null; linkedin_url: string | null; suppressed: boolean | null }
type Account = { id: string; domain: string | null; total_score: number | null; location: string; legal_name: string | null; trading_name: string | null }
type PendingDraft = { id: string; account_id: string; email: string | null; contact: Contact | null; account: Account | null }

function lookupPerson(c: Contact, domain: string | null): Promise<FoundEmail | null> | null {
  if (c.linkedin_url && /linkedin\.com\/in\//i.test(c.linkedin_url)) return get('/email-finder/by-linkedin', { linkedin_url: c.linkedin_url })
  if (c.full_name && domain) return get('/email-finder/by-name', { full_name: c.full_name, domain })
  return null
}

export type EnrichResult = {
  configured: boolean; budget: number; candidates: { find: number; verify: number; people: number }
  done: { lookups: number; found: number; verified: number; notFound: number; contactsAdded: number; errors: number }; stoppedBy?: string
}

/** scope: limit the run to these sales_accounts ids (the per-lead button). */
export async function runEnrichment(opts: { maxLookups?: number; scope?: string[] } = {}): Promise<EnrichResult> {
  const scope = opts.scope ? new Set(opts.scope) : null
  const drafts = (await sb<PendingDraft[]>('sales_outreach?select=id,account_id,email,contact:sales_contacts(id,full_name,email,email_status,linkedin_url,suppressed),account:sales_accounts(id,domain,total_score,location,legal_name,trading_name)&status=eq.pending_approval&channel=eq.email&limit=1000'))
    .filter(d => !scope || scope.has(d.account_id)).sort((a, b) => (b.account?.total_score ?? 0) - (a.account?.total_score ?? 0))
  const domainOf = (d: PendingDraft) => cleanDomain(d.account?.domain ?? null)
  const usable = (d: PendingDraft) => d.contact && !d.contact.suppressed && (d.contact.linkedin_url || (d.contact.full_name && domainOf(d)))
  const find = drafts.filter(d => usable(d) && !d.contact!.email)
  const verify = drafts.filter(d => usable(d) && d.contact!.email && !['verified', 'invalid', 'bounced', 'suppressed'].includes(d.contact!.email_status ?? ''))

  const result: EnrichResult = { configured: lookupConfigured(), budget: 0, candidates: { find: find.length, verify: verify.length, people: 0 }, done: { lookups: 0, found: 0, verified: 0, notFound: 0, contactsAdded: 0, errors: 0 } }
  const usedToday = await countEventsSince(['email_lookup'], startOfSgtDay())
  result.budget = Math.max(0, Math.min(opts.maxLookups ?? Infinity, salesConfig.lookupDailyCap() - usedToday))

  // Accounts with no contact: the scoped ones, else those marked for a draft, strongest first.
  const peopleQ = opts.scope
    ? `leads_unified?select=source_id&contact_count=eq.0&domain=not.is.null&source_id=in.(${opts.scope.join(',')})&order=total_score.desc.nullslast&limit=${Math.max(result.budget, 1)}`
    : `leads_unified?select=source_id&contact_count=eq.0&domain=not.is.null&recommended_action=eq.draft&order=total_score.desc.nullslast&limit=${Math.max(result.budget, 1)}`
  const ids = (await sb<{ source_id: string }[]>(peopleQ)).map(r => r.source_id)
  const people = ids.length ? (await sb<Account[]>(`sales_accounts?select=id,domain,total_score,location,legal_name,trading_name&id=in.(${ids.join(',')})`)).sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0)) : []
  result.candidates.people = people.length
  if (!result.configured || result.budget === 0) return result

  const spend = async (ids: { accountId: string; contactId: string | null; outreachId?: string }, what: string, fn: () => Promise<void>) => {
    if (result.stoppedBy || result.done.lookups >= result.budget) return false
    result.done.lookups += 1
    await logSalesEvent({ kind: 'email_lookup', actor: ACTOR, accountId: ids.accountId, contactId: ids.contactId, outreachId: ids.outreachId, detail: { what, provider: 'netrows' } })
    try { await fn() } catch (e) {
      result.done.errors += 1
      const status = e instanceof NetrowsError ? e.status : 0
      console.error('sales-enrich', what, e instanceof Error ? e.message : 'unknown')
      if ([401, 402, 403, 429].includes(status)) { result.stoppedBy = `netrows ${status}`; return false }
    }
    return true
  }
  const now = () => new Date().toISOString()
  const saveContactEmail = (contactId: string, r: FoundEmail) =>
    sb(`sales_contacts?id=eq.${contactId}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ email: r.email, email_status: r.status, email_source: 'netrows', email_confidence: r.status === 'verified' ? 0.95 : 0.6, email_discovery_date: now().slice(0, 10), email_last_checked_at: now(), updated_at: now() }) })
  const readdressDraft = (draftId: string, email: string) =>
    sb(`sales_outreach?id=eq.${draftId}&status=eq.pending_approval`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ email }) })
  const notFound = async (d: PendingDraft) => {
    result.done.notFound += 1
    await sb(`sales_contacts?id=eq.${d.contact!.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ email_last_checked_at: now() }) })
    await logSalesEvent({ kind: 'email_not_found', actor: ACTOR, accountId: d.account_id, contactId: d.contact!.id, outreachId: d.id, detail: { provider: 'netrows' } })
  }

  for (const d of find) {
    const c = d.contact!
    const ok = await spend({ accountId: d.account_id, contactId: c.id, outreachId: d.id }, 'find', async () => {
      const r = await lookupPerson(c, domainOf(d))
      if (!r) return notFound(d)
      await saveContactEmail(c.id, r)
      if (!d.email) await readdressDraft(d.id, r.email)
      result.done.found += 1
      if (r.status === 'verified') result.done.verified += 1
      await logSalesEvent({ kind: 'email_found', actor: ACTOR, accountId: d.account_id, contactId: c.id, outreachId: d.id, detail: { status: r.status, provider: 'netrows', raw: r.raw } })
    })
    if (!ok) break
  }
  for (const d of verify) {
    const c = d.contact!
    const ok = await spend({ accountId: d.account_id, contactId: c.id, outreachId: d.id }, 'verify', async () => {
      const r = await lookupPerson(c, domainOf(d))
      if (!r) return notFound(d)
      const same = r.email === c.email!.toLowerCase()
      await saveContactEmail(c.id, r)
      if (!same || !d.email) await readdressDraft(d.id, r.email)
      if (r.status === 'verified') result.done.verified += 1
      await logSalesEvent({ kind: r.status === 'verified' ? 'email_verified' : 'email_found', actor: ACTOR, accountId: d.account_id, contactId: c.id, outreachId: d.id, detail: { status: r.status, provider: 'netrows', replaced: !same } })
    })
    if (!ok) break
  }
  for (const a of people) {
    const domain = cleanDomain(a.domain)
    if (!domain) continue
    const ok = await spend({ accountId: a.id, contactId: null }, 'people', async () => {
      const r = await get('/email-finder/decision-maker', { domain, category: 'ceo' })
      if (!r) { result.done.notFound += 1; await logSalesEvent({ kind: 'email_not_found', actor: ACTOR, accountId: a.id, detail: { provider: 'netrows', what: 'decision-maker' } }); return }
      const name = r.name ?? r.email.split('@')[0]
      const created = (await sb<{ id: string }[]>('sales_contacts?select=id', { method: 'POST', body: JSON.stringify({
        account_id: a.id, company: a.trading_name ?? a.legal_name, full_name: name, first_name: name.split(/\s+/)[0], role: r.title, linkedin_url: r.linkedinUrl,
        email: r.email, email_status: r.status, email_source: 'netrows', email_confidence: r.status === 'verified' ? 0.95 : 0.6, email_discovery_date: now().slice(0, 10), email_last_checked_at: now(),
      }) }))[0]
      result.done.contactsAdded += 1
      if (r.status === 'verified') result.done.verified += 1
      await logSalesEvent({ kind: 'contact_added', actor: ACTOR, accountId: a.id, contactId: created.id, detail: { provider: 'netrows', status: r.status } })
    })
    if (!ok) break
  }
  return result
}
