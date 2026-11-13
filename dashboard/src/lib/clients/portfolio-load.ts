/**
 * The client portfolio from the database (src/lib/clients/portfolio.ts). Server only.
 */
import { sb } from '@/lib/crm/db'
import { directory } from '@/lib/admin/k/deposit'
import { clientsForThreads } from '@/lib/nexus/company-view'
import { buildPortfolio, type Portfolio, type PortfolioInput } from './portfolio'

/** Every business ranked, for the window. */
export async function loadPortfolio(window: '12m' | 'all'): Promise<Portfolio> {
  const all = async <T>(path: string): Promise<T[]> => { const out: T[] = []; for (let o = 0; ; o += 1000) { const p = await sb<T[]>(`${path}&order=id&offset=${o}&limit=1000`); out.push(...p); if (p.length < 1000) break } return out }
  const [dir, companies, debitNotes, claims, policies, emails, requests] = await Promise.all([
    directory(),
    all<{ id: string; company_name: string; kind: string | null }>('companies?select=id,company_name,kind'),
    all<PortfolioInput['debitNotes'][number]>('debit_notes?select=id,company_id,issue_date,gross_amount,commission,currency'),
    all<PortfolioInput['claims'][number]>('claims?select=id,company_id,amount_claimed,amount_settled'),
    all<PortfolioInput['policies'][number]>('policies?select=id,company_id,end_date,lifecycle'),
    all<PortfolioInput['emails'][number]>('company_ledger?kind=in.(email_out,email_in)&select=id,group_id,kind,occurred_at'),
    all<PortfolioInput['requests'][number] & { thread_id: string | null }>('follow_ups?select=id,company_id,thread_id,owner_party,what,since_at'),
  ])
  // A request on an insurer's thread is filed under the insurer; it is the client's admin. The
  // client is resolved the way Nexus resolves it (src/lib/nexus/company-view.ts clientsForThreads).
  const clientOf = await clientsForThreads([...new Set(requests.map(r => r.thread_id).filter((x): x is string => !!x))])
  for (const r of requests) { const c = r.thread_id ? clientOf.get(r.thread_id) : undefined; if (c) r.company_id = c.id }
  // Businesses: group roots that are clients. Insurers, partners, TPAs and vendors are not ranked.
  const roots = new Set(companies.map(c => dir.group(c.id)))
  const businesses = companies.filter(c => roots.has(c.id) && (c.kind ?? 'client') === 'client').map(c => ({ id: c.id, name: c.company_name, kind: c.kind }))
  return buildPortfolio({ today: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10), window, businesses, groupOf: id => dir.group(id), debitNotes, claims, policies, emails, requests })
}
