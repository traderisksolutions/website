/**
 * Reads for the Nexus page: the live ledger plus what was done in the last 7 days, one view of it,
 * and the counts behind every filter.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { chaseable, viewsOf, VIEWS, type View } from './rules'
import type { FollowUp } from './types'
import { clientsForThreads } from './company-view'

/** client_id / client_name: the client the row is about, also when it sits on an insurer's thread. */
export type LedgerRow = FollowUp & { company_name: string | null; client_id: string | null; client_name: string | null; views: View[]; chaseable: boolean }
export type Ledger = { rows: LedgerRow[]; counts: Record<View, number>; chaseable: number; mine_count: number }

export async function loadLedger(opts: { view: View; mine: boolean; actor: string }, now = new Date()): Promise<Ledger> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const all = await sb<FollowUp[]>(`follow_ups?or=(status.in.(open,snoozed),and(status.eq.done,closed_at.gte.${enc(weekAgo)}))&select=*&order=due_at.asc.nullslast&limit=3000`)
  const me = opts.actor.toLowerCase()
  const mine = all.filter(r => (r.owner_email ?? '').toLowerCase() === me)
  const scoped = opts.mine ? mine : all
  const counts = Object.fromEntries(VIEWS.map(v => [v, 0])) as Record<View, number>
  const tagged = scoped.map(r => {
    const views = viewsOf(r, now)
    for (const v of views) counts[v]++
    return { r, views }
  })
  const picked = tagged.filter(t => t.views.includes(opts.view))
  const ids = [...new Set(picked.map(t => t.r.company_id).filter((x): x is string => !!x))]
  const names = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 80) {
    for (const c of await sbTry<{ id: string; company_name: string }[]>(`companies?id=in.(${ids.slice(i, i + 80).join(',')})&select=id,company_name`, [])) names.set(c.id, c.company_name)
  }
  const clients = await clientsForThreads([...new Set(picked.map(t => t.r.thread_id).filter((x): x is string => !!x))])
  const rows = picked.map(({ r, views }) => {
    const client = r.thread_id ? clients.get(r.thread_id) ?? null : null
    return { ...r, company_name: r.company_id ? names.get(r.company_id) ?? null : null, client_id: client?.id ?? null, client_name: client?.name ?? null, views, chaseable: chaseable(r, now) }
  })
  if (opts.view === 'done') rows.sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
  return { rows, counts, chaseable: scoped.filter(r => chaseable(r, now)).length, mine_count: mine.length }
}
