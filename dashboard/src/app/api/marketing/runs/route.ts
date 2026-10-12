import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { cleanSetup, createRun, listRuns } from '@/lib/marketing/engine'
import { listKnowledge } from '@/lib/marketing/knowledge'
import { marketingStatus } from '@/lib/marketing/config'
import { summarise } from '@/lib/marketing/sites'

export const dynamic = 'force-dynamic'

/** Recent runs plus what the Generate form needs: focus options and the knowledge bank's state. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const [runs, entries, status] = await Promise.all([listRuns(site.id, 30), listKnowledge(site.id), marketingStatus(req.nextUrl.searchParams.get('probe') === '1')])
    const options = {
      products: entries.filter(e => e.section === 'product').map(e => ({ id: e.id, label: e.title })),
      caseStudies: entries.filter(e => e.section === 'case_study').map(e => ({ id: e.id, label: e.title })),
    }
    return json({ site: summarise(site), runs, options, entries: entries.map(e => ({ section: e.section, status: e.status, markets: e.markets })), status })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not load runs' }, 500) }
}

/** Start a run. The engine is nudged over HTTP; if unreachable, its poll loop picks the run up. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const cleaned = cleanSetup(site, await body(req))
  if ('error' in cleaned) return json({ error: cleaned.error }, 400)
  try { return json(await createRun(site, cleaned.setup, who.email), 202) }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not start the run' }, 500) }
}
