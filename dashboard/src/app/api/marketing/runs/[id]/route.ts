import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { isResponse, siteFromReq } from '@/lib/marketing/request'
import { getRun } from '@/lib/marketing/engine'
import { isUuid } from '@/lib/sales/db'

export const dynamic = 'force-dynamic'

/** Polled by the run page: 2 s while queued or running, then stops. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Run not found' }, 404)
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const detail = await getRun(site.id, params.id)
    return detail ? json(detail) : json({ error: 'Run not found' }, 404)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not load the run' }, 500) }
}
