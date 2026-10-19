/** POST /api/group-benefits/hr-links/[id]/close → the link stops working → { link } */
import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { closeLink, isMigrationPending, MIGRATION_PENDING_LINE } from '@/lib/hr/links'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const who = await actor(req)
  if (who instanceof Response) return who
  try {
    const link = await closeLink(params.id, who)
    if (!link) return json({ error: 'Link not found' }, 404)
    return json({ link })
  } catch (e) {
    if (isMigrationPending(e)) return json({ error: MIGRATION_PENDING_LINE, migrationPending: true }, 503)
    return json({ error: e instanceof Error ? e.message : 'failed' }, 500)
  }
}
