/**
 * "Come back later" on a work item: a time (later_until), or until one side writes back
 * (later_when = client_reply | insurer_reply). While it holds, the item stays off the queue and
 * the chaser leaves it alone. The rules are pure; setLater and clearLater write.
 */
import { sb, enc } from '@/lib/crm/db'
import { itemEvent } from './data'

export type LaterWhen = 'client_reply' | 'insurer_reply'
export type LaterFields = { later_until?: string | null; later_when?: string | null }

/** Pure. Is the item set aside right now? `now` is an ISO timestamp. */
export function laterActive(i: LaterFields, now: string): boolean {
  if (i.later_when === 'client_reply' || i.later_when === 'insurer_reply') return true
  return !!i.later_until && i.later_until > now
}

/** Pure. Does a message from this side end the wait? */
export function clearsOnMessage(i: LaterFields, side: string): boolean {
  return (i.later_when === 'client_reply' && side === 'client') || (i.later_when === 'insurer_reply' && side === 'insurer')
}

/** Pure. Has a timed wait run out? A wait for a reply never runs out on time alone. */
export function laterDue(i: LaterFields, now: string): boolean {
  return !i.later_when && !!i.later_until && i.later_until <= now
}

export async function setLater(itemId: string, opts: { until?: string | null; when?: LaterWhen | null }, by: string): Promise<void> {
  const until = opts.until ?? null
  const when = opts.when ?? null
  if (!until && !when) throw new Error('Choose a time or a reply to wait for.')
  if (until && Number.isNaN(Date.parse(until))) throw new Error('That time is not a date.')
  if (when && when !== 'client_reply' && when !== 'insurer_reply') throw new Error('Wait for client_reply or insurer_reply.')
  await sb(`work_items?id=eq.${enc(itemId)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ later_until: until ? new Date(until).toISOString() : null, later_when: when, later_by: by, updated_at: new Date().toISOString() }),
  })
  await itemEvent(itemId, 'snoozed', by, { until, when })
}

export async function clearLater(itemId: string, reason: string, by: string): Promise<void> {
  await sb(`work_items?id=eq.${enc(itemId)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ later_until: null, later_when: null, later_by: null, updated_at: new Date().toISOString() }),
  })
  await itemEvent(itemId, 'note', by, { later_cleared: reason })
}
