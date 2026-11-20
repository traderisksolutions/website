'use server'
/**
 * The company page's reloads (21 Nov 2026). The first screen is read once by loadCompanyWorkspace;
 * these re-read one section after a change or when a tab opens. They replace the GET routes
 * /api/companies/[id]/{threads,cases,placements,policies,activity,drafts}; createCase replaces the
 * cases POST.
 */
import { staffAction } from '@/lib/auth/action'
import { getCompany, getCompanyThreadIds } from '@/lib/crm/db'
import { db, one } from '@/lib/db/client'
import { logActivity } from '@/lib/log-activity'
import { listVisibleCompanyThreads } from '@/lib/crm/threads'
import { listCompanyCases } from '@/lib/crm/cases'
import { loadCompanyPayments } from '@/lib/crm/payments-server'
import { listCompanyQuotes } from '@/lib/crm/quotes'
import { buildActivity } from '@/lib/crm/activity'
import { loadBundle } from '@/lib/placement/store'
import { derivePositions } from '@/lib/placement/position'
import { isUuid } from '@/lib/placement/api'
import { listCompanyPolicies } from '@/lib/policies/spine'
import { companyReviewQueue } from '@/lib/policies/queue'
import { companyRelevance } from '@/lib/cases/sources-store'
import { findUnfiledThreads } from '@/lib/crm/find-threads-server'
import { askAboutClient } from '@/lib/admin/k/ask-server'
import { generateBrief } from '@/lib/crm/brief'
import { resolveContact, linkCompanyContact } from '@/lib/debit-note-commit'
import { draftPaymentReminder } from '@/lib/crm/payment-reminder-server'

function companyId(id: string): string {
  if (!isUuid(id)) throw new Error('Company id is not valid')
  return id
}

/** The threads the signed-in person may see; a colleague's private thread is a count only. */
export async function companyThreads(id: string) {
  return staffAction('company threads', async user => {
    const { threads, hidden } = await listVisibleCompanyThreads(companyId(id), user.email, { insurers: true })
    return { threads, hidden }
  })
}

export async function companyCases(id: string) {
  return staffAction('company cases', async () => listCompanyCases(companyId(id), await getCompanyThreadIds(id)))
}

export async function companyPlacements(id: string) {
  return staffAction('company placements', async () => {
    const bundle = await loadBundle(companyId(id))
    return { bundle, positions: derivePositions(bundle) }
  })
}

export async function companyPolicies(id: string) {
  return staffAction('company policies', async () => listCompanyPolicies(companyId(id)))
}

export async function companyActivity(id: string) {
  return staffAction('company activity', async () => {
    const company = await getCompany(companyId(id))
    if (!company) throw new Error('Not found')
    const threadIds = await getCompanyThreadIds(id)
    const [payments, quotes, cases] = await Promise.all([loadCompanyPayments(id), listCompanyQuotes(company), listCompanyCases(id, threadIds)])
    return buildActivity(id, { threadIds, payments: payments.notes, quotes, cases })
  })
}

/** The company's threads by relevance (active, back burner, member movements), each with its case. */
export async function companyThreadRelevance(id: string) {
  return staffAction('company relevance', async user => companyRelevance(companyId(id), user.email))
}

/** Unfiled threads from the company's domains or naming it, for Find threads. */
export async function findCompanyThreads(id: string) {
  return staffAction('find threads', async user => findUnfiledThreads(companyId(id), user.email))
}

/** The drafts waiting for review on this company's placements and policies. */
export async function companyDrafts(id: string) {
  return staffAction('company drafts', async () => companyReviewQueue(companyId(id)))
}

/** Opens a case on the company and links the chosen threads that belong to it. */
export async function createCase(id: string, input: { name: string; description?: string; threadIds?: string[] }) {
  return staffAction('create case', async () => {
    const company = await getCompany(companyId(id))
    if (!company) throw new Error('Not found')
    const name = input.name?.trim()
    if (!name) throw new Error('Name the case.')
    const created = await one<{ id: string }>('Create case', db().from('cases')
      .insert({ name, description: input.description?.trim() || null, status: 'open', company_id: id }).select('id').single())
    if (!created) throw new Error('The case was not created.')
    const caseId = created.id
    const allowed = new Set(await getCompanyThreadIds(id))
    const links = (input.threadIds ?? []).filter(t => allowed.has(t)).map(thread_id => ({ case_id: caseId, thread_id, party_type: 'client', party_label: company.name }))
    // The case stands without its links; a failed link is logged, as the route did.
    if (links.length) {
      const { error } = await db().from('case_threads').upsert(links, { onConflict: 'case_id,thread_id', ignoreDuplicates: false })
      if (error) console.error('[action] create case: thread links failed', error.message)
    }
    void logActivity({ action: 'case.created', resource_type: 'company', resource_id: id, new_value: { case_id: caseId, name, threads: links.length } })
    return { id: caseId, linked: links.length }
  })
}

/** Ask about this client: answered from its own repository only, every figure checked (a model call). */
export async function askClient(id: string, question: string) {
  return staffAction('ask client', async user => askAboutClient(companyId(id), question, user.email))
}

/** The Nexus summary of the company (a model call). `deep` reads more of the mail. */
export async function companyBrief(id: string, deep: boolean) {
  return staffAction('company brief', async () => {
    const company = await getCompany(companyId(id))
    if (!company) throw new Error('Not found')
    const result = await generateBrief(company, { deep })
    if (!result.brief) throw new Error(result.error ?? 'No brief produced.')
    return result.brief
  })
}

export type NewContact = { email?: string; name?: string; phone?: string; role?: 'decision_maker' | 'cc' | 'stakeholder' | 'billing' }

/** Adds a person to the company: finds or creates the contact and links it (billing by default). */
export async function addCompanyContact(id: string, body: NewContact) {
  return staffAction('add company contact', async () => {
    const email = body.email?.trim()
    if (!email) throw new Error('Enter an email address.')
    const contactId = await resolveContact({ email, name: body.name ?? null, phone: body.phone ?? null, role: body.role })
    if (!contactId) throw new Error('Could not resolve contact')
    await linkCompanyContact(companyId(id), contactId, body.role ?? 'billing')
    const contact = await one('Company contact', db().from('contacts').select('id, first_name, last_name, email, phone').eq('id', contactId).maybeSingle())
    void logActivity({ action: 'company_contact.added', resource_type: 'company', resource_id: id, new_value: { contact_id: contactId, email } })
    return contact ?? { id: contactId, first_name: null, last_name: null, email, phone: null }
  })
}

/** A payment reminder email for the open debit notes, addressed to the billing contact first. */
export async function paymentReminder(id: string, body: { debitNoteIds?: string[]; toEmail?: string } = {}) {
  return staffAction('payment reminder', async () => draftPaymentReminder(companyId(id), body))
}
