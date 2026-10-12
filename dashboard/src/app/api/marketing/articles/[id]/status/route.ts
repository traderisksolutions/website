import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { setStatus } from '@/lib/marketing/articles'
import { ARTICLE_STATUSES, type ArticleStatus } from '@/lib/marketing/types'
import { isUuid } from '@/lib/sales/db'

export const dynamic = 'force-dynamic'

/** Approve (→ published), reject (→ archived), unpublish (→ draft) without touching the text. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Article not found' }, 404)
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const { status } = await body<{ status?: string }>(req)
  if (!status || !(ARTICLE_STATUSES as readonly string[]).includes(status)) return json({ error: 'status must be draft, pending, published or archived' }, 400)
  try {
    const r = await setStatus(site, params.id, status as ArticleStatus, who.email)
    return 'error' in r ? json({ error: r.error }, 400) : json(r)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not update' }, 500) }
}
