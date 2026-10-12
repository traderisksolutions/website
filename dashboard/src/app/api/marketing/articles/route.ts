import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { createArticle, listArticles } from '@/lib/marketing/articles'
import { summarise } from '@/lib/marketing/sites'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const p = req.nextUrl.searchParams
  try { return json({ site: summarise(site), ...(await listArticles(site.id, { status: p.get('status') ?? undefined, q: p.get('q') ?? undefined })) }) }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not load articles' }, 500) }
}

/** A hand-written article: saved as a draft, or published at once. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const r = await createArticle(site, await body(req), who.email)
    return 'error' in r ? json({ error: r.error }, 400) : json(r, 201)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not create the article' }, 500) }
}
