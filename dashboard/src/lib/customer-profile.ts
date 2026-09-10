/**
 * Aggregates everything the dashboard knows about one contact — structured facts (company,
 * policies) plus a rolled-up history across every past email thread with them — into a single
 * profile. Called directly (not over HTTP) by both api/customer-profile/route.ts (for the UI)
 * and api/engagement/draft/route.ts (for draft generation), so there's exactly one place that
 * decides how this gets assembled.
 *
 * Pure aggregation of data that already exists — no AI calls here. Cross-thread history reuses
 * thread_summaries rows that refresh-summary already writes per-thread; this just rolls them up
 * across a contact's whole conversation group instead of leaving each thread's summary siloed.
 */
import { SB_URL, sbHeaders } from '@/lib/sb'

type Json = Record<string, unknown>

const MAX_SUMMARIES = 8

export interface CustomerProfile {
  contact: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    notes: string | null
  }
  company: {
    id: string
    name: string
    industry: string | null
    type: string | null
    notes: string | null
  } | null
  policies: {
    id: string
    policy_number: string | null
    insurer: string | null
    class_of_insurance: string | null
    status: string
    end_date: string | null
  }[]
  customerStatus: string | null // most-relevant customers.status across this company's customer rows
  recentSummaries: { thread_id: string; subject: string | null; summary: string; next_action: string | null; created_at: string }[]
  siblingContacts: { id: string; name: string | null; email: string | null; role: string }[]
}

function contactName(c: Json): string | null {
  const full = c.full_name as string | null | undefined
  if (full?.trim()) return full.trim()
  const parts = [c.first_name, c.last_name].filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  return parts.length ? parts.join(' ') : null
}

/** Resolves the company for a contact: the direct FK if set, else the older company_contacts
 *  junction (still what companies/[id]/route.ts and the insurer-directory side use) — contacts
 *  resolved before 2026-08-19 only ever got linked via the junction, never backfilled onto the
 *  newer FK. A contact with neither returns null; the profile just shows no linked company. */
async function resolveCompanyId(contactId: string, directCompanyId: string | null): Promise<string | null> {
  if (directCompanyId) return directCompanyId
  const res = await fetch(
    `${SB_URL}/rest/v1/company_contacts?contact_id=eq.${contactId}&select=company_id&limit=1`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const rows = res.ok ? await res.json() : []
  return Array.isArray(rows) && rows[0] ? (rows[0].company_id as string) : null
}

/** Every thread in this contact's conversation group — the primary thread plus any party-forked
 *  sub-threads (see 20260715_conversation_grouping.sql) — so a claim that spans multiple parties
 *  still rolls up as one history instead of leaving forked threads invisible. */
async function resolveThreadIds(contactId: string): Promise<string[]> {
  const res = await fetch(
    `${SB_URL}/rest/v1/email_threads?contact_id=eq.${contactId}&select=id,conversation_root_id`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const threads: { id: string; conversation_root_id: string | null }[] = res.ok ? await res.json() : []
  if (threads.length === 0) return []

  const roots = Array.from(new Set(threads.map(t => t.conversation_root_id ?? t.id)))
  const groupRes = await fetch(
    `${SB_URL}/rest/v1/email_threads?or=(${roots.map(r => `id.eq.${r}`).join(',')},${roots.map(r => `conversation_root_id.eq.${r}`).join(',')})&select=id`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const grouped: { id: string }[] = groupRes.ok ? await groupRes.json() : threads.map(t => ({ id: t.id }))
  return Array.from(new Set(grouped.map(t => t.id)))
}

export async function getCustomerProfile(contactId: string): Promise<CustomerProfile | null> {
  const contactRes = await fetch(
    `${SB_URL}/rest/v1/contacts?id=eq.${contactId}&select=id,full_name,first_name,last_name,email,phone,notes,company_id&limit=1`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const contactRows = contactRes.ok ? await contactRes.json() : []
  const contactRow = Array.isArray(contactRows) ? contactRows[0] : null
  if (!contactRow) return null

  const companyId = await resolveCompanyId(contactId, contactRow.company_id ?? null)

  const [companyResult, threadIds] = await Promise.all([
    companyId
      ? Promise.all([
          fetch(`${SB_URL}/rest/v1/companies?id=eq.${companyId}&select=id,name:company_name,industry,type,notes&limit=1`, { headers: sbHeaders(), cache: 'no-store' }),
          fetch(`${SB_URL}/rest/v1/customers?company_id=eq.${companyId}&select=id,status,policies(id,policy_number,insurer,class_of_insurance,status,end_date)`, { headers: sbHeaders(), cache: 'no-store' }),
          fetch(`${SB_URL}/rest/v1/company_contacts?company_id=eq.${companyId}&contact_id=neq.${contactId}&select=role,contacts(id,full_name,first_name,last_name,email)`, { headers: sbHeaders(), cache: 'no-store' }),
        ])
      : Promise.resolve(null),
    resolveThreadIds(contactId),
  ])

  let company: CustomerProfile['company'] = null
  let policies: CustomerProfile['policies'] = []
  let customerStatus: string | null = null
  let siblingContacts: CustomerProfile['siblingContacts'] = []

  if (companyResult) {
    const [companyRes, customersRes, siblingsRes] = companyResult
    const companyRow = companyRes.ok ? (await companyRes.json())[0] : null
    if (companyRow) company = { id: companyRow.id, name: companyRow.name, industry: companyRow.industry ?? null, type: companyRow.type ?? null, notes: companyRow.notes ?? null }

    const customers: { status: string | null; policies: Json[] }[] = customersRes.ok ? await customersRes.json() : []
    policies = customers.flatMap(c => (c.policies ?? []) as CustomerProfile['policies'])
    // "renewal_due" and "active" are the statuses worth surfacing; prefer renewal_due (more
    // actionable) if any customer row has it, else fall back to the first status seen.
    customerStatus = customers.find(c => c.status === 'renewal_due')?.status ?? customers[0]?.status ?? null

    const siblingRows: { role: string; contacts: Json | null }[] = siblingsRes.ok ? await siblingsRes.json() : []
    siblingContacts = siblingRows
      .filter(r => r.contacts)
      .map(r => ({ id: r.contacts!.id as string, name: contactName(r.contacts!), email: r.contacts!.email as string | null, role: r.role }))
  }

  let recentSummaries: CustomerProfile['recentSummaries'] = []
  if (threadIds.length > 0) {
    const [summariesRes, threadsRes] = await Promise.all([
      fetch(
        `${SB_URL}/rest/v1/thread_summaries?thread_id=in.(${threadIds.join(',')})&select=thread_id,summary,next_action,created_at&order=created_at.desc`,
        { headers: sbHeaders(), cache: 'no-store' }
      ),
      fetch(`${SB_URL}/rest/v1/email_threads?id=in.(${threadIds.join(',')})&select=id,subject`, { headers: sbHeaders(), cache: 'no-store' }),
    ])
    const summaryRows: { thread_id: string; summary: string; next_action: string | null; created_at: string }[] = summariesRes.ok ? await summariesRes.json() : []
    const threadRows: { id: string; subject: string | null }[] = threadsRes.ok ? await threadsRes.json() : []
    const subjectByThread = new Map(threadRows.map(t => [t.id, t.subject]))

    // Latest summary per thread only — a thread can accumulate several over time as it evolves.
    const latestPerThread = new Map<string, typeof summaryRows[number]>()
    for (const s of summaryRows) if (!latestPerThread.has(s.thread_id)) latestPerThread.set(s.thread_id, s)

    recentSummaries = Array.from(latestPerThread.values())
      .sort((a, b) => a.created_at.localeCompare(b.created_at)) // oldest-first for prompt readability
      .slice(-MAX_SUMMARIES)
      .map(s => ({ thread_id: s.thread_id, subject: subjectByThread.get(s.thread_id) ?? null, summary: s.summary, next_action: s.next_action, created_at: s.created_at }))
  }

  return {
    contact: { id: contactRow.id, name: contactName(contactRow), email: contactRow.email ?? null, phone: contactRow.phone ?? null, notes: contactRow.notes ?? null },
    company,
    policies,
    customerStatus,
    recentSummaries,
    siblingContacts,
  }
}
