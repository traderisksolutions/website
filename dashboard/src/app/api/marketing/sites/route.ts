import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { listSites } from '@/lib/marketing/sites'
import { marketingStatus } from '@/lib/marketing/config'

export const dynamic = 'force-dynamic'

/** The sites every Marketing page switches between, with the workflow switches. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  try {
    const [sites, status] = await Promise.all([listSites(), marketingStatus(false)])
    return json({ sites, status })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not load sites' }, 500) }
}
