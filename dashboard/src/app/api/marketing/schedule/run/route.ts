import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { isResponse, siteFromReq } from '@/lib/marketing/request'
import { engineConfigured, engineNightly } from '@/lib/marketing/engine'

export const dynamic = 'force-dynamic'

/** Run tonight's batch for this site now. The engine plans and creates the runs, then works through them. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  if (!engineConfigured()) return json({ error: 'The content engine is not connected (CONTENT_ENGINE_URL).' }, 503)
  const r = await engineNightly(site.id)
  if (!r.ok) return json({ error: r.error }, 502)
  return json({ created: r.data.created ?? [], count: r.data.count ?? (r.data.created?.length ?? 0) }, 202)
}
