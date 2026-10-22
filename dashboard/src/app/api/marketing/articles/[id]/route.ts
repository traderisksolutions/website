import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { getArticle, saveArticle, type ArticlePatch } from '@/lib/marketing/articles'
import { summarise } from '@/lib/marketing/sites'
import { isUuid } from '@/lib/sales/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Article not found' }, 404)
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const article = await getArticle(site, params.id)
    return article ? json({ site: summarise(site), article }) : json({ error: 'Article not found' }, 404)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not load the article' }, 500) }
}

/** Title, slug, dek, topic, meta, body and status. Publishing a pending article here is approval. */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Article not found' }, 404)
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const r = await saveArticle(site, params.id, await body<ArticlePatch>(req), who.email)
    return 'error' in r ? json({ error: r.error }, 400) : json({ saved: true, ...r })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not save' }, 500) }
}
