import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { importArticles, type ImportItem } from '@/lib/marketing/articles'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Existing articles from a site's code (scripts/import-site-articles.ts), inserted once by slug. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const { items } = await body<{ items?: ImportItem[] }>(req)
  if (!Array.isArray(items) || items.length === 0) return json({ error: 'items required' }, 400)
  try { return json(await importArticles(site, items, who.email)) }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Import failed' }, 500) }
}
