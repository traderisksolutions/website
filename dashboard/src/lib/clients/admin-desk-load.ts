/** The admin desk for the top 20%, from the database (src/lib/clients/admin-desk.ts). Server only. */
import { sb } from '@/lib/crm/db'
import { directory } from '@/lib/admin/k/deposit'
import { clientsForThreads } from '@/lib/nexus/company-view'
import { loadPortfolio } from './portfolio-load'
import { detectCycles, toDesk, type DeskBusiness } from './admin-desk'

type Row = { id: string; company_id: string | null; thread_id: string | null; owner_party: string; what: string; status: string; since_at: string; due_at: string | null; snoozed_until: string | null }

export async function loadAdminDesk(): Promise<{ from: string | null; businesses: DeskBusiness[] }> {
  const [portfolio, dir] = await Promise.all([loadPortfolio('12m'), directory()])
  const top = portfolio.rows.filter(r => r.top)
  const requests: Row[] = []
  for (let o = 0; ; o += 1000) { const p = await sb<Row[]>(`follow_ups?select=id,company_id,thread_id,owner_party,what,status,since_at,due_at,snoozed_until&order=id&offset=${o}&limit=1000`); requests.push(...p); if (p.length < 1000) break }
  // The client a request is about, as Nexus resolves it (insurer threads are the client's admin).
  const clientOf = await clientsForThreads([...new Set(requests.map(r => r.thread_id).filter((x): x is string => !!x))])
  const byBusiness = new Map<string, Row[]>()
  for (const r of requests) {
    const c = (r.thread_id ? clientOf.get(r.thread_id)?.id : undefined) ?? r.company_id
    if (!c) continue
    const g = dir.group(c)
    byBusiness.set(g, [...(byBusiness.get(g) ?? []), r])
  }
  // Each business's threads with their first email, from its ledger (own and insurer threads alike).
  const firsts = new Map<string, Map<string, { subject: string; first: string; thread_id: string }>>()
  for (let o = 0; ; o += 1000) {
    const p = await sb<{ group_id: string; thread_id: string; title: string; occurred_at: string }[]>(`company_ledger?kind=in.(email_in,email_out)&thread_id=not.is.null&group_id=in.(${top.map(t => t.id).join(',')})&select=group_id,thread_id,title,occurred_at&order=id&offset=${o}&limit=1000`)
    for (const e of p) {
      const m = firsts.get(e.group_id) ?? new Map(); firsts.set(e.group_id, m)
      const had = m.get(e.thread_id)
      if (!had || e.occurred_at < had.first) m.set(e.thread_id, { subject: e.title.replace(/^(Email (in|out) · )/, ''), first: e.occurred_at, thread_id: e.thread_id })
    }
    if (p.length < 1000) break
  }
  const businesses = top.map(b => {
    // Open, or snoozed and its date has come; a request snoozed into the future is off the desk until then.
    const now = new Date().toISOString()
    const due = (byBusiness.get(b.id) ?? []).filter(r => r.status === 'open' || (r.status === 'snoozed' && (!r.snoozed_until || r.snoozed_until <= now)))
    const open = due.map(toDesk)
      .sort((a, b2) => (a.owner === 'trs' ? 0 : 1) - (b2.owner === 'trs' ? 0 : 1) || a.since.localeCompare(b2.since))
    return {
      id: b.id, name: b.name, rank: b.rank, commission: b.commission, nextRenewal: b.nextRenewal,
      members: [...dir.byId.keys()].filter(id => dir.group(id) === b.id),
      open, cycles: detectCycles([...(firsts.get(b.id)?.values() ?? [])]),
    }
  })
  return { from: portfolio.summary.requestsFrom, businesses }
}
