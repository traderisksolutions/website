/**
 * Company-first sibling to customer-profile.ts (which is deliberately scoped to "how a contact's
 * profile gets assembled" — see that file's own doc comment). This file inverts the direction:
 * given a company, resolve everything that belongs to it.
 */
import { SB_URL, sbHeaders } from '@/lib/sb'

/** Every contact belonging to a company: the company_contacts junction (used since day one)
 *  union contacts.company_id (the direct FK, added 20260819, only backfilled going forward) —
 *  so a company page doesn't miss contacts linked either way. Mirrors resolveCompanyId in
 *  customer-profile.ts, but company-first instead of contact-first. */
export async function getCompanyContactIds(companyId: string): Promise<string[]> {
  const [junctionRes, directRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/company_contacts?company_id=eq.${companyId}&select=contact_id`, { headers: sbHeaders(), cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/contacts?company_id=eq.${companyId}&select=id`, { headers: sbHeaders(), cache: 'no-store' }),
  ])
  const junctionRows: { contact_id: string }[] = junctionRes.ok ? await junctionRes.json() : []
  const directRows: { id: string }[] = directRes.ok ? await directRes.json() : []
  return Array.from(new Set([...junctionRows.map(r => r.contact_id), ...directRows.map(r => r.id)]))
}
