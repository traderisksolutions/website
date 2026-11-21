'use server'
/**
 * People (21 Nov 2026): the People list, recipient suggestions and Add contact. They replace
 * /api/contacts/people, /api/contacts/search and /api/contacts (whose search duplicated
 * contacts/search and had no caller).
 */
import { staffAction } from '@/lib/auth/action'
import { db, rows, one } from '@/lib/db/client'
import { listPeople } from '@/lib/clients/people'
import { resolveCompany } from '@/lib/debit-note-commit'
import { logActivity } from '@/lib/log-activity'

export type ContactSuggestion = { id: string; name: string; email: string; company: string | null; is_employee: boolean }

export async function people() {
  return staffAction('people', async user => ({ people: await listPeople(user.email) }))
}

/** Contacts with an email whose name, email or company contains the text, TRS staff first; `all` gives up to 1,000. */
export async function contactSuggestions(opts: { q?: string; all?: boolean; limit?: number } = {}) {
  return staffAction('contact suggestions', async (): Promise<ContactSuggestion[]> => {
    const q = (opts.q ?? '').trim()
    if (!opts.all && !q) return []
    let query = db().from('contacts').select('id, first_name, last_name, email, company, is_employee').not('email', 'is', null)
    if (!opts.all) {
      const like = `%${q.replace(/[(),*"%_\\]/g, ' ').trim()}%`
      query = query.or(['first_name', 'last_name', 'email', 'company'].map(f => `${f}.ilike.${like}`).join(','))
    }
    const list = await rows<{ id: string; first_name: string | null; last_name: string | null; email: string | null; company: string | null; is_employee: boolean }>('Contacts',
      query.order('is_employee', { ascending: false }).order('created_at', { ascending: false }).limit(opts.all ? 1000 : Math.min(opts.limit ?? 8, 20)))
    return list.map(c => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
      return { id: c.id, name: name || (c.email ?? ''), email: c.email ?? '', company: c.company || null, is_employee: !!c.is_employee }
    })
  })
}

export type NewContact = { first_name?: string; last_name?: string; email?: string; phone?: string; company?: string; company_id?: string; isReferral?: boolean; notes?: string }

/** Adds a person (or updates them by email), files them under a company, and logs a referral when asked. */
export async function createContact(b: NewContact) {
  return staffAction('create contact', async () => {
    const email = b.email?.trim().toLowerCase() || null
    const phone = b.phone?.trim() || null
    if (email && !email.includes('@')) throw new Error('invalid email')
    if (!email && !phone) throw new Error('email or phone required')
    const first_name = b.first_name?.trim() || null, last_name = b.last_name?.trim() || null, company = b.company?.trim() || null
    const picked = typeof b.company_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.company_id) ? b.company_id : null
    const companyId = picked ?? (company ? await resolveCompany({ companyName: company }).catch(() => null) : null)
    const record = { first_name, last_name, email, phone, company, source: 'manual', ...(companyId ? { company_id: companyId } : {}) }
    const write = email
      ? db().from('contacts').upsert(record as never, { onConflict: 'email' })
      : db().from('contacts').insert(record as never)
    const row = await one<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; company: string | null; source: string | null; engagement_stage: string | null; created_at: string }>('Save contact',
      write.select('id, first_name, last_name, email, phone, company, source, engagement_stage, created_at').single())
    if (!row) throw new Error('The contact was not saved.')
    void logActivity({ action: 'contact.created', resource_type: 'contact', resource_id: row.id, new_value: { email, source: 'manual' } })
    if (b.isReferral) {
      const { error } = await db().from('inbound_leads').insert({ contact_id: row.id, company_id: companyId, source: 'referral', status: 'new', first_name, last_name, email, phone, company, details: b.notes?.trim() || null } as never)
      if (error) console.error('[contacts] referral lead insert failed', error.message)
      else void logActivity({ action: 'lead.referral_logged', resource_type: 'contact', resource_id: row.id, new_value: { email, company } })
    }
    return { ...row, source: row.source ?? 'manual', status: row.engagement_stage || 'new' }
  })
}
