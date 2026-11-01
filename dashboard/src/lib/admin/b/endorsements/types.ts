/** Shared shapes of the endorsement loop. Pure types; no I/O. */
import type { MovementKind } from '@/lib/policies/types'

export type MovementType = 'member' | 'vehicle' | 'insured' | 'sum_insured' | 'location' | 'period' | 'cancellation' | 'other'
export type Cadence = 'immediate' | 'daily' | 'weekly'
export type BatchStatus = 'open' | 'ready' | 'sent' | 'noted' | 'billed' | 'settled' | 'cancelled'

/** One change the client asked for, as read from an email or a sheet. */
export type ParsedMovement = {
  kind: MovementKind
  movement_type: MovementType
  /** The person for a member movement; the registration or description otherwise. */
  name: string
  effective_on: string | null
  last_day: string | null
  relationship: string | null
  detail: Record<string, unknown>
  /** Where it was read: 'body' or 'sheet:<filename>'. */
  source: string
  /** The words it was read from, for the person approving. */
  quote: string
}

export type BatchRow = {
  id: string; policy_id: string; company_id: string; insurer_company_id: string | null; cadence: Cadence
  window_start: string; window_end: string; status: BatchStatus
  work_item_id: string | null; draft_id: string | null; pair_id: string | null; thread_id: string | null
  sheet_storage_url: string | null; counts: Record<string, number>; estimate_total: number | null; noted_total: number | null
  needs_human: string | null; sent_at: string | null; noted_at: string | null; billed_at: string | null; settled_at: string | null
  chase_count: number; last_chase_at: string | null; next_chase_at: string | null; created_at: string; updated_at: string
}
