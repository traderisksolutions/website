import type { FollowUpStatus, OwnerParty, SourceKind } from './rules'

/** A follow_ups row as stored (supabase/migrations/20261029_follow_ups.sql). */
export interface FollowUp {
  id: string
  company_id: string | null
  thread_id: string | null
  message_id: string | null
  owner_party: OwnerParty
  owner_email: string | null
  counterparty_name: string | null
  counterparty_email: string | null
  what: string
  due_at: string | null
  since_at: string
  status: FollowUpStatus
  snoozed_until: string | null
  closed_at: string | null
  closed_by: string | null
  closed_by_message_id: string | null
  source_kind: SourceKind
  source_ref: string | null
  source_label: string | null
  chase_draft_id: string | null
  chased_at: string | null
  chase_count: number
  dedupe_key: string
  created_at: string
  updated_at: string
}

/** The columns a source writes when it opens a row; the rest take their defaults. */
export type FollowUpInsert = Pick<FollowUp, 'owner_party' | 'what' | 'source_kind' | 'dedupe_key'> &
  Partial<Pick<FollowUp, 'company_id' | 'thread_id' | 'message_id' | 'owner_email' | 'counterparty_name' | 'counterparty_email' |
    'due_at' | 'since_at' | 'source_ref' | 'source_label'>>
