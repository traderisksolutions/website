/**
 * People (/contacts): every contact on file outside TRS, with the company it belongs to and its
 * threads. Built from the contacts table (not leads and the newest inbox threads). Thread counts
 * are of threads the signed-in person may see (INB-002); the latest one opens in the Inbox.
 */
import { sbTry, inChunks, isInternal, sbAll } from '@/lib/crm/db'
import { visibleThreadIds } from '@/lib/mail/visibility-server'

export type PersonRow = {
  id: string; name: string; email: string | null; phone: string | null; title: string | null
  company: { id: string; name: string } | null
  /** Free-text company on the contact when it is filed under none. */
  companyText: string | null
  threads: number; latestThreadId: string | null; lastEmailAt: string | null
}

type Contact = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; title: string | null; company: string | null; company_id: string | null; is_employee: boolean | null }
type Thread = { id: string; contact_id: string; last_message_at: string | null }

/** Pure: one row per contact, threads counted and the newest named. */
export function buildPeople(contacts: Contact[], companies: Map<string, string>, junction: Map<string, string>, threads: Thread[]): PersonRow[] {
  const byContact = new Map<string, Thread[]>()
  for (const t of threads) byContact.set(t.contact_id, [...(byContact.get(t.contact_id) ?? []), t])
  return contacts
    .filter(c => !c.is_employee && !(c.email && isInternal(c.email)))
    .map(c => {
      const companyId = c.company_id ?? junction.get(c.id) ?? null
      const mine = (byContact.get(c.id) ?? []).sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
      return {
        id: c.id, name: name || c.email || 'No name', email: c.email, phone: c.phone, title: c.title,
        company: companyId && companies.has(companyId) ? { id: companyId, name: companies.get(companyId)! } : null,
        companyText: companyId && companies.has(companyId) ? null : c.company?.trim() || null,
        threads: mine.length, latestThreadId: mine[0]?.id ?? null, lastEmailAt: mine[0]?.last_message_at ?? null,
      }
    })
    .sort((a, b) => (b.lastEmailAt ?? '').localeCompare(a.lastEmailAt ?? '') || a.name.localeCompare(b.name))
}

export async function listPeople(viewer: string | null): Promise<PersonRow[]> {
  const [contacts, links] = await Promise.all([
    sbTry<Contact[]>(`contacts?select=id,first_name,last_name,email,phone,title,company,company_id,is_employee&order=created_at.desc&limit=5000`, []),
    sbTry<{ contact_id: string; company_id: string }[]>(`company_contacts?select=contact_id,company_id&limit=5000`, []),
  ])
  const junction = new Map(links.map(l => [l.contact_id, l.company_id]))
  const companyIds = Array.from(new Set([...contacts.map(c => c.company_id), ...links.map(l => l.company_id)].filter((x): x is string => !!x)))
  const ids = contacts.map(c => c.id)
  const [companies, threads] = await Promise.all([
    inChunks(companyIds, 100, c => sbAll<{ id: string; company_name: string | null }>(`companies?id=in.(${c.join(',')})&select=id,company_name`)),
    inChunks(ids, 100, c => sbAll<Thread>(`email_threads?contact_id=in.(${c.join(',')})&deleted_at=is.null&select=id,contact_id,last_message_at&limit=5000`)),
  ])
  const visible = await visibleThreadIds(threads.map(t => t.id), viewer)
  return buildPeople(contacts, new Map(companies.map(c => [c.id, c.company_name ?? 'Company'])), junction, threads.filter(t => visible.has(t.id)))
}
