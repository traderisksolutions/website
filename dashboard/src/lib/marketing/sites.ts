// The websites the business owns. Every Marketing screen and API is scoped to one of them:
// `?site=<key|id>` on the request, else the first by sort order.
import { sb, enc, isUuid } from '@/lib/sales/db'
import type { Site, SiteSummary } from './types'

const COLS = 'id,key,name,domain,base_url,blog_base_path,contact_url,business_name,markets,brand_terms,topic_terms,pillar_pages,topics,banned_terms,require_approval,nightly_count,sort_order,updated_at'

export async function listSites(): Promise<Site[]> {
  return sb<Site[]>(`marketing_sites?select=${COLS}&order=sort_order,name`)
}

/** By id, key or domain. Null ref → the first site. Null result → no such site. */
export async function getSite(ref: string | null | undefined): Promise<Site | null> {
  const r = (ref ?? '').trim().toLowerCase()
  const filter = !r ? '' : isUuid(r) ? `&id=eq.${r}` : `&or=(key.eq.${enc(r)},domain.eq.${enc(r)})`
  const rows = await sb<Site[]>(`marketing_sites?select=${COLS}${filter}&order=sort_order,name&limit=1`)
  return rows[0] ?? null
}

export const summarise = (s: Site): SiteSummary => ({
  id: s.id, key: s.key, name: s.name, domain: s.domain, base_url: s.base_url, blog_base_path: s.blog_base_path,
  topics: s.topics, markets: s.markets, require_approval: s.require_approval, nightly_count: s.nightly_count,
})

/** The public URL of an article. A blog_base_path containing ":market" (e.g. "/:market/articles")
 *  puts each article under its market's folder: SG → /sg/articles/<slug>. */
export const articleUrl = (site: Pick<Site, 'base_url' | 'blog_base_path'>, slug: string, market = 'SG') =>
  `${site.base_url.replace(/\/$/, '')}${site.blog_base_path.replace(':market', market.toLowerCase()).replace(/\/$/, '')}/${slug}`

const list = (v: unknown, max = 50, len = 80) => Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean))).slice(0, max).map(x => x.slice(0, len)) : null
const isHttp = (u: string) => { try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:' } catch { return false } }

/** Validated patch of the editable fields. Returns the error text when a value is rejected. */
export function cleanSitePatch(body: Record<string, unknown>): { patch: Partial<Site> } | { error: string } {
  const patch: Partial<Site> = {}
  if (body.name !== undefined) { const v = String(body.name).trim(); if (v.length < 2 || v.length > 80) return { error: 'Name must be 2 to 80 characters' }; patch.name = v }
  if (body.business_name !== undefined) { const v = String(body.business_name).trim(); if (v.length < 2 || v.length > 120) return { error: 'Business name must be 2 to 120 characters' }; patch.business_name = v }
  if (body.base_url !== undefined) { const v = String(body.base_url).trim().replace(/\/$/, ''); if (!isHttp(v)) return { error: 'Base URL must start with https://' }; patch.base_url = v }
  if (body.blog_base_path !== undefined) { const v = String(body.blog_base_path).trim(); if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(v)) return { error: 'Blog path must look like /articles' }; patch.blog_base_path = v }
  if (body.contact_url !== undefined) { const v = String(body.contact_url).trim(); if (v && !isHttp(v)) return { error: 'Contact URL must start with https://' }; patch.contact_url = v }
  for (const k of ['markets', 'brand_terms', 'topic_terms', 'topics', 'banned_terms'] as const) {
    if (body[k] !== undefined) { const v = list(body[k]); if (!v) return { error: `${k} must be a list` }; patch[k] = v }
  }
  if (patch.markets) {
    patch.markets = patch.markets.map(m => m.toUpperCase()).filter(m => ['SG', 'HK', 'MY', 'ID'].includes(m))
    if (patch.markets.length === 0) return { error: 'At least one market' }
  }
  if (body.pillar_pages !== undefined) {
    if (!Array.isArray(body.pillar_pages)) return { error: 'pillar_pages must be a list' }
    const pages = body.pillar_pages.filter((p): p is { url: string; title?: string } => !!p && typeof p === 'object' && typeof (p as { url?: unknown }).url === 'string')
      .map(p => ({ url: p.url.trim(), title: String(p.title ?? '').trim().slice(0, 120) })).filter(p => isHttp(p.url)).slice(0, 20)
    patch.pillar_pages = pages
  }
  if (body.require_approval !== undefined) patch.require_approval = body.require_approval === true || body.require_approval === 'true'
  if (body.nightly_count !== undefined) { const v = Math.floor(Number(body.nightly_count)); if (!Number.isFinite(v) || v < 0 || v > 12) return { error: 'Nightly count must be 0 to 12' }; patch.nightly_count = v }
  return { patch }
}

export async function updateSite(id: string, patch: Partial<Site>): Promise<Site> {
  const rows = await sb<Site[]>(`marketing_sites?id=eq.${id}&select=${COLS}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) })
  if (!rows[0]) throw new Error('Site not found')
  return rows[0]
}
