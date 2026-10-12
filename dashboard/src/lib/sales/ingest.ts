// Lead intake from TRS's lead-generation tool (and CSV uploads): the same sales_accounts /
// sales_contacts tables the Leads page reads, so nothing else needs wiring. Accounts match on
// market + domain, then market + company name; contacts on email, then the same person at the
// same company. Existing values are never overwritten, only gaps filled. Drafts arrive as
// pending_approval and never send on their own.
import 'server-only'
import { enc, sb } from './db'
import { firstNameOf } from './render'
import { COUNTRY_NAME, FREE_MAIL, GENERIC_EMAIL, RANK, companyKey, countryCode, domainOf, emailStatusOf, personKey, splitDraft } from './ingest-rules'

export type IngestContact = { name?: unknown; title?: unknown; email?: unknown; email_basis?: unknown; email_source_url?: unknown; phone?: unknown; phone_basis?: unknown; linkedin_url?: unknown; draft_message?: unknown }
export type IngestLead = {
  company?: unknown; domain?: unknown; country?: unknown; industry?: unknown; why_now?: unknown; source_url?: unknown; product_line?: unknown
  fit_score?: unknown; intent_score?: unknown; recommended_action?: unknown; evidence?: unknown; contacts?: unknown
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const url = (v: unknown) => { const s = str(v, 500); try { return s && /^https?:$/.test(new URL(s).protocol) ? s : null } catch { return null } }
const score = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null }
const ACTIONS = ['draft', 'research', 'human_review', 'suppress', 'reject']

export type IngestResult = { accountsCreated: number; accountsMatched: number; contactsCreated: number; contactsUpdated: number; contactsMerged: number; draftsCreated: number; skipped: { company: string | null; contact?: string | null; reason: string }[] }

type Acc = { id: string; business_trigger: string | null; source_urls: string[] | null; industry: string | null; product_line: string | null; fit_score: number | null; intent_score: number | null; recommended_action: string | null }
const ACC = 'id,business_trigger,source_urls,industry,product_line,fit_score,intent_score,recommended_action'

export async function ingestLeads(leads: IngestLead[], source: string): Promise<IngestResult> {
  const r: IngestResult = { accountsCreated: 0, accountsMatched: 0, contactsCreated: 0, contactsUpdated: 0, contactsMerged: 0, draftsCreated: 0, skipped: [] }
  // Accounts per market, for matching by company name when the domain differs.
  const byName = new Map<string, Map<string, string>>()
  const accountByName = async (location: string, company: string) => {
    if (!byName.has(location)) {
      const rows = await sb<{ id: string; legal_name: string | null; trading_name: string | null }[]>(`sales_accounts?select=id,legal_name,trading_name&location=eq.${location}&limit=10000`)
      const m = new Map<string, string>()
      for (const a of rows) for (const n of [a.trading_name, a.legal_name]) { const k = companyKey(n); if (k.length >= 3 && !m.has(k)) m.set(k, a.id) }
      byName.set(location, m)
    }
    const k = companyKey(company)
    return k.length >= 3 ? byName.get(location)!.get(k) ?? null : null
  }

  for (const l of leads) {
    const company = str(l.company, 200)
    const location = countryCode(l.country)
    const contacts = (Array.isArray(l.contacts) ? l.contacts : []) as IngestContact[]
    const firstEmail = contacts.map(c => str(c.email, 200)).find(e => e && e.includes('@'))
    const emailDomain = firstEmail ? firstEmail.split('@')[1].toLowerCase() : null
    const domain = domainOf(l.domain) ?? (emailDomain && !FREE_MAIL.test(emailDomain) ? emailDomain : null)
    if (!company || !location || !domain || !domain.includes('.')) { r.skipped.push({ company, reason: 'company, country and domain are required' }); continue }
    const sourceUrl = url(l.source_url)

    let account = (await sb<Acc[]>(`sales_accounts?select=${ACC}&location=eq.${location}&domain=ilike.${enc(domain)}&limit=1`))[0] ?? null
    if (!account) {
      const id = await accountByName(location, company)
      if (id) account = (await sb<Acc[]>(`sales_accounts?select=${ACC}&id=eq.${id}&limit=1`))[0] ?? null
    }
    if (account) {
      r.accountsMatched += 1
      const patch: Record<string, unknown> = {}
      if (!account.business_trigger && str(l.why_now, 600)) patch.business_trigger = str(l.why_now, 600)
      if (!account.industry && str(l.industry, 120)) patch.industry = str(l.industry, 120)
      if (!account.product_line && str(l.product_line, 120)) patch.product_line = str(l.product_line, 120)
      if (account.fit_score == null && score(l.fit_score) != null) patch.fit_score = score(l.fit_score)
      if (account.intent_score == null && score(l.intent_score) != null) patch.intent_score = score(l.intent_score)
      if (!account.recommended_action && typeof l.recommended_action === 'string' && ACTIONS.includes(l.recommended_action)) patch.recommended_action = l.recommended_action
      if (sourceUrl && !(account.source_urls ?? []).includes(sourceUrl)) patch.source_urls = [...(account.source_urls ?? []), sourceUrl]
      if (Object.keys(patch).length) await sb(`sales_accounts?id=eq.${account.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) })
    } else {
      account = (await sb<Acc[]>(`sales_accounts?select=${ACC}`, { method: 'POST', body: JSON.stringify({
        location, country: COUNTRY_NAME[location] ?? location, legal_name: company, trading_name: company, domain,
        industry: str(l.industry, 120), product_line: str(l.product_line, 120), business_trigger: str(l.why_now, 600), source_urls: sourceUrl ? [sourceUrl] : [],
        fit_score: score(l.fit_score), intent_score: score(l.intent_score),
        recommended_action: typeof l.recommended_action === 'string' && ACTIONS.includes(l.recommended_action) ? l.recommended_action : null,
        score_evidence: l.evidence ?? null, discovery_date: new Date().toISOString().slice(0, 10), status: 'new', source,
      }) }))[0]
      byName.get(location)?.set(companyKey(company), account.id)
      r.accountsCreated += 1
    }
    const acc = account

    // Drafts wait for approval. The same text for the same person is stored once, so retries are safe.
    const addDraft = async (contactId: string | null, to: string | null, raw: unknown) => {
      const d = splitDraft(raw)
      if (!d) return
      const existing = await sb<{ id: string }[]>(`sales_outreach?select=id&account_id=eq.${acc.id}&channel=eq.email&body=eq.${enc(d.body)}${contactId ? `&contact_id=eq.${contactId}` : '&contact_id=is.null'}&limit=1`)
      if (existing.length) return
      await sb('sales_outreach', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({
        account_id: acc.id, contact_id: contactId, company, email: to, channel: 'email', location, subject: d.subject, body: d.body, status: 'pending_approval', source,
      }) })
      r.draftsCreated += 1
    }

    for (const c of contacts.slice(0, 10)) {
      const name = str(c.name, 120)
      const email = (str(c.email, 200) ?? '').toLowerCase() || null
      const phone = str(c.phone, 40)
      if (!name) { r.skipped.push({ company, contact: email, reason: 'contact name required: named people only' }); continue }
      if (email && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || GENERIC_EMAIL.test(email))) { r.skipped.push({ company, contact: email, reason: 'not a personal work email' }); continue }
      if (!email && !phone) { r.skipped.push({ company, contact: name, reason: 'email or phone required' }); continue }
      const emailStatus = emailStatusOf(c.email_basis)
      const fields = {
        full_name: name, first_name: firstNameOf(name) ?? name.split(/\s+/)[0], role: str(c.title, 120), company,
        email, email_status: email ? emailStatus : 'unknown', email_source: source, email_source_url: url(c.email_source_url),
        phone, phone_status: phone ? (c.phone_basis ? emailStatusOf(c.phone_basis) : 'found_publicly') : null, linkedin_url: url(c.linkedin_url),
      }
      let existing = email ? (await sb<Record<string, unknown>[]>(`sales_contacts?select=*&email=ilike.${enc(email)}&limit=1`))[0] ?? null : null
      let byPerson = false
      if (!existing) {
        const people = await sb<Record<string, unknown>[]>(`sales_contacts?select=*&account_id=eq.${acc.id}`)
        const k = personKey(name)
        existing = people.find(p => personKey(p.full_name) === k) ?? null
        byPerson = Boolean(existing)
      }
      if (existing && byPerson && email && !existing.email) {
        const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== null && k !== 'full_name' && k !== 'company'))
        await sb(`sales_contacts?id=eq.${existing.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) })
        r.contactsMerged += 1
        await addDraft(existing.id as string, email, c.draft_message)
      } else if (existing) {
        const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== null && (existing![k] === null || existing![k] === '' || (k === 'email_status' && existing![k] === 'unknown'))))
        if (email && String(existing.email ?? '').toLowerCase() === email && (RANK[emailStatus] ?? 0) > (RANK[String(existing.email_status)] ?? 0)) {
          patch.email_status = emailStatus
          if (fields.email_source_url) patch.email_source_url = fields.email_source_url
        }
        if (Object.keys(patch).length) {
          await sb(`sales_contacts?id=eq.${existing.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) })
          r.contactsUpdated += 1
        }
        await addDraft(existing.id as string, (existing.email as string | null) ?? email, c.draft_message)
      } else {
        const created = (await sb<{ id: string }[]>('sales_contacts?select=id', { method: 'POST', body: JSON.stringify({ ...fields, account_id: acc.id }) }))[0]
        r.contactsCreated += 1
        await addDraft(created.id, email, c.draft_message)
      }
    }
  }
  return r
}
