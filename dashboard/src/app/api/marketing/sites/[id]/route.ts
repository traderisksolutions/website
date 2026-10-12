import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body } from '@/lib/marketing/request'
import { cleanSitePatch, getSite, updateSite } from '@/lib/marketing/sites'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await getSite(params.id)
  if (!site) return json({ error: 'Site not found' }, 404)
  const cleaned = cleanSitePatch(await body(req))
  if ('error' in cleaned) return json({ error: cleaned.error }, 400)
  if (Object.keys(cleaned.patch).length === 0) return json({ site })
  try { return json({ site: await updateSite(site.id, cleaned.patch) }) }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not save' }, 500) }
}
