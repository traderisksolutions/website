import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { importPaste } from '@/lib/marketing/knowledge'

export const dynamic = 'force-dynamic'

/** Pasted markdown → draft entries: one per "# Heading", or one entry when there are none. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const r = await importPaste(site.id, await body(req), who.email)
    return 'error' in r ? json({ error: r.error }, 400) : json(r)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Import failed' }, 500) }
}
