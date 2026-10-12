// Pull Search Console data for a connected site: a 90-day daily trend (upserted) and the top
// pages, queries and query×page pairs for the latest 28 days (replaced each sync).
import { sb } from '@/lib/sales/db'
import { decryptSecret } from './crypto'
import { querySearchAnalytics, refreshAccessToken } from './client'

const TREND_DAYS = 90
const WINDOW_DAYS = 28
const TOP_LIMIT = 1000
const PAIR_LIMIT = 5000

const isoDaysAgo = (days: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10) }

export type SyncResult = { ok: boolean; siteId: string; days?: number; pages?: number; queries?: number; pairs?: number; error?: string }

export async function syncSite(siteId: string): Promise<SyncResult> {
  const conns = await sb<{ property_url: string | null; refresh_token_encrypted: string | null; status: string }[]>(`gsc_connections?site_id=eq.${siteId}&select=property_url,refresh_token_encrypted,status&limit=1`)
  const conn = conns[0]
  if (!conn || conn.status === 'disconnected') return { ok: false, siteId, error: 'Not connected' }
  if (!conn.property_url) return { ok: false, siteId, error: 'No property selected' }
  if (!conn.refresh_token_encrypted) return { ok: false, siteId, error: 'No refresh token' }

  const now = new Date().toISOString()
  try {
    const token = await refreshAccessToken(decryptSecret(conn.refresh_token_encrypted))
    const property = conn.property_url
    const [daily, pages, queries, pairs] = await Promise.all([
      querySearchAnalytics(token, property, { startDate: isoDaysAgo(TREND_DAYS), endDate: isoDaysAgo(0), dimensions: ['date'], rowLimit: TREND_DAYS + 5 }),
      querySearchAnalytics(token, property, { startDate: isoDaysAgo(WINDOW_DAYS), endDate: isoDaysAgo(0), dimensions: ['page'], rowLimit: TOP_LIMIT }),
      querySearchAnalytics(token, property, { startDate: isoDaysAgo(WINDOW_DAYS), endDate: isoDaysAgo(0), dimensions: ['query'], rowLimit: TOP_LIMIT }),
      querySearchAnalytics(token, property, { startDate: isoDaysAgo(WINDOW_DAYS), endDate: isoDaysAgo(0), dimensions: ['query', 'page'], rowLimit: PAIR_LIMIT }),
    ])
    const metrics = (r: { impressions: number; clicks: number; ctr: number; position: number }) => ({ impressions: Math.round(r.impressions), clicks: Math.round(r.clicks), ctr: Number(r.ctr.toFixed(4)), position: Number(r.position.toFixed(2)) })

    if (daily.length) {
      await sb('gsc_daily?on_conflict=site_id,date', { method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates', body: JSON.stringify(daily.map(r => ({ site_id: siteId, date: r.keys?.[0] ?? isoDaysAgo(0), ...metrics(r) }))) })
    }
    await sb(`gsc_pages?site_id=eq.${siteId}`, { method: 'DELETE', prefer: 'return=minimal' })
    if (pages.length) await sb('gsc_pages', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(pages.map(r => ({ site_id: siteId, page: r.keys?.[0] ?? '', window_days: WINDOW_DAYS, synced_at: now, ...metrics(r) }))) })
    await sb(`gsc_queries?site_id=eq.${siteId}`, { method: 'DELETE', prefer: 'return=minimal' })
    if (queries.length) await sb('gsc_queries', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(queries.map(r => ({ site_id: siteId, query: r.keys?.[0] ?? '', window_days: WINDOW_DAYS, synced_at: now, ...metrics(r) }))) })
    await sb(`gsc_query_pages?site_id=eq.${siteId}`, { method: 'DELETE', prefer: 'return=minimal' })
    for (let i = 0; i < pairs.length; i += 500) {
      await sb('gsc_query_pages', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(pairs.slice(i, i + 500).map(r => ({ site_id: siteId, query: r.keys?.[0] ?? '', page: r.keys?.[1] ?? '', window_days: WINDOW_DAYS, synced_at: now, ...metrics(r) }))) })
    }
    await sb(`gsc_connections?site_id=eq.${siteId}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'connected', last_error: null, last_synced_at: now, updated_at: now }) })
    return { ok: true, siteId, days: daily.length, pages: pages.length, queries: queries.length, pairs: pairs.length }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await sb(`gsc_connections?site_id=eq.${siteId}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'error', last_error: message.slice(0, 500), updated_at: now }) }).catch(() => undefined)
    return { ok: false, siteId, error: message }
  }
}

/** Every connected site, for the daily cron. */
export async function syncAllSites(): Promise<SyncResult[]> {
  const conns = await sb<{ site_id: string }[]>('gsc_connections?status=in.(connected,error)&property_url=not.is.null&select=site_id')
  const out: SyncResult[] = []
  for (const c of conns) out.push(await syncSite(c.site_id))
  return out
}
