import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { archiveEntry, listKnowledge, saveEntry, type EntryInput } from '@/lib/marketing/knowledge'
import { summarise } from '@/lib/marketing/sites'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try { return json({ site: summarise(site), entries: await listKnowledge(site.id) }) }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not load the knowledge bank' }, 500) }
}

/** Create or update one entry. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const r = await saveEntry(site.id, await body<EntryInput>(req), who.email)
    return 'error' in r ? json({ error: r.error }, 400) : json({ id: r.id, saved: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not save' }, 500) }
}

/** Archive: the entry leaves every future run but stays on record. */
export async function DELETE(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const { id } = await body<{ id?: string }>(req)
  if (!id) return json({ error: 'id required' }, 400)
  try { return (await archiveEntry(site.id, id, who.email)) ? json({ archived: true }) : json({ error: 'Entry not found' }, 404) }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not archive' }, 500) }
}
