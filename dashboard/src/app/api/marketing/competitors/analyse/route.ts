import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { isResponse, siteFromReq } from '@/lib/marketing/request'
import { createAnalysis, isMigrationPending } from '@/lib/marketing/competitors'

export const dynamic = 'force-dynamic'

/** Queue the next analysis version and nudge the engine. 409 while one is queued or running. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const r = await createAnalysis(site.id, who.email)
    if ('error' in r) return json({ error: r.error }, r.status)
    return json({ analysisId: r.analysisId, version: r.version, started: r.started, note: r.note }, 202)
  } catch (e) {
    if (isMigrationPending(e)) return json({ error: 'Migration 20261019_marketing_v2 is not applied yet.' }, 503)
    return json({ error: e instanceof Error ? e.message : 'Could not start the analysis' }, 500)
  }
}
