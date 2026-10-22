import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { UUID, isUuid } from '@/lib/sales/db'
import { approveContacts } from '@/lib/sales/campaigns'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Approve and schedule contacts awaiting approval. Body { ids } or { all: true }. Approval
 *  schedules; nothing sends while the campaign is not active or sending is off. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Not found' }, 404)
  const b = (await req.json().catch(() => ({}))) as { ids?: unknown; all?: unknown }
  const ids = b.all === true ? null : Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 1000) : []
  if (ids && !ids.length) return json({ error: 'Nothing selected' }, 422)
  try {
    const r = await approveContacts(params.id, ids, who.email)
    console.info('campaign approve', JSON.stringify({ id: params.id, by: who.email, approved: r.approved }))
    return json(r)
  } catch (e) {
    console.error('campaign approve failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not approve' }, 500)
  }
}
