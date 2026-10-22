import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { isUuid } from '@/lib/sales/db'
import { runEnrichment } from '@/lib/sales/enrich'
import { lookupConfigured } from '@/lib/sales/config'

// Find email for one lead now: one Netrows credit, counted against the daily cap.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!lookupConfigured()) return json({ error: 'Email lookup is off. Set NETROWS_API_KEY.' }, 409)
  if (!isUuid(params.id)) return json({ error: 'Not found' }, 404)
  try {
    const r = await runEnrichment({ maxLookups: 1, scope: [params.id] })
    console.info('lead lookup', JSON.stringify({ user: who.email, lookups: r.done.lookups, found: r.done.found + r.done.contactsAdded, stoppedBy: r.stoppedBy ?? null }))
    if (r.budget === 0) return json({ error: "Today's lookup limit is used up" }, 429)
    if (r.done.lookups === 0) return json({ error: 'Nothing to look up for this lead' }, 422)
    if (r.stoppedBy) return json({ error: `Lookup refused (${r.stoppedBy})` }, 502)
    return json({ found: r.done.found + r.done.contactsAdded, verified: r.done.verified, notFound: r.done.notFound })
  } catch (e) {
    console.error('lead lookup failed', e instanceof Error ? e.message : e)
    return json({ error: 'Lookup failed' }, 500)
  }
}
