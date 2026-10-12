// Reads the leads_unified view. Writes go to the base tables (outreach.ts, ingest.ts).
import 'server-only'
import { isUuid, sb, sbAll, sbPage } from './db'
import { addedSince, leadsListPath, filterClauses, orderClause, type LeadFilters } from './filters'
import { LIST_COLUMNS, type KpiSet, type LeadDetail, type LeadKpis, type LeadRow, type OutreachStatus } from './types'

export async function listLeads(f: LeadFilters): Promise<{ rows: LeadRow[]; total: number }> {
  return sbPage<LeadRow>(leadsListPath(f, LIST_COLUMNS))
}

export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  if (!isUuid(id)) return null
  const rows = await sb<LeadDetail[]>(`leads_unified?id=eq.${id}&select=*&limit=1`)
  return rows[0] ?? null
}

/** Every row matching the filters, for the export. */
export async function allMatching(f: LeadFilters, columns = '*'): Promise<Record<string, unknown>[]> {
  return sbAll<Record<string, unknown>>(`leads_unified?select=${columns}&${[...filterClauses(f), orderClause(f)].join('&')}`)
}

const empty = (): LeadKpis => ({ accounts: 0, contacts: 0, verifiedContacts: 0, withEmail: 0, added24h: 0, added7d: 0, drafts: {} })

/** Counts for every location plus "all", from a slim projection summed here. */
export async function getKpis(): Promise<KpiSet> {
  const byLocation: Record<string, LeadKpis> = { all: empty() }
  let lastAddedAt: string | null = null
  const since24h = addedSince('24h')
  const since7d = addedSince('7d')
  type Slim = { location: string | null; contact_count: number | null; verified_contact_count: number | null; contact_email: string | null; outreach_status: string | null; created_at: string | null }
  const rows = await sbAll<Slim>('leads_unified?select=location,contact_count,verified_contact_count,contact_email,outreach_status,created_at&order=id')
  for (const r of rows) {
    const loc = String(r.location ?? '').toUpperCase() || '??'
    for (const k of [byLocation.all, (byLocation[loc] ??= empty())]) {
      k.accounts += 1
      k.contacts += Number(r.contact_count ?? 0)
      k.verifiedContacts += Number(r.verified_contact_count ?? 0)
      if (r.contact_email) k.withEmail += 1
      if (r.created_at && r.created_at >= since24h) k.added24h += 1
      if (r.created_at && r.created_at >= since7d) k.added7d += 1
      if (r.outreach_status) {
        const s = r.outreach_status as OutreachStatus
        k.drafts[s] = (k.drafts[s] ?? 0) + 1
      }
    }
    if (r.created_at && (!lastAddedAt || r.created_at > lastAddedAt)) lastAddedAt = r.created_at
  }
  return { byLocation, lastAddedAt, newSince: since24h }
}
