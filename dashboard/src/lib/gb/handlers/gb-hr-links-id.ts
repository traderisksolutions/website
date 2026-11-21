/** GET /api/group-benefits/hr-links/[id] → { link, events, submission } */
import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { getLink, isMigrationPending, MIGRATION_PENDING_LINE } from '@/lib/hr/links'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  try {
    const found = await getLink(params.id)
    if (!found) return json({ error: 'Link not found' }, 404)
    return json(found)
  } catch (e) {
    if (isMigrationPending(e)) return json({ error: MIGRATION_PENDING_LINE, migrationPending: true }, 503)
    return json({ error: e instanceof Error ? e.message : 'failed' }, 500)
  }
}
