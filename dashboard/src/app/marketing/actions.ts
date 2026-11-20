'use server'
/**
 * Marketing (21 Nov 2026): analytics, articles, competitors, Search Console, the knowledge bank,
 * runs, the schedule, sites, the newsletter and the website overview, as server actions. They
 * replace /api/marketing/* except the Search Console sign-in (connect, callback) and
 * knowledge/file, which a script calls. Each answers in the shape its route did.
 *
 * Every call is scoped to one site, `site` = key, id or domain (the first site when empty), as
 * `?site=` was.
 */
import { staffAction } from '@/lib/auth/action'
import { db, one } from '@/lib/db/client'
import { getSite, listSites, summarise, cleanSitePatch, updateSite } from '@/lib/marketing/sites'
import { isPeriod, siteTraffic } from '@/lib/marketing/ga4'
import { createArticle, getArticle, listArticles, saveArticle, type ArticlePatch } from '@/lib/marketing/articles'
import { addCompetitor, addPrompt, archivePrompt, createAnalysis, isMigrationPending, listAnalyses, listCompetitors, listPrompts, removeCompetitor, resultsFor, setPromptSelected } from '@/lib/marketing/competitors'
import { getGscOverview } from '@/lib/marketing/gsc/data'
import { gscConfigured } from '@/lib/marketing/gsc/client'
import { syncSite } from '@/lib/marketing/gsc/sync'
import { archiveEntry, importPaste, listKnowledge, saveEntry, type EntryInput } from '@/lib/marketing/knowledge'
import { cancelRun, cleanSetup, createRun, engineConfigured, engineNightly, getRun, listRuns, retryRun } from '@/lib/marketing/engine'
import { marketingStatus } from '@/lib/marketing/config'
import { cadence, cleanCadencePatch, defaultCadence, monthFigures, nights, tonight, updateCadence } from '@/lib/marketing/schedule'
import { websiteOverview } from '@/lib/marketing/website'
import { approve, createIssue, deleteIssue, getIssue, getNlSite, listNlSites, overview, renderIssue, sendBatch, sendPendingConfirmations, sendTest, setSender, updateIssue } from '@/lib/newsletter/store'
import { isUuid } from '@/lib/sales/db'

async function siteOf(site?: string | null) {
  const s = await getSite(site ?? null)
  if (!s) throw new Error('Site not found')
  return s
}

/** A lib result that carries `error` becomes a thrown error; anything else passes through. */
function ok<T>(r: T | { error: string }): T {
  if (r && typeof r === 'object' && 'error' in r) throw new Error((r as { error: string }).error)
  return r as T
}

// ── Sites and analytics ─────────────────────────────────────────────────────

export async function marketingSites() {
  return staffAction('marketing sites', async () => {
    const [sites, status] = await Promise.all([listSites(), marketingStatus(false)])
    return { sites, status }
  })
}

export async function updateMarketingSite(id: string, patch: Record<string, unknown>) {
  return staffAction('update site', async () => {
    const site = await siteOf(id)
    const cleaned = cleanSitePatch(patch)
    if ('error' in cleaned) throw new Error(cleaned.error)
    if (Object.keys(cleaned.patch).length === 0) return { site }
    return { site: await updateSite(site.id, cleaned.patch) }
  })
}

export async function siteAnalytics(site: string | null, period?: string | null, fresh = false) {
  return staffAction('analytics', async () => {
    const s = await siteOf(site)
    if (period != null && !isPeriod(period)) throw new Error('Unknown period')
    return { site: summarise(s), traffic: await siteTraffic(s.key, period ?? 'd28', { fresh }) }
  })
}

export async function websiteDetail(key: string) {
  return staffAction('website', async () => {
    const o = await websiteOverview(key)
    if (!o) throw new Error('Not found')
    return o
  })
}

// ── Articles ────────────────────────────────────────────────────────────────

export async function articles(site: string | null, filter: { status?: string; q?: string } = {}) {
  return staffAction('articles', async () => {
    const s = await siteOf(site)
    return { site: summarise(s), ...(await listArticles(s.id, { status: filter.status || undefined, q: filter.q || undefined })) }
  })
}

export async function newArticle(site: string | null, input: Record<string, unknown>) {
  return staffAction('create article', async user => ok(await createArticle(await siteOf(site), input, user.email)))
}

export async function article(site: string | null, id: string) {
  return staffAction('article', async () => {
    if (!isUuid(id)) throw new Error('Article not found')
    const s = await siteOf(site)
    const a = await getArticle(s, id)
    if (!a) throw new Error('Article not found')
    return { site: summarise(s), article: a }
  })
}

export async function saveArticleEdit(site: string | null, id: string, patch: ArticlePatch) {
  return staffAction('save article', async user => {
    if (!isUuid(id)) throw new Error('Article not found')
    return { saved: true as const, ...ok(await saveArticle(await siteOf(site), id, patch, user.email)) }
  })
}

// ── Competitors ─────────────────────────────────────────────────────────────

export async function competitors(site: string | null) {
  return staffAction('competitors', async () => {
    const s = await siteOf(site)
    try {
      const [list, prompts, analyses] = await Promise.all([listCompetitors(s.id), listPrompts(s.id), listAnalyses(s.id)])
      const latest = analyses.find(a => a.status === 'completed') ?? null
      return { site: summarise(s), competitors: list, prompts, results: latest ? await resultsFor(latest.id) : {}, analyses, latest, migrationPending: false }
    } catch (e) {
      if (isMigrationPending(e)) return { site: summarise(s), competitors: [], prompts: [], results: {}, analyses: [], latest: null, migrationPending: true }
      throw e
    }
  })
}

export async function addSiteCompetitor(site: string | null, url: unknown) {
  return staffAction('add competitor', async user => {
    const r = ok(await addCompetitor((await siteOf(site)).id, url, user.email))
    return { competitor: r.competitor }
  })
}

export async function removeSiteCompetitor(site: string | null, id: string) {
  return staffAction('remove competitor', async () => {
    if (!id) throw new Error('id is required')
    if (!(await removeCompetitor((await siteOf(site)).id, id))) throw new Error('Competitor not found')
    return { ok: true as const }
  })
}

// The four below were routes (competitors/prompts, competitors/analyse) deleted on 20 Nov 2026 as
// uncalled; the page builds those paths from a variable, so the search missed them. Restored here.

export async function addGeoPrompt(site: string | null, input: { prompt?: string; search_query?: string }) {
  return staffAction('add prompt', async user => ({ prompt: ok(await addPrompt((await siteOf(site)).id, input, user.email)).prompt }))
}

export async function selectGeoPrompt(site: string | null, id: string, selected: boolean) {
  return staffAction('select prompt', async () => {
    if (!id || typeof selected !== 'boolean') throw new Error('id and selected (true or false) are required')
    const prompt = await setPromptSelected((await siteOf(site)).id, id, selected)
    if (!prompt) throw new Error('Prompt not found')
    return { prompt }
  })
}

export async function removeGeoPrompt(site: string | null, id: string) {
  return staffAction('remove prompt', async () => {
    if (!id) throw new Error('id is required')
    if (!(await archivePrompt((await siteOf(site)).id, id))) throw new Error('Prompt not found')
    return { ok: true as const }
  })
}

/** Queues a competitor analysis for the site (one at a time) and asks the engine to start it. */
export async function runCompetitorAnalysis(site: string | null) {
  return staffAction('run analysis', async user => {
    const r = await createAnalysis((await siteOf(site)).id, user.email)
    if ('error' in r) throw new Error(r.error)
    return { analysisId: r.analysisId, version: r.version, started: r.started, note: r.note }
  })
}

// ── Search Console ──────────────────────────────────────────────────────────

export async function searchConsole(site: string | null) {
  return staffAction('search console', async () => {
    const s = await siteOf(site)
    return { site: summarise(s), configured: gscConfigured(), ...(await getGscOverview(s)) }
  })
}

export async function disconnectSearchConsole(site: string | null) {
  return staffAction('disconnect search console', async () => {
    const s = await siteOf(site)
    const { error } = await db().from('gsc_connections').update({ status: 'disconnected', refresh_token_encrypted: null, property_url: null, available_sites: [], last_error: null, updated_at: new Date().toISOString() }).eq('site_id', s.id)
    if (error) throw new Error(error.message)
    return { disconnected: true as const }
  })
}

/** Uses one of the connected account's properties for this site, then reads it once. */
export async function selectSearchConsoleProperty(site: string | null, property: string) {
  return staffAction('select property', async () => {
    const s = await siteOf(site)
    if (!property) throw new Error('property required')
    const conn = await one<{ available_sites: string[] | null }>('Search Console connection', db().from('gsc_connections').select('available_sites').eq('site_id', s.id).limit(1).maybeSingle())
    if (!(conn?.available_sites ?? []).includes(property)) throw new Error('That property is not in the connected Google account')
    const { error } = await db().from('gsc_connections').update({ property_url: property, status: 'connected', last_error: null, updated_at: new Date().toISOString() }).eq('site_id', s.id)
    if (error) throw new Error(error.message)
    const r = await syncSite(s.id)
    if (!r.ok) throw new Error(r.error)
    return r
  })
}

export async function syncSearchConsole(site: string | null) {
  return staffAction('sync search console', async () => {
    const r = await syncSite((await siteOf(site)).id)
    if (!r.ok) throw new Error(r.error)
    return r
  })
}

// ── Knowledge bank ──────────────────────────────────────────────────────────

export async function knowledge(site: string | null) {
  return staffAction('knowledge', async () => {
    const s = await siteOf(site)
    return { site: summarise(s), entries: await listKnowledge(s.id) }
  })
}

export async function saveKnowledgeEntry(site: string | null, input: EntryInput) {
  return staffAction('save knowledge', async user => {
    const r = ok(await saveEntry((await siteOf(site)).id, input, user.email))
    return { id: r.id, saved: true as const }
  })
}

export async function archiveKnowledgeEntry(site: string | null, id: string) {
  return staffAction('archive knowledge', async user => {
    if (!id) throw new Error('id required')
    if (!(await archiveEntry((await siteOf(site)).id, id, user.email))) throw new Error('Entry not found')
    return { archived: true as const }
  })
}

export async function importKnowledge(site: string | null, input: Record<string, unknown>) {
  return staffAction('import knowledge', async user => ok(await importPaste((await siteOf(site)).id, input, user.email)))
}

// ── Runs ────────────────────────────────────────────────────────────────────

/** The site's last 30 runs, what a new run can draw on, and whether the engine is reachable (`probe`). */
export async function runs(site: string | null, probe = false) {
  return staffAction('runs', async () => {
    const s = await siteOf(site)
    const [list, entries, status] = await Promise.all([listRuns(s.id, 30), listKnowledge(s.id), marketingStatus(probe)])
    const options = {
      products: entries.filter(e => e.section === 'product').map(e => ({ id: e.id, label: e.title })),
      caseStudies: entries.filter(e => e.section === 'case_study').map(e => ({ id: e.id, label: e.title })),
    }
    return { site: summarise(s), runs: list, options, entries: entries.map(e => ({ section: e.section, status: e.status, markets: e.markets })), status }
  })
}

export async function startRun(site: string | null, setup: Record<string, unknown>) {
  return staffAction('start run', async user => {
    const s = await siteOf(site)
    const cleaned = cleanSetup(s, setup)
    if ('error' in cleaned) throw new Error(cleaned.error)
    return createRun(s, cleaned.setup, user.email)
  })
}

export async function run(site: string | null, id: string) {
  return staffAction('run', async () => {
    if (!isUuid(id)) throw new Error('Run not found')
    const detail = await getRun((await siteOf(site)).id, id)
    if (!detail) throw new Error('Run not found')
    return detail
  })
}

export async function cancelSiteRun(site: string | null, id: string) {
  return staffAction('cancel run', async () => {
    if (!isUuid(id)) throw new Error('Run not found')
    if (!(await cancelRun((await siteOf(site)).id, id))) throw new Error('Run not found, or already finished')
    return { cancelled: true as const }
  })
}

export async function retrySiteRun(site: string | null, id: string) {
  return staffAction('retry run', async () => {
    if (!isUuid(id)) throw new Error('Run not found')
    const r = await retryRun((await siteOf(site)).id, id)
    if (!r.ok) throw new Error(r.error)
    return { retried: true as const, note: r.note }
  })
}

// ── Schedule ────────────────────────────────────────────────────────────────

export async function schedule(site: string | null) {
  return staffAction('schedule', async () => {
    const s = await siteOf(site)
    try {
      const cad = await cadence(s)
      const [plan, groups, month] = await Promise.all([tonight(s, cad.count), nights(s.id), monthFigures(s.id)])
      return { site: summarise(s), cadence: cad, tonight: plan, nights: groups, spendMonthUsd: month.spendUsd, postedMonth: month.posted, migrationPending: false }
    } catch (e) {
      if (isMigrationPending(e)) return { site: summarise(s), cadence: defaultCadence(s), tonight: { analysis: null, knowledge: null, prompts: [] }, nights: [], spendMonthUsd: 0, postedMonth: 0, migrationPending: true }
      throw e
    }
  })
}

export async function saveCadence(site: string | null, patch: Record<string, unknown>) {
  return staffAction('save cadence', async () => {
    const s = await siteOf(site)
    const cleaned = cleanCadencePatch(patch)
    if ('error' in cleaned) throw new Error(cleaned.error)
    return { cadence: await updateCadence(s, cleaned.patch) }
  })
}

/** Asks the content engine to run tonight's batch now. */
export async function runScheduleNow(site: string | null) {
  return staffAction('run schedule', async () => {
    const s = await siteOf(site)
    if (!engineConfigured()) throw new Error('The content engine is not connected (CONTENT_ENGINE_URL).')
    const r = await engineNightly(s.id)
    if (!r.ok) throw new Error(r.error)
    return { created: r.data.created ?? [], count: r.data.count ?? (r.data.created?.length ?? 0) }
  })
}

// ── Newsletter ──────────────────────────────────────────────────────────────

export async function newsletter(site?: string | null) {
  return staffAction('newsletter', async () => {
    const [sites, s] = await Promise.all([listNlSites(), getNlSite(site || 'corpcover')])
    if (!s) throw new Error('Site not found')
    return { site: s, sites: sites.map(x => ({ key: x.key, name: x.name })), ...(await overview(s)) }
  })
}

/** create: a new issue · sender: who it comes from · confirmations: send the pending confirmation emails. */
export async function newsletterAction(body: Record<string, unknown>) {
  return staffAction('newsletter action', async user => {
    const s = await getNlSite(typeof body.site === 'string' ? body.site : 'corpcover')
    if (!s) throw new Error('Site not found')
    if (body.action === 'create') return { issue: await createIssue(s, user.email) }
    if (body.action === 'sender') { const err = await setSender(s, body); if (err) throw new Error(err); return { ok: true as const } }
    if (body.action === 'confirmations') return ok(await sendPendingConfirmations(s))
    throw new Error('Unknown action')
  })
}

async function issueOf(id: string) {
  const issue = await getIssue(id)
  const site = issue ? await getNlSite(issue.site_id) : null
  if (!issue || !site) throw new Error('Not found')
  return { issue, site }
}

export async function newsletterIssue(id: string) {
  return staffAction('newsletter issue', async () => {
    const l = await issueOf(id)
    const mail = await renderIssue(l.site, l.issue, null)
    return { issue: l.issue, preview: { subject: mail.subject, html: mail.html } }
  })
}

export async function updateNewsletterIssue(id: string, body: Record<string, unknown>) {
  return staffAction('update issue', async () => {
    const err = await updateIssue((await issueOf(id)).issue, body)
    if (err) throw new Error(err)
    return { ok: true as const }
  })
}

export async function deleteNewsletterIssue(id: string) {
  return staffAction('delete issue', async () => {
    const err = await deleteIssue((await issueOf(id)).issue)
    if (err) throw new Error(err)
    return { ok: true as const }
  })
}

/** test: send to yourself · approve · batch: send the next batch. Nothing sends without this click. */
export async function newsletterIssueAction(id: string, action: string) {
  return staffAction('issue action', async user => {
    const l = await issueOf(id)
    if (action === 'test') { const err = await sendTest(l.site, l.issue, user.email); if (err) throw new Error(err); return { ok: true as const, to: user.email } }
    if (action === 'approve') { const err = await approve(l.site, l.issue, user.email); if (err) throw new Error(err); return { ok: true as const } }
    if (action === 'batch') return ok(await sendBatch(l.site, l.issue))
    throw new Error('Unknown action')
  })
}
