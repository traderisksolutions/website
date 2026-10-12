import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { isResponse, siteFromReq } from '@/lib/marketing/request'
import { sb } from '@/lib/sales/db'

export const dynamic = 'force-dynamic'

/** Drops the token; synced rows stay until the next connect replaces them. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  await sb(`gsc_connections?site_id=eq.${site.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'disconnected', refresh_token_encrypted: null, property_url: null, available_sites: [], last_error: null, updated_at: new Date().toISOString() }) })
  return json({ disconnected: true })
}
