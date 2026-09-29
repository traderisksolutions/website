import type { Row } from '@/components/board/useBoardData'
import { isOpen, urgencyOf } from '@/components/board/model'
import { renewalBucket } from '@/lib/crm/renewal'

/**
 * One rule for "needs attention", shared by Home's summary, the Companies views and the
 * summary line: open work that is late or due this week, an email waiting on us, a policy
 * ending within 30 days or already ended, or nobody owning the account. Money is not a
 * reason while Finance is still being entered.
 */
export type AttentionReason = 'work' | 'reply' | 'renewal' | 'ended' | 'owner'

export function attentionReasons(r: Row, today: string): AttentionReason[] {
  const c = r.company
  const out: AttentionReason[] = []
  if (c.tasks.some(t => isOpen(t) && ['overdue', 'today', 'week'].includes(urgencyOf(t.due_on, today)))) out.push('work')
  if (c.needsReply > 0) out.push('reply')
  const b = renewalBucket(c.nextRenewalDate, today)
  if (b === 'within_7' || b === 'within_30') out.push('renewal')
  if (b === 'overdue') out.push('ended')
  if (c.owner_emails.length === 0) out.push('owner')
  return out
}

export function needsAttention(r: Row, today: string): boolean {
  return attentionReasons(r, today).length > 0
}
