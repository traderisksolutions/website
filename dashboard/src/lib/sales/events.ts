import 'server-only'
import { sb, sbCount } from './db'

export type SalesEventKind =
  | 'approved' | 'rejected' | 'edited' | 'reopened' | 'marked_replied'
  | 'email_lookup' | 'email_found' | 'email_verified' | 'email_not_found' | 'contact_added'
  | 'send_claimed' | 'sent' | 'send_failed' | 'dry_run' | 'unsubscribed' | 'bounced' | 'intake'

/** Append to sales_events. Throws on failure: an action whose audit row did not land should
 *  not report success. Detail holds ids and statuses, never email bodies. */
export async function logSalesEvent(e: {
  kind: SalesEventKind; actor: string; accountId?: string | null; contactId?: string | null; outreachId?: string | null; detail?: Record<string, unknown>
}): Promise<void> {
  await sb('sales_events', {
    method: 'POST', prefer: 'return=minimal',
    body: JSON.stringify({ kind: e.kind, actor: e.actor, account_id: e.accountId ?? null, contact_id: e.contactId ?? null, outreach_id: e.outreachId ?? null, detail: e.detail ?? {} }),
  })
}

/** Events of these kinds since a time, for daily caps. */
export async function countEventsSince(kinds: SalesEventKind[], sinceIso: string): Promise<number> {
  return sbCount(`sales_events?select=id&kind=in.(${kinds.join(',')})&created_at=gte.${encodeURIComponent(sinceIso)}`)
}
