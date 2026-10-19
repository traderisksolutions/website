// The nightly schedule, per site: the cadence sentence (count, length, post or hold, time), what
// tonight's batch will do, and what the past nights wrote. The engine's planner
// (content-engine/engine/nightly.py) picks the same prompts; tonight() mirrors its rule so the
// preview matches the run.
import { sb, sbCount } from '@/lib/sales/db'
import { n } from '@/lib/sales/labels'
import type { Cadence, GeoAnalysis, GeoQuality, KnowledgeVersionSummary, NightGroup, NightRow, NightStatus, RunSetup, Site, TonightPlan, TonightPrompt } from './types'
import { isMigrationPending, latestAnalysis, latestResults } from './competitors'

const SGT = 'Asia/Singapore'
const HOUR = 3_600_000
const sgtDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: SGT, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const sgtTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: SGT, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
const sgtDayLabel = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: SGT, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)).replace(',', '')

/** The first instant of the current Singapore month, as ISO. */
export function startOfSgtMonth(now = new Date()): string {
  const s = new Date(now.getTime() + 8 * HOUR)
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1) - 8 * HOUR).toISOString()
}

// ── Cadence ──────────────────────────────────────────────────────────────

type CadenceRow = { nightly_count: number; require_approval: boolean; nightly_time?: string | null; article_length?: string | null }

export const defaultCadence = (site: Pick<Site, 'nightly_count' | 'require_approval'>): Cadence => ({ count: site.nightly_count, length: 'standard', post: !site.require_approval, time: '02:00' })

/** nightly_time and article_length arrive with the migration; before it, the defaults. */
export async function cadence(site: Site): Promise<Cadence> {
  try {
    const rows = await sb<CadenceRow[]>(`marketing_sites?id=eq.${site.id}&select=nightly_count,require_approval,nightly_time,article_length&limit=1`)
    const r = rows[0]
    if (!r) return defaultCadence(site)
    return { count: r.nightly_count, length: r.article_length === 'long' ? 'long' : 'standard', post: !r.require_approval, time: r.nightly_time || '02:00' }
  } catch (e) {
    if (isMigrationPending(e)) return defaultCadence(site)
    throw e
  }
}

export type CadenceDbPatch = { nightly_count?: number; article_length?: 'standard' | 'long'; require_approval?: boolean }

/** Validated cadence patch from a request body: count 0..12, length standard|long, post boolean. */
export function cleanCadencePatch(body: Record<string, unknown>): { patch: CadenceDbPatch } | { error: string } {
  const patch: CadenceDbPatch = {}
  if (body.count !== undefined) {
    const v = Math.floor(Number(body.count))
    if (!Number.isFinite(v) || v < 0 || v > 12) return { error: 'Articles per night must be 0 to 12' }
    patch.nightly_count = v
  }
  if (body.length !== undefined) {
    if (body.length !== 'standard' && body.length !== 'long') return { error: 'Length must be standard or long' }
    patch.article_length = body.length
  }
  if (body.post !== undefined) {
    if (typeof body.post !== 'boolean') return { error: 'post must be true or false' }
    patch.require_approval = !body.post
  }
  return { patch }
}

export async function updateCadence(site: Site, patch: CadenceDbPatch): Promise<Cadence> {
  if (Object.keys(patch).length) {
    await sb(`marketing_sites?id=eq.${site.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) })
  }
  return cadence(site)
}

// ── Tonight ──────────────────────────────────────────────────────────────

async function currentKnowledge(siteId: string): Promise<KnowledgeVersionSummary | null> {
  const rows = await sb<KnowledgeVersionSummary[]>(`knowledge_versions?site_id=eq.${siteId}&select=version,word_count,heading_count,created_by,created_at&order=version.desc&limit=1`)
  return rows[0] ?? null
}

/** Prompt ids a run already covers: an article in the last `days`, or a run still queued or running. */
async function promptsWithArticles(siteId: string, days = 90): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 24 * HOUR).toISOString()
  const rows = await sb<{ prompt_id: string }[]>(`blog_generation_runs?site_id=eq.${siteId}&prompt_id=not.is.null&created_at=gte.${since}&or=(article_id.not.is.null,status.in.(queued,running))&select=prompt_id&limit=1000`)
  return new Set(rows.map(r => r.prompt_id))
}

/** What the next batch reads and which prompts it will write for, in order, capped at the cadence count. */
export async function tonight(site: Site, count: number): Promise<TonightPlan> {
  const [analysis, knowledge, selected, covered, results] = await Promise.all([
    latestAnalysis(site.id),
    currentKnowledge(site.id),
    sb<TonightPrompt[]>(`geo_prompts?site_id=eq.${site.id}&selected=is.true&archived=is.false&select=id,site_id,prompt,search_query,impressions,source,selected,archived,created_by,created_at,updated_at&order=impressions.desc.nullslast,prompt&limit=200`),
    promptsWithArticles(site.id),
    latestResults(site.id),
  ])
  const prompts = selected.filter(p => !covered.has(p.id)).slice(0, Math.max(0, count)).map(p => ({ ...p, cited_domains: results[p.id]?.cited_domains ?? [] }))
  return { analysis, knowledge, prompts }
}

// ── Nights ───────────────────────────────────────────────────────────────

type RunRow = { id: string; status: string; setup: Partial<RunSetup> | null; primary_target_name: string | null; article_id: string | null; error: string | null; created_at: string; started_at: string | null; completed_at: string | null; geo_quality: GeoQuality | null }
type ArticleRow = { id: string; title: string; status: string; word_count: number | null; published_at: string | null }

function nightRow(r: RunRow, a: ArticleRow | undefined): NightRow {
  const g = r.geo_quality?.engine
  const title = a?.title || r.setup?.reader_question || r.setup?.topic || r.primary_target_name || '(no title)'
  const when = sgtTime(r.completed_at ?? r.created_at)
  const words = a?.word_count ?? null
  const wordsPart = words != null ? `${n(words)} words` : null
  let status: NightStatus
  let detail: string
  if (r.status === 'failed') { status = 'Failed'; detail = (r.error ?? 'failed').slice(0, 160) }
  else if (r.status === 'cancelled') { status = 'Cancelled'; detail = `cancelled ${when}` }
  else if (r.status === 'running') { status = 'Running'; detail = `running since ${sgtTime(r.started_at ?? r.created_at)}` }
  else if (r.status === 'queued') { status = 'Queued'; detail = 'queued' }
  else if (a?.status === 'published') {
    status = 'Posted'
    detail = [`posted ${sgtTime(a.published_at ?? r.completed_at ?? r.created_at)}`, wordsPart, g?.passed_gate ? 'gate passed' : null].filter(Boolean).join(' · ')
  } else {
    status = 'Held'
    const reason = g?.passed_gate === false ? 'held by gate' : a?.status === 'pending' ? 'awaiting approval' : a ? a.status : 'no article saved'
    detail = [`held ${when}`, wordsPart, reason].filter(Boolean).join(' · ')
  }
  return { run_id: r.id, created_at: r.created_at, completed_at: r.completed_at, title, status, detail, word_count: words, cost_usd: typeof g?.cost_usd === 'number' ? g.cost_usd : null, article_id: r.article_id }
}

/** The last 60 nightly runs (scheduled, or targeting a prompt), grouped by Singapore date, newest first. */
export async function nights(siteId: string, limit = 60): Promise<NightGroup[]> {
  const runs = await sb<RunRow[]>(`blog_generation_runs?site_id=eq.${siteId}&or=(triggered_by.eq.scheduled,prompt_id.not.is.null)&select=id,status,setup,primary_target_name,article_id,error,created_at,started_at,completed_at,geo_quality&order=created_at.desc&limit=${limit}`)
  const ids = runs.map(r => r.article_id).filter((x): x is string => !!x)
  const articles = ids.length ? await sb<ArticleRow[]>(`cms_articles?id=in.(${ids.join(',')})&select=id,title,status,word_count,published_at`) : []
  const byId = new Map(articles.map(a => [a.id, a]))
  const groups: NightGroup[] = []
  for (const r of runs) {
    const date = sgtDate(r.created_at)
    let g = groups[groups.length - 1]
    if (!g || g.date !== date) { g = { date, label: sgtDayLabel(r.created_at), rows: [] }; groups.push(g) }
    g.rows.push(nightRow(r, byId.get(r.article_id ?? '')))
  }
  return groups
}

/** This Singapore month: engine spend across every run, and engine articles published. */
export async function monthFigures(siteId: string): Promise<{ spendUsd: number; posted: number }> {
  const since = startOfSgtMonth()
  const [runs, posted] = await Promise.all([
    sb<{ geo_quality: GeoQuality | null }[]>(`blog_generation_runs?site_id=eq.${siteId}&created_at=gte.${since}&select=geo_quality&limit=1000`),
    sbCount(`cms_articles?site_id=eq.${siteId}&status=eq.published&category=eq.engine&published_at=gte.${since}&select=id`),
  ])
  const spendUsd = runs.reduce((s, r) => s + (typeof r.geo_quality?.engine?.cost_usd === 'number' ? r.geo_quality.engine.cost_usd : 0), 0)
  return { spendUsd: Math.round(spendUsd * 100) / 100, posted }
}

