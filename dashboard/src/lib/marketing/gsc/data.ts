// What the Search Console page shows for one site: the connection, 28-day totals, the trend,
// top pages and queries, and the ranked actions.
import { sb } from '@/lib/sales/db'
import { classifyQueries, weightedPosition, type QueryPageRow } from './actions'
import type { GscConnectionView, GscOverview, GscRow, Site } from '../types'

const isoDaysAgo = (days: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10) }

export async function loadConnection(siteId: string): Promise<GscConnectionView | null> {
  const rows = await sb<GscConnectionView[]>(`gsc_connections?site_id=eq.${siteId}&select=site_id,google_email,property_url,available_sites,status,last_error,last_synced_at&limit=1`)
  return rows[0] ?? null
}

export async function getGscOverview(site: Site): Promise<GscOverview> {
  const [connection, trend, pages, queries, pairs] = await Promise.all([
    loadConnection(site.id),
    sb<{ date: string; impressions: number; clicks: number; position: number }[]>(`gsc_daily?site_id=eq.${site.id}&select=date,impressions,clicks,position&order=date&limit=120`),
    sb<{ page: string; impressions: number; clicks: number; ctr: number; position: number }[]>(`gsc_pages?site_id=eq.${site.id}&select=page,impressions,clicks,ctr,position&order=impressions.desc&limit=25`),
    sb<{ query: string; impressions: number; clicks: number; ctr: number; position: number }[]>(`gsc_queries?site_id=eq.${site.id}&select=query,impressions,clicks,ctr,position&order=impressions.desc&limit=50`),
    sb<QueryPageRow[]>(`gsc_query_pages?site_id=eq.${site.id}&select=query,page,impressions,clicks,ctr,position&limit=5000`),
  ])
  const recent = trend.filter(d => d.date >= isoDaysAgo(28))
  const impressions = recent.reduce((s, r) => s + r.impressions, 0)
  const clicks = recent.reduce((s, r) => s + r.clicks, 0)
  const toRow = (label: string, r: { impressions: number; clicks: number; ctr: number; position: number }): GscRow => ({ label, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position })
  return {
    connection,
    totals: { impressions, clicks, ctr: impressions > 0 ? clicks / impressions : 0, position: weightedPosition(recent), days: recent.length },
    trend,
    topPages: pages.map(p => toRow(p.page, p)),
    topQueries: queries.map(q => toRow(q.query, q)),
    actions: classifyQueries(pairs, { brandTerms: site.brand_terms.length ? site.brand_terms : [site.name] }).slice(0, 40),
  }
}
