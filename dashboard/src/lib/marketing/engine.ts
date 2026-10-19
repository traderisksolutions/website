// Generation runs: the row the dashboard creates, the HTTP nudge to the Python engine, and
// the reads the run page polls. The engine also polls for queued runs, so every call to it is
// best-effort: a failure means "picked up within ENGINE_POLL_SECONDS", not a lost run.
import { sb, isUuid } from '@/lib/sales/db'
import type { RunDetail, RunListRow, RunNode, RunSetup, Site } from './types'
import { isMarket } from './knowledge-schema'

// Mirrors content-engine/engine/pipeline.py NODE_DEFS. Used to pre-seed node rows so the run
// page has its full shape before the engine picks the run up.
export const ENGINE_NODE_DEFS: { key: string; label: string; type: string; example: string }[] = [
  { key: 'load_knowledge', label: 'Load knowledge bank', type: 'retrieval', example: 'Business facts, the focused product, case studies, market notes' },
  { key: 'strategist', label: 'Choose the angle', type: 'agent', example: 'Reader, question, thesis, search terms, knowledge gaps' },
  { key: 'researcher', label: 'Build the fact pack', type: 'agent', example: 'Numbered facts, each tied to a knowledge entry' },
  { key: 'outliner', label: 'Structure the article', type: 'agent', example: 'Answer-first summary, question headings, takeaways' },
  { key: 'writer', label: 'Write the draft', type: 'agent', example: 'Every specific sentence carries a fact marker' },
  { key: 'fact_checker', label: 'Check every claim', type: 'agent', example: 'Supported, unsupported, contradicted; sends the draft back' },
  { key: 'seo_geo_editor', label: 'SEO and GEO edit', type: 'agent', example: 'Title, meta, slug, FAQ, internal links' },
  { key: 'readability_editor', label: 'Make it scannable', type: 'agent', example: 'Short paragraphs, bold takeaways, lists' },
  { key: 'cta_composer', label: 'Write the calls to action', type: 'agent', example: 'Mid-article and closing invitations to get in touch' },
  { key: 'quality_gate', label: 'Quality gate', type: 'validation', example: 'Superlatives, banned terms, unmarked numbers, length' },
  { key: 'assemble', label: 'Assemble the article', type: 'formatting', example: 'Footnotes, FAQ, JSON-LD, HTML' },
  { key: 'publish', label: 'Save to the library', type: 'persistence', example: 'Held for approval, or published' },
]

const BASE = (process.env.CONTENT_ENGINE_URL ?? '').replace(/\/$/, '')
const SECRET = process.env.CONTENT_ENGINE_SECRET ?? ''

export const engineConfigured = () => Boolean(BASE && SECRET)

async function call<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!engineConfigured()) return { ok: false, error: 'CONTENT_ENGINE_URL / CONTENT_ENGINE_SECRET not set' }
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}`, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
    const json = (await res.json().catch(() => ({}))) as T & { detail?: string }
    if (!res.ok) return { ok: false, error: (json as { detail?: string }).detail ?? `engine responded ${res.status}` }
    return { ok: true, data: json }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

export const engineHealth = () => call<{ ok: boolean; active_runs: string[]; models: { strong: string; fast: string } }>('/health', { method: 'GET' }, 5000)
export const engineStartRun = (runId: string) => call<{ runId: string; status: string }>(`/runs/${runId}/start`, { method: 'POST' })
/** Nudge the engine to start a competitor analysis; its worker also claims queued analyses. */
export const engineStartAnalysis = (analysisId: string) => call<{ analysisId: string; status: string }>(`/analyses/${analysisId}/start`, { method: 'POST' })
/** Create tonight's batch for one site now. The engine plans the runs before answering, so allow longer. */
export const engineNightly = (siteId: string) => call<{ created: string[]; count: number }>(`/nightly?site_id=${encodeURIComponent(siteId)}`, { method: 'POST' }, 20000)

const FOCUS_TYPES = new Set(['product', 'case_study', 'market', 'topic', 'question'])

/** Validated setup from a request body. Returns the error text when rejected. */
export function cleanSetup(site: Site, body: Record<string, unknown>): { setup: RunSetup } | { error: string } {
  const focus = (body.focus ?? {}) as Partial<RunSetup['focus']>
  const focusType = focus.type && FOCUS_TYPES.has(focus.type) ? focus.type : 'topic'
  const topic = String(body.topic ?? '').trim().slice(0, 300)
  const focusId = String(focus.id ?? '').trim().slice(0, 80)
  const focusLabel = String(focus.label ?? '').trim().slice(0, 200)
  if (focusType === 'topic' && topic.length < 4 && focusLabel.length < 4) return { error: 'Give a topic, or choose a product or case study to focus on' }
  if ((focusType === 'product' || focusType === 'case_study') && !focusId) return { error: 'Choose the entry to focus on' }
  // Only the site's own markets: an article for a market the site does not serve has no home.
  const market = isMarket(body.market) && site.markets.includes(body.market) ? body.market : site.markets[0] ?? 'SG'
  const topicLabel = String(body.topic_label ?? '').trim()
  if (topicLabel && site.topics.length && !site.topics.includes(topicLabel)) return { error: `Topic must be one of: ${site.topics.join(', ')}` }
  return {
    setup: {
      engine: 'python', site_id: site.id, topic_label: topicLabel,
      focus: { type: focusType, id: focusId, label: focusLabel || (focusType === 'topic' ? topic : '') },
      market, language: body.language === 'en' || body.language === 'id' ? body.language : '',
      topic, reader_question: String(body.reader_question ?? '').trim().slice(0, 500),
      objective: String(body.objective ?? '').trim().slice(0, 300) || 'bring in enquiries for the business',
      length: body.length === 'long' ? 'long' : 'standard',
      extra_instructions: String(body.extra_instructions ?? '').trim().slice(0, 2000),
      contact_url: '', auto_publish: false,
      target_query: String(body.target_query ?? '').trim().slice(0, 300), target_position: Number(body.target_position) || 0,
      prompt_id: isUuid(String(body.prompt_id ?? '')) ? String(body.prompt_id).toLowerCase() : '',
    },
  }
}

/** Inserts the run and its node rows, then nudges the engine. */
export async function createRun(site: Site, setup: RunSetup, actor: string, triggeredBy = 'manual'): Promise<{ runId: string; started: boolean; note: string | null }> {
  const rows = await sb<{ id: string }[]>('blog_generation_runs?select=id', {
    method: 'POST',
    body: JSON.stringify({
      site_id: site.id, status: 'queued', setup, targets: [],
      primary_target_id: setup.focus.id || null, primary_target_type: setup.focus.id ? setup.focus.type : null, primary_target_name: setup.focus.label || setup.topic || null,
      triggered_by: triggeredBy, created_by: actor,
      ...(setup.prompt_id ? { prompt_id: setup.prompt_id } : {}),
    }),
  })
  const runId = rows[0].id
  await sb('blog_generation_nodes', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(ENGINE_NODE_DEFS.map((n, i) => ({ run_id: runId, site_id: site.id, node_key: n.key, label: n.label, type: n.type, status: 'queued', sort_order: i }))) })
  const started = await engineStartRun(runId)
  let note: string | null = null
  if (!started.ok) {
    note = engineConfigured() ? `Queued for the engine's poll loop (direct start unavailable: ${started.error}).` : 'Queued. The content engine is not connected yet (CONTENT_ENGINE_URL), so this run waits until it is.'
    await sb('blog_generation_events', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ run_id: runId, site_id: site.id, level: 'info', message: note, metadata: {} }) })
  }
  return { runId, started: started.ok, note }
}

const RUN_COLS = 'id,status,setup,primary_target_name,article_id,total_duration_ms,error,triggered_by,created_by,created_at,completed_at,geo_quality'

export async function listRuns(siteId: string, limit = 30): Promise<RunListRow[]> {
  return sb<RunListRow[]>(`blog_generation_runs?site_id=eq.${siteId}&select=${RUN_COLS}&order=created_at.desc&limit=${limit}`)
}

export async function getRun(siteId: string, id: string): Promise<RunDetail | null> {
  const [runs, nodes, events, sources] = await Promise.all([
    sb<(RunListRow & { started_at: string | null; draft: RunDetail['run']['draft'] })[]>(`blog_generation_runs?id=eq.${id}&site_id=eq.${siteId}&select=${RUN_COLS},started_at,draft&limit=1`),
    sb<RunNode[]>(`blog_generation_nodes?run_id=eq.${id}&select=id,node_key,label,type,status,sort_order,started_at,completed_at,duration_ms,input_summary,output_summary,prompt,model,token_usage,source_ids,error,metadata&order=sort_order`),
    sb<RunDetail['events']>(`blog_generation_events?run_id=eq.${id}&select=id,node_key,level,message,created_at&order=created_at&limit=300`),
    sb<RunDetail['sources']>(`blog_generation_sources?run_id=eq.${id}&select=id,doc_id,title,url,excerpt,score,used_in,citation_status&limit=300`),
  ])
  const run = runs[0]
  if (!run) return null
  let articleStatus: RunDetail['run']['article_status'] = null
  if (run.article_id) {
    const a = await sb<{ status: RunDetail['run']['article_status'] }[]>(`cms_articles?id=eq.${run.article_id}&select=status&limit=1`)
    articleStatus = a[0]?.status ?? null
  }
  return { run: { ...run, article_status: articleStatus }, nodes, events, sources }
}

/** Cooperative: the engine checks the status at every stage boundary. */
export async function cancelRun(siteId: string, id: string): Promise<boolean> {
  const rows = await sb<{ id: string }[]>(`blog_generation_runs?id=eq.${id}&site_id=eq.${siteId}&status=in.(queued,running)&select=id`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })
  return rows.length > 0
}

/** A failed or cancelled run restarts in place: the engine resumes from the last completed stage. */
export async function retryRun(siteId: string, id: string): Promise<{ ok: true; note: string | null } | { ok: false; error: string }> {
  const rows = await sb<{ id: string }[]>(`blog_generation_runs?id=eq.${id}&site_id=eq.${siteId}&status=in.(failed,cancelled)&select=id`, { method: 'PATCH', body: JSON.stringify({ status: 'queued', error: null, completed_at: null }) })
  if (!rows.length) return { ok: false, error: 'Only a failed or cancelled run can be retried' }
  await sb(`blog_generation_nodes?run_id=eq.${id}&status=in.(failed,skipped,running)`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'queued', error: null }) })
  const started = await engineStartRun(id)
  return { ok: true, note: started.ok ? null : `Queued for the engine's poll loop (${started.error}).` }
}

export const fmtDuration = (ms: number | null | undefined) => ms == null ? '–' : ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
