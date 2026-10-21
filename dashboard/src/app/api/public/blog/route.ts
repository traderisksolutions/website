import { NextRequest, NextResponse } from 'next/server'
import { getSite, summarise } from '@/lib/marketing/sites'
import { publicArticle, publicList } from '@/lib/marketing/articles'

// The blog feed each website reads at build and request time:
//   GET /api/public/blog?site=corpcover.com            every published article, newest first
//   GET /api/public/blog?site=corpcover.com&market=MY  one market's articles
//   GET /api/public/blog?site=corpcover.com&slug=x     one article with its HTML, FAQ and JSON-LD
// Published articles only; nothing here is private, so the route is open and cached at the edge.
export const dynamic = 'force-dynamic'

const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600', 'Access-Control-Allow-Origin': '*' }

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const ref = p.get('site')
  if (!ref) return NextResponse.json({ error: 'site required' }, { status: 400 })
  const site = await getSite(ref)
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  const slug = (p.get('slug') ?? '').trim().toLowerCase()
  try {
    if (slug) {
      const article = await publicArticle(site, slug)
      return article ? NextResponse.json({ site: summarise(site), article }, { headers: CACHE }) : NextResponse.json({ error: 'Article not found' }, { status: 404, headers: CACHE })
    }
    return NextResponse.json({ site: summarise(site), articles: await publicList(site, (p.get('market') ?? '').toUpperCase() || null) }, { headers: CACHE })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 }) }
}
