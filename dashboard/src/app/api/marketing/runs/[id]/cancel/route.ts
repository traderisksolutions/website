import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { isResponse, siteFromReq } from '@/lib/marketing/request'
import { cancelRun } from '@/lib/marketing/engine'
import { isUuid } from '@/lib/sales/db'

export const dynamic = 'force-dynamic'

/** Takes effect at the next stage boundary: a model call in flight finishes first. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Run not found' }, 404)
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try { return (await cancelRun(site.id, params.id)) ? json({ cancelled: true }) : json({ error: 'Run not found, or already finished' }, 409) }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not cancel' }, 500) }
}
