import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { sb } from '@/lib/sales/db'
import { syncSite } from '@/lib/marketing/gsc/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Manual property pick when the domain matched none or several. Only one the account can read. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const { property } = await body<{ property?: string }>(req)
  if (!property) return json({ error: 'property required' }, 400)
  const conns = await sb<{ available_sites: string[] }[]>(`gsc_connections?site_id=eq.${site.id}&select=available_sites&limit=1`)
  if (!(conns[0]?.available_sites ?? []).includes(property)) return json({ error: 'That property is not in the connected Google account' }, 400)
  await sb(`gsc_connections?site_id=eq.${site.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ property_url: property, status: 'connected', last_error: null, updated_at: new Date().toISOString() }) })
  const r = await syncSite(site.id)
  return r.ok ? json(r) : json({ error: r.error }, 400)
}
