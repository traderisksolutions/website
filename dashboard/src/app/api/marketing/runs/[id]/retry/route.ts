import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { isResponse, siteFromReq } from '@/lib/marketing/request'
import { retryRun } from '@/lib/marketing/engine'
import { isUuid } from '@/lib/sales/db'

export const dynamic = 'force-dynamic'

/** Resumes a failed or cancelled run from its last completed stage; nothing finished is paid for twice. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Run not found' }, 404)
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const r = await retryRun(site.id, params.id)
    return r.ok ? json({ retried: true, note: r.note }, 202) : json({ error: r.error }, 409)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not retry' }, 500) }
}
