/** The register's row shape and the rules the page shares with the server. Pure, no imports beyond types. */
import type { ClaimStage } from './claim-read'

export type RegisterRow = {
  id: string; title: string; client: string | null; company_id: string | null
  class: string; insurer: string | null; policy_number: string | null; insurer_ref: string | null
  loss_date: string | null; stage: ClaimStage | null; status: string; waiting_on: string | null; waiting_days: number | null
  amount_claimed: number | null; amount_settled: number | null; last_mail_at: string | null; threads: number
  owner_email: string | null; opened_mode: string; gaps: number; closed: boolean; has_draft: boolean
}

export type Bucket = 'open' | 'settled' | 'declined' | 'all'

/** Pure. Which status tab a claim sits under. Closed items without a stage count as settled only when the stage says so. */
export function bucketOf(r: Pick<RegisterRow, 'closed' | 'stage'>): Exclude<Bucket, 'all'> | 'closed' {
  if (r.stage === 'settled') return 'settled'
  if (r.stage === 'declined') return 'declined'
  return r.closed || r.stage === 'withdrawn' ? 'closed' : 'open'
}

/** Pure. Who the claim waits on, from the register row or the work item's status. */
export function waitingLabel(claimWaiting: string | null | undefined, itemStatus: string): string | null {
  if (claimWaiting) return claimWaiting
  return itemStatus === 'waiting_insurer' ? 'insurer' : itemStatus === 'waiting_client' ? 'client' : itemStatus === 'trs_to_act' || itemStatus === 'stalled' ? 'trs' : null
}

