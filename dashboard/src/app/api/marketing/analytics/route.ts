import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { isResponse, siteFromReq } from '@/lib/marketing/request'
import { summarise } from '@/lib/marketing/sites'
import { isPeriod, siteTraffic } from '@/lib/marketing/ga4'

export const dynamic = 'force-dynamic'

/** GET ?site=<key>&period=d28[&fresh=1]: one website's Google Analytics figures for the period. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const p = req.nextUrl.searchParams
  const period = p.get('period')
  if (period !== null && !isPeriod(period)) return json({ error: 'Unknown period' }, 400)
  const traffic = await siteTraffic(site.key, period ?? 'd28', { fresh: p.get('fresh') === '1' })
  return json({ site: summarise(site), traffic })
}
