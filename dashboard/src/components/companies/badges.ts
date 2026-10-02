/**
 * The operational badges a company row carries. Facts, not labels: each one is derived from
 * data the row already has, and each one is a filter when clicked.
 */
import type { Row } from '@/components/board/useBoardData'
import { isOpen } from '@/components/board/model'
import { renewalBucket, type RenewalBucket } from '@/lib/crm/renewal'

export type BadgeKey =
  | 'awaiting_reply' | 'renewal_due' | 'payment_overdue' | 'claim_open' | 'rfq_active'
  | 'high_priority' | 'no_owner' | 'unconfirmed' | 'overdue_item' | 'blocked'

export type BadgeTone = 'neutral' | 'blue' | 'green' | 'amber' | 'orange' | 'red'

export interface CompanyBadge { key: BadgeKey; label: string; tone: BadgeTone; title: string }

export const BADGE_ORDER: BadgeKey[] = ['overdue_item', 'payment_overdue', 'blocked', 'renewal_due', 'awaiting_reply', 'high_priority', 'claim_open', 'rfq_active', 'no_owner', 'unconfirmed']

export function badgesFor(r: Row, today: string): CompanyBadge[] {
  const c = r.company, d = r.d
  const out: CompanyBadge[] = []
  const bucket: RenewalBucket = renewalBucket(c.nextRenewalDate, today)

  if (d.overdueTasks > 0) out.push({ key: 'overdue_item', label: `${d.overdueTasks} overdue`, tone: 'red', title: `${d.overdueTasks} pressing item${d.overdueTasks === 1 ? '' : 's'} past deadline` })
  if (c.tasks.some(t => isOpen(t) && t.status === 'blocked')) out.push({ key: 'blocked', label: 'Blocked', tone: 'red', title: 'An item is blocked' })
  if (bucket === 'overdue' || bucket === 'within_7' || bucket === 'within_30') out.push({ key: 'renewal_due', label: 'Renewal due', tone: 'neutral', title: 'A policy renews within 30 days or is past its date' })
  if (c.needsReply > 0) out.push({ key: 'awaiting_reply', label: 'Awaiting reply', tone: 'amber', title: `${c.needsReply} email${c.needsReply === 1 ? '' : 's'} waiting for our answer` })
  if (c.tasks.some(t => isOpen(t) && t.priority === 'critical')) out.push({ key: 'high_priority', label: 'High priority', tone: 'amber', title: 'A critical item is open' })
  if ((c.threadsByCategory.claim ?? 0) > 0) out.push({ key: 'claim_open', label: 'Claim open', tone: 'blue', title: `${c.threadsByCategory.claim} active claim thread${c.threadsByCategory.claim === 1 ? '' : 's'}` })
  if ((c.threadsByCategory.rfq ?? 0) > 0 || c.openQuotes > 0) out.push({ key: 'rfq_active', label: 'Quote request', tone: 'blue', title: 'A client email asking for a quotation is open' })
  if (c.owner_emails.length === 0 && d.owners.length === 0) out.push({ key: 'no_owner', label: 'No owner', tone: 'neutral', title: 'Nobody is assigned to this account' })
  if (c.confirmed_at === null) out.push({ key: 'unconfirmed', label: 'Unconfirmed', tone: 'amber', title: 'Created by mail filing; a person has not checked the name yet' })

  return out.sort((a, b) => BADGE_ORDER.indexOf(a.key) - BADGE_ORDER.indexOf(b.key))
}

export function hasBadge(r: Row, today: string, key: BadgeKey): boolean {
  return badgesFor(r, today).some(b => b.key === key)
}

export const BADGE_LABEL: Record<BadgeKey, string> = {
  awaiting_reply: 'Awaiting reply', renewal_due: 'Renewal due', payment_overdue: 'Payment overdue', claim_open: 'Claim open',
  rfq_active: 'Quote request', high_priority: 'High priority', no_owner: 'No owner', unconfirmed: 'Unconfirmed', overdue_item: 'Overdue item', blocked: 'Blocked',
}
