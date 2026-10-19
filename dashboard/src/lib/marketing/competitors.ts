// Competitors and the GEO analysis, per site: the rival websites, the prompts a buyer asks an
// AI assistant, and every version of the analysis the engine ran over them. The engine
// (content-engine/engine/competitors.py) does the reading and scoring; this file is the
// dashboard's reads and the few writes a person makes.
//
// Lag rule: the dashboard may deploy before migration 20261019_marketing_v2 is applied. The API
// routes catch errors with isMigrationPending() and answer { migrationPending: true }.
import { sb } from '@/lib/sales/db'
import { engineConfigured, engineStartAnalysis } from './engine'
import type { Competitor, GeoAnalysis, GeoPrompt, GeoPromptResult } from './types'

export const MIGRATION_PENDING_LINE = 'Migration 20261019_marketing_v2 is not applied yet.'

/** A PostgREST error for a table or column the migration has not created yet. */
export function isMigrationPending(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /does not exist|42P01|PGRST205/i.test(m)
}

const isConflict = (e: unknown) => e instanceof Error && /\(409\)|23505/.test(e.message)

const COMP_COLS = 'id,site_id,name,url,domain,blog_url,sitemap_url,status,pages_count,best_page_url,best_page_note,cited_count,search_hits,last_analysed_at,added_by,created_at,updated_at'
const PROMPT_COLS = 'id,site_id,prompt,search_query,impressions,source,selected,archived,created_by,created_at,updated_at'
const ANALYSIS_COLS = 'id,site_id,version,status,pages_read,prompts_checked,cited_count,cost_usd,model,summary,error,started_at,completed_at,created_by,created_at'
const RESULT_COLS = 'id,analysis_id,site_id,prompt_id,cited_domains,cited_urls,search_urls,us_cited,tone,answer_excerpt,created_at'

// ── URL rules (pure) ─────────────────────────────────────────────────────

/** `provide.sg`, `www.provide.sg/blog`, `https://provide.sg/` → `{ url: 'https://provide.sg', domain: 'provide.sg' }`. */
export function normaliseUrl(input: unknown): { url: string; domain: string } | { error: string } {
  let s = String(input ?? '').trim()
  if (!s) return { error: 'Paste the company website' }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`
  let u: URL
  try { u = new URL(s) } catch { return { error: 'Not a web address' } }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'The address must start with https://' }
  if (u.username || u.password) return { error: 'Not a web address' }
  const domain = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { error: 'Not a domain' }
  return { url: `https://${domain}`, domain }
}

const SECOND_LEVEL = new Set(['com', 'co', 'org', 'net', 'gov', 'edu', 'ac'])

/** The placeholder name until the sweep reads the homepage title: `singlife.com.sg` → `Singlife`. */
export function autoName(domain: string): string {
  const labels = domain.split('.').filter(Boolean)
  if (labels.length > 1) labels.pop()
  if (labels.length > 1 && SECOND_LEVEL.has(labels[labels.length - 1])) labels.pop()
  const core = labels[labels.length - 1] ?? domain
  return core.charAt(0).toUpperCase() + core.slice(1)
}

// ── Competitors ──────────────────────────────────────────────────────────

export async function listCompetitors(siteId: string): Promise<Competitor[]> {
  return sb<Competitor[]>(`marketing_competitors?site_id=eq.${siteId}&status=eq.active&select=${COMP_COLS}&order=cited_count.desc,search_hits.desc,created_at&limit=500`)
}

/** Adds by URL. A domain already on the list (active or removed) comes back as the existing row, re-activated. */
export async function addCompetitor(siteId: string, input: unknown, actor: string): Promise<{ competitor: Competitor } | { error: string }> {
  const norm = normaliseUrl(input)
  if ('error' in norm) return norm
  const now = new Date().toISOString()
  try {
    const rows = await sb<Competitor[]>(`marketing_competitors?select=${COMP_COLS}`, {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId, name: autoName(norm.domain), url: norm.url, domain: norm.domain, status: 'active', added_by: actor, created_at: now, updated_at: now }),
    })
    return { competitor: rows[0] }
  } catch (e) {
    if (!isConflict(e)) throw e
    const existing = await sb<Competitor[]>(`marketing_competitors?site_id=eq.${siteId}&domain=eq.${encodeURIComponent(norm.domain)}&select=${COMP_COLS}&limit=1`)
    const row = existing[0]
    if (!row) throw e
    if (row.status === 'active') return { competitor: row }
    const revived = await sb<Competitor[]>(`marketing_competitors?id=eq.${row.id}&select=${COMP_COLS}`, { method: 'PATCH', body: JSON.stringify({ status: 'active', added_by: actor, updated_at: now }) })
    return { competitor: revived[0] ?? row }
  }
}

export async function removeCompetitor(siteId: string, id: string): Promise<boolean> {
  const rows = await sb<{ id: string }[]>(`marketing_competitors?id=eq.${id}&site_id=eq.${siteId}&status=eq.active&select=id`, { method: 'PATCH', body: JSON.stringify({ status: 'removed', updated_at: new Date().toISOString() }) })
  return rows.length > 0
}

// ── Prompts ──────────────────────────────────────────────────────────────

/** Ticked first, then by Search Console impressions (unknown last), then oldest first. */
export async function listPrompts(siteId: string): Promise<GeoPrompt[]> {
  return sb<GeoPrompt[]>(`geo_prompts?site_id=eq.${siteId}&archived=is.false&select=${PROMPT_COLS}&order=selected.desc,impressions.desc.nullslast,created_at&limit=1000`)
}

export async function addPrompt(siteId: string, input: { prompt?: unknown; search_query?: unknown }, actor: string): Promise<{ prompt: GeoPrompt } | { error: string }> {
  const prompt = String(input.prompt ?? '').trim().replace(/\s+/g, ' ').slice(0, 500)
  const search = String(input.search_query ?? '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 300)
  if (prompt.length < 8) return { error: 'Write the prompt as a person would ask it (8 characters or more)' }
  const now = new Date().toISOString()
  try {
    const rows = await sb<GeoPrompt[]>(`geo_prompts?select=${PROMPT_COLS}`, {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId, prompt, search_query: search, source: 'manual', selected: false, archived: false, created_by: actor, created_at: now, updated_at: now }),
    })
    return { prompt: rows[0] }
  } catch (e) {
    if (!isConflict(e)) throw e
    const existing = await sb<GeoPrompt[]>(`geo_prompts?site_id=eq.${siteId}&prompt=eq.${encodeURIComponent(prompt)}&select=${PROMPT_COLS}&limit=1`)
    const row = existing[0]
    if (!row) throw e
    if (!row.archived) return { prompt: row }
    const revived = await sb<GeoPrompt[]>(`geo_prompts?id=eq.${row.id}&select=${PROMPT_COLS}`, { method: 'PATCH', body: JSON.stringify({ archived: false, search_query: search || row.search_query, updated_at: now }) })
    return { prompt: revived[0] ?? row }
  }
}

export async function setPromptSelected(siteId: string, id: string, selected: boolean): Promise<GeoPrompt | null> {
  const rows = await sb<GeoPrompt[]>(`geo_prompts?id=eq.${id}&site_id=eq.${siteId}&select=${PROMPT_COLS}`, { method: 'PATCH', body: JSON.stringify({ selected, updated_at: new Date().toISOString() }) })
  return rows[0] ?? null
}

export async function archivePrompt(siteId: string, id: string): Promise<boolean> {
  const rows = await sb<{ id: string }[]>(`geo_prompts?id=eq.${id}&site_id=eq.${siteId}&select=id`, { method: 'PATCH', body: JSON.stringify({ archived: true, selected: false, updated_at: new Date().toISOString() }) })
  return rows.length > 0
}

// ── Analyses ─────────────────────────────────────────────────────────────

export async function listAnalyses(siteId: string, limit = 50): Promise<GeoAnalysis[]> {
  return sb<GeoAnalysis[]>(`geo_analyses?site_id=eq.${siteId}&select=${ANALYSIS_COLS}&order=version.desc&limit=${limit}`)
}

export async function latestAnalysis(siteId: string): Promise<GeoAnalysis | null> {
  const rows = await sb<GeoAnalysis[]>(`geo_analyses?site_id=eq.${siteId}&status=eq.completed&select=${ANALYSIS_COLS}&order=version.desc&limit=1`)
  return rows[0] ?? null
}

export async function activeAnalysis(siteId: string): Promise<GeoAnalysis | null> {
  const rows = await sb<GeoAnalysis[]>(`geo_analyses?site_id=eq.${siteId}&status=in.(queued,running)&select=${ANALYSIS_COLS}&order=version.desc&limit=1`)
  return rows[0] ?? null
}

/** One analysis's results keyed by prompt id. */
export async function resultsFor(analysisId: string): Promise<Record<string, GeoPromptResult>> {
  const rows = await sb<GeoPromptResult[]>(`geo_prompt_results?analysis_id=eq.${analysisId}&select=${RESULT_COLS}&limit=1000`)
  return Object.fromEntries(rows.map(r => [r.prompt_id, r]))
}

/** Results of the latest completed analysis keyed by prompt id; empty before the first run. */
export async function latestResults(siteId: string): Promise<Record<string, GeoPromptResult>> {
  const latest = await latestAnalysis(siteId)
  return latest ? resultsFor(latest.id) : {}
}

/** Queues analysis version max+1 and nudges the engine. One at a time per site. */
export async function createAnalysis(siteId: string, actor: string): Promise<{ analysisId: string; version: number; started: boolean; note: string | null } | { error: string; status: 409 }> {
  if (await activeAnalysis(siteId)) return { error: 'An analysis is already queued or running for this site', status: 409 }
  const insert = async (version: number) => sb<{ id: string; version: number }[]>('geo_analyses?select=id,version', {
    method: 'POST', body: JSON.stringify({ site_id: siteId, version, status: 'queued', created_by: actor }),
  })
  const top = await sb<{ version: number }[]>(`geo_analyses?site_id=eq.${siteId}&select=version&order=version.desc&limit=1`)
  const next = (top[0]?.version ?? 0) + 1
  let rows: { id: string; version: number }[]
  try { rows = await insert(next) } catch (e) { if (!isConflict(e)) throw e; rows = await insert(next + 1) }
  const row = rows[0]
  const started = await engineStartAnalysis(row.id)
  const note = started.ok ? null : engineConfigured()
    ? `Queued for the engine's worker (direct start unavailable: ${started.error}).`
    : 'Queued. The content engine is not connected yet (CONTENT_ENGINE_URL), so this analysis waits until it is.'
  return { analysisId: row.id, version: row.version, started: started.ok, note }
}
