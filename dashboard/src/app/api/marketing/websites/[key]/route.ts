import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { websiteOverview } from '@/lib/marketing/website'

export const dynamic = 'force-dynamic'

/** GET → one website's analytics state and counts (src/lib/marketing/website.ts). */
export async function GET(req: NextRequest, props: { params: Promise<{ key: string }> }) {
  const params = await props.params
  const who = await actor(req)
  if (who instanceof Response) return who
  try {
    const overview = await websiteOverview(params.key)
    if (!overview) return json({ error: 'Not found' }, 404)
    return json(overview)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not load this website' }, 500) }
}
