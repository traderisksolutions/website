import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { isResponse, siteFromReq } from '@/lib/marketing/request'
import { getGscOverview } from '@/lib/marketing/gsc/data'
import { gscConfigured } from '@/lib/marketing/gsc/client'
import { summarise } from '@/lib/marketing/sites'

export const dynamic = 'force-dynamic'

/** The Search Console page for one site. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try { return json({ site: summarise(site), configured: gscConfigured(), ...(await getGscOverview(site)) }) }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not load Search Console data' }, 500) }
}
