import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { isUuid } from '@/lib/sales/db'
import { enrolAudience } from '@/lib/sales/campaigns'
import { syncAudience } from '@/lib/sales/audience'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Add everyone in the campaign's audience who is not live elsewhere or emailed in the last 90 days. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Not found' }, 404)
  try {
    await syncAudience()
    const r = await enrolAudience(params.id)
    console.info('campaign enrol', JSON.stringify({ id: params.id, by: who.email, added: r.added }))
    return json(r)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.startsWith('This campaign')) return json({ error: msg }, 409)
    console.error('campaign enrol failed', msg)
    return json({ error: 'Could not add contacts' }, 500)
  }
}
