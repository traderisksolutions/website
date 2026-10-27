/**
 * The policy is the one record a company's cover hangs off: a placement line quotes it, the
 * chosen quote binds it, debit notes bill it, and (employment benefits only) members, movements
 * and the insurer's own notes run under it after bind.
 *
 *   company → policy (lifecycle) → placement line → rounds → quotes → chosen quote → bound/live
 *                                → members · movements · transactions · weekly position (EB)
 */

// ── Lifecycle (Agent A) ─────────────────────────────────────────────────────────────────────

export type PolicyLifecycle = 'quoting' | 'presented' | 'bound' | 'live' | 'renewal_due' | 'lapsed' | 'declined' | 'closed'

export const POLICY_LIFECYCLES: PolicyLifecycle[] = ['quoting', 'presented', 'bound', 'live', 'renewal_due', 'lapsed', 'declined', 'closed']

export const isPolicyLifecycle = (v: unknown): v is PolicyLifecycle =>
  typeof v === 'string' && (POLICY_LIFECYCLES as string[]).includes(v)

/** The word the register shows for each lifecycle. */
export const LIFECYCLE_LABEL: Record<PolicyLifecycle, string> = {
  quoting: 'Quoting', presented: 'Presented', bound: 'Bound', live: 'Live',
  renewal_due: 'Renewal due', lapsed: 'Lapsed', declined: 'Declined', closed: 'Closed',
}

/** Product lines whose policies carry members, movements and insurer notes after bind. */
export const EB_PRODUCT_LINES = ['employee_benefits', 'group_health'] as const

// ── Row (Agent A) ───────────────────────────────────────────────────────────────────────────

/** A policies row after 20261027_company_spine.sql. customer_id is null while quoting. */
export interface PolicyRow {
  id: string
  customer_id: string | null
  company_id: string | null
  product_line: string | null
  label: string | null
  lifecycle: PolicyLifecycle
  placement_line_id: string | null
  chosen_quote_id: string | null
  chosen_insurer_company_id: string | null
  bound_premium: number | null
  bound_at: string | null
  bound_by: string | null
  is_eb: boolean
  policy_number: string | null
  insurer: string | null
  product_type: string | null
  class_of_insurance: string | null
  description: string | null
  currency: string | null
  premium: number | null
  sum_insured: number | null
  start_date: string | null
  end_date: string | null
  renewal_date: string | null
  status: string | null
  source: string | null
  created_at: string
  updated_at: string | null
}

// ── View (Agent A) ──────────────────────────────────────────────────────────────────────────

/** One line of the company's policy register: the row plus what the debit notes and (EB) the
 *  member tables say about it. membersActive and netToDate are null unless is_eb. */
export interface PolicyView {
  id: string
  company_id: string
  product_line: string | null
  label: string | null
  class_of_insurance: string | null
  lifecycle: PolicyLifecycle
  /** The chosen insurer once bound, else the insurer the debit notes were billed under. */
  insurer: string | null
  policy_number: string | null
  start_date: string | null
  end_date: string | null
  renewal_date: string | null
  currency: string
  bound_premium: number | null
  /** policies.premium, else what the debit notes billed. */
  premium: number | null
  billed: number | null
  commission: number | null
  debitNoteCount: number
  is_eb: boolean
  placement_line_id: string | null
  chosen_quote_id: string | null
  membersActive: number | null
  netToDate: number | null
}

// ── Members, movements, transactions (Agent D) ──

export type MemberRelationship = 'employee' | 'spouse' | 'child' | 'other'
export type MemberStatus       = 'active' | 'left'
export type MemberSource       = 'census' | 'movement' | 'manual'
export type MovementKind       = 'join' | 'leave' | 'change'
export type MovementStatus     = 'reported' | 'sent' | 'noted' | 'settled' | 'cancelled'
export type TransactionKind    = 'debit' | 'credit'

export const MEMBER_RELATIONSHIPS: MemberRelationship[] = ['employee', 'spouse', 'child', 'other']
export const MOVEMENT_KINDS: MovementKind[] = ['join', 'leave', 'change']
export const TRANSACTION_KINDS: TransactionKind[] = ['debit', 'credit']

/** One covered life on an EB policy, from the census at bind or from a later movement. */
export interface PolicyMember {
  id: string
  policy_id: string
  company_id: string
  member_name: string
  relationship: MemberRelationship
  employee_ref: string | null
  dob: string | null
  gender: string | null
  category: string | null
  plan_code: string | null
  joined_on: string | null
  left_on: string | null
  status: MemberStatus
  source: MemberSource
  source_submission_id: string | null
  created_at: string
  updated_at: string
}

/** A join, leave or change the client reported; sent to the insurer, then matched to its note. */
export interface PolicyMovement {
  id: string
  policy_id: string
  company_id: string
  kind: MovementKind
  member_id: string | null
  member_name: string
  relationship: string | null
  effective_on: string | null
  pax: number
  detail: Record<string, unknown>
  reported_thread_id: string | null
  reported_message_id: string | null
  sent_draft_id: string | null
  sent_at: string | null
  transaction_id: string | null
  status: MovementStatus
  created_at: string
  updated_at: string
}

/** Evidence per figure: the words it was read from and where. */
export type TransactionEvidence = Record<string, { excerpt: string; source: string }>

/** A debit or credit note the insurer issued on the policy. amount is signed: a credit is negative. */
export interface PolicyTransaction {
  id: string
  policy_id: string
  company_id: string
  kind: TransactionKind
  note_no: string | null
  issued_on: string | null
  pax: number | null
  amount: number
  currency: string
  description: string | null
  period_start: string | null
  period_end: string | null
  insurer: string | null
  member_names: string[]
  source_thread_id: string | null
  source_message_id: string | null
  source_attachment_id: string | null
  debit_note_id: string | null
  evidence: TransactionEvidence
  needs_review: boolean
  created_at: string
}

/** The computed week: what weekSnapshot returns and policy_position_weekly stores. */
export interface Snapshot {
  week_start: string
  pax_active: number
  joins: number
  leaves: number
  billed: number
  credited: number
  net_week: number
  net_to_date: number
}

export interface PolicyPositionWeek extends Snapshot {
  id: string
  policy_id: string
  company_id: string
  created_at: string
}
