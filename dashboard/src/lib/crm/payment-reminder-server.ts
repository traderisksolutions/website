/**
 * draftPaymentReminder(id, { debitNoteIds?, toEmail? }): the Finance tab's Send reminder.
 * Builds a payment reminder email for the given debit notes (default: every note with money
 * outstanding) addressed to the billing contact, the debit note's contact, or the primary
 * correspondent — in that order. Returns the draft; the client opens it in the composer.
 */
import { getCompany, sbTry, enc } from '@/lib/crm/db'
import { loadCompanyPayments, loadDebitNotesByIds } from '@/lib/crm/payments-server'
import { rankPeople } from '@/lib/crm/people'
import { buildReminderDraft } from '@/lib/crm/reminder'
import { personName } from '@/lib/format'

type ContactRow = { id: string; email: string | null; first_name: string | null; last_name: string | null }

export async function draftPaymentReminder(id: string, body: { debitNoteIds?: string[]; toEmail?: string }) {
  const company = await getCompany(id)
  if (!company) throw new Error('Not found')

  const notes = body.debitNoteIds?.length
    ? (await loadDebitNotesByIds(body.debitNoteIds)).filter(n => n.company_id === id)
    : (await loadCompanyPayments(id)).notes
  const open = notes.filter(n => n.outstanding > 0)
  if (open.length === 0) throw new Error('Nothing is outstanding for this company.')

  let to: { email: string; name: string | null } | null = null
  if (body.toEmail?.trim()) to = { email: body.toEmail.trim(), name: null }
  if (!to) {
    const billing = await sbTry<{ contacts: ContactRow | null }[]>(`company_contacts?company_id=eq.${enc(id)}&role=eq.billing&select=contacts(id,email,first_name,last_name)&limit=1`, [])
    const c = billing[0]?.contacts
    if (c?.email) to = { email: c.email, name: personName(c.first_name, c.last_name, null) === 'Unknown' ? null : personName(c.first_name, c.last_name) }
  }
  if (!to) {
    const contactId = open.find(n => n.contact_id)?.contact_id
    if (contactId) {
      const rows = await sbTry<ContactRow[]>(`contacts?id=eq.${enc(contactId)}&select=id,email,first_name,last_name&limit=1`, [])
      const c = rows[0]
      if (c?.email) to = { email: c.email, name: personName(c.first_name, c.last_name, null) === 'Unknown' ? null : personName(c.first_name, c.last_name) }
    }
  }
  if (!to) {
    const { primary } = await rankPeople(company)
    if (primary) to = { email: primary.email, name: primary.name }
  }
  if (!to) throw new Error('No contact email on file for this company. Add a contact first.')

  return { draft: buildReminderDraft(company, open, to), noteCount: open.length }
}
