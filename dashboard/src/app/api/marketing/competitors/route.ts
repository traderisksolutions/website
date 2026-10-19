import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { addCompetitor, isMigrationPending, listAnalyses, listCompetitors, listPrompts, removeCompetitor, resultsFor } from '@/lib/marketing/competitors'
import { summarise } from '@/lib/marketing/sites'

export const dynamic = 'force-dynamic'

/** The list, the prompts, the latest completed analysis and its results, and every analysis version. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const [competitors, prompts, analyses] = await Promise.all([listCompetitors(site.id), listPrompts(site.id), listAnalyses(site.id)])
    const latest = analyses.find(a => a.status === 'completed') ?? null
    const results = latest ? await resultsFor(latest.id) : {}
    return json({ site: summarise(site), competitors, prompts, results, analyses, latest })
  } catch (e) {
    if (isMigrationPending(e)) return json({ site: summarise(site), competitors: [], prompts: [], results: {}, analyses: [], latest: null, migrationPending: true })
    return json({ error: e instanceof Error ? e.message : 'Could not load competitors' }, 500)
  }
}

/** Add one competitor by URL. The engine's next analysis finds the sitemap and blog. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const b = await body(req)
  try {
    const r = await addCompetitor(site.id, b.url, who.email)
    if ('error' in r) return json({ error: r.error }, 400)
    return json({ competitor: r.competitor }, 201)
  } catch (e) {
    if (isMigrationPending(e)) return json({ error: 'Migration 20261019_marketing_v2 is not applied yet.' }, 503)
    return json({ error: e instanceof Error ? e.message : 'Could not add the competitor' }, 500)
  }
}

export async function DELETE(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const b = await body(req)
  const id = String(b.id ?? '')
  if (!id) return json({ error: 'id is required' }, 400)
  try {
    const ok = await removeCompetitor(site.id, id)
    return ok ? json({ ok: true }) : json({ error: 'Competitor not found' }, 404)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not remove the competitor' }, 500) }
}
