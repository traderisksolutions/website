/**
 * A company's Employment Benefits: the Compare cover of its newest quotation, or New quotation
 * with the company filled in when it has none. One address for every route in (the company
 * page, a thread's rail), so each lands on the same page and Back returns to where it began.
 * Quotations carry the company by name; the match is `companyKey`, as on the register.
 */
import { sbTry, enc } from '@/lib/crm/db'
import { companyKey } from '@/lib/format'

type Quotation = { id: string; company_name: string | null; created_at: string }

/** Pure. Where the company's Employment Benefits opens. */
export function ebHref(company: { id: string; name: string }, quotations: Quotation[]): string {
  const key = companyKey(company.name)
  const newest = key ? quotations.filter(q => companyKey(q.company_name) === key).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : undefined
  return newest
    ? `/pricing-matrix/quote/${newest.id}/compare`
    : `/pricing-matrix/new?company=${encodeURIComponent(company.name)}&companyId=${encodeURIComponent(company.id)}`
}

/** The company's Employment Benefits address, or null when the company is not on file. */
export async function companyEbHref(companyId: string): Promise<string | null> {
  const [company] = await sbTry<{ id: string; company_name: string }[]>(`companies?id=eq.${enc(companyId)}&select=id,company_name&limit=1`, [])
  if (!company) return null
  const quotations = await sbTry<Quotation[]>('gb_quotations?superseded_by=is.null&select=id,company_name,created_at&order=created_at.desc&limit=500', [])
  return ebHref({ id: company.id, name: company.company_name }, quotations)
}
