/**
 * The old New quotation (retired 20 Nov 2026): every link lands on /eb, the one quotation screen.
 * ?companyId=<id> (or a company id in ?company) fills the company; ?thread and ?hrLink carry over.
 * A company named without an id is dropped: /eb fills the company from its id only.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export default async function OldNewQuotation({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams
  const one = (k: string) => { const v = p[k]; return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined }
  const q = new URLSearchParams()
  const company = [one('companyId'), one('company')].find(v => v && UUID.test(v))
  if (company) q.set('company', company)
  for (const k of ['thread', 'hrLink']) { const v = one(k); if (v && /^[\w-]{1,80}$/.test(v)) q.set(k, v) }
  redirect(`/eb${q.size ? `?${q}` : ''}`)
}
