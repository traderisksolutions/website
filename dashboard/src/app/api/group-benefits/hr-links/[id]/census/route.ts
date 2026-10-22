/** GET /api/group-benefits/hr-links/[id]/census → { census: CensusMember[] } from the submitted list, for Quick quote. */
import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { getLink, isMigrationPending, MIGRATION_PENDING_LINE } from '@/lib/hr/links'
import { toCensus } from '@/lib/hr/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  try {
    const found = await getLink(params.id)
    if (!found) return json({ error: 'Link not found' }, 404)
    const { link, submission } = found
    if (!submission || submission.status !== 'submitted') return json({ error: 'No list has been submitted on this link yet', census: [] }, 409)
    return json({
      census: toCensus(submission),
      company: { id: link.company_id, name: link.company_name },
      effective_date: link.effective_date,
      source: submission.source,
      reference: link.reference,
    })
  } catch (e) {
    if (isMigrationPending(e)) return json({ error: MIGRATION_PENDING_LINE, migrationPending: true }, 503)
    return json({ error: e instanceof Error ? e.message : 'failed' }, 500)
  }
}
