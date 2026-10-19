import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { intakeCounts, listIntakes, listSites } from '@/lib/intake/store'

export const dynamic = 'force-dynamic'

/** GET ?site=corpcover&status=open|submitted|…&q= → the site's submissions plus counts for every site. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const sp = req.nextUrl.searchParams
  try {
    const sites = await listSites()
    const site = sites.find(s => s.key === sp.get('site'))?.key ?? 'corpcover'
    const [rows, counts] = await Promise.all([listIntakes(site, { status: sp.get('status') ?? undefined, q: sp.get('q') ?? undefined }), intakeCounts()])
    return json({ site, sites, counts, rows })
  } catch (e) {
    console.error('enquiries list failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not load enquiries' }, 500)
  }
}
