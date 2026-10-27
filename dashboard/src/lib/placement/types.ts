/**
 * Placement: the broker takes a client's request for one or more policies to several insurers,
 * collects prices, and goes round again whenever the client changes the ask.
 *
 *   placement ─┬─ line (one policy requested) ─┬─ round 1 (spec as first asked) ─┬─ dispatch per insurer ─ quote
 *              │                               └─ round 2 (spec after a change)  └─ …
 *              └─ log (the company memory: what happened, what was decided, what is owed)
 */

export type PlacementStatus = 'open' | 'presented' | 'bound' | 'closed'
export type LineStatus      = 'open' | 'quoting' | 'quoted' | 'presented' | 'bound' | 'declined' | 'closed'
export type RoundReason     = 'initial' | 'client_change' | 'insurer_query' | 'expiry' | 'broker'
export type DispatchStatus  = 'drafted' | 'sent' | 'acknowledged' | 'info_requested' | 'quoted' | 'declined' | 'expired' | 'withdrawn'
export type QuoteStatus     = 'received' | 'superseded' | 'shortlisted' | 'recommended' | 'selected' | 'not_chosen' | 'expired'
export type LogKind         = 'note' | 'decision' | 'ask' | 'reply' | 'change' | 'chase' | 'quote' | 'sent' | 'declined' | 'info' | 'opened' | 'closed'

/** What is asked of the insurers. Free text per field, so a "limit" can be "S$1M any one claim". */
export type Spec = {
  insured?: string        // who is covered (name, business, address)
  limit?: string          // limit of indemnity / sum insured
  excess?: string
  period?: string         // "12 months from 1 Dec 2026"
  scope?: string          // territory, activities, what is included
  extras?: string         // extensions, endorsements asked for
  notes?: string          // anything else the insurer must know
}
export const SPEC_KEYS: (keyof Spec)[] = ['insured', 'limit', 'excess', 'period', 'scope', 'extras', 'notes']
export const SPEC_LABEL: Record<keyof Spec, string> = {
  insured: 'Insured', limit: 'Limit', excess: 'Excess', period: 'Period', scope: 'Scope', extras: 'Extensions', notes: 'Notes',
}

export interface Placement {
  id: string
  company_id: string
  title: string
  client_thread_id: string | null
  client_contact_id: string | null
  status: PlacementStatus
  inception_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PlacementLine {
  id: string
  placement_id: string
  product_line: string
  label: string | null
  spec: Spec
  status: LineStatus
  current_round_id: string | null
  next_step: string | null
  sort: number
  /** The policies row this line quotes (20261027_company_spine.sql). */
  policy_id?: string | null
  /** hr_submissions.id the line was priced on (employment benefits). */
  census_submission_id?: string | null
  created_at: string
  updated_at: string
}

export interface PlacementRound {
  id: string
  placement_id: string
  line_id: string
  round_no: number
  spec: Spec
  change_summary: string | null
  reason: RoundReason
  source_message_id: string | null
  opened_by: string | null
  opened_at: string
  closed_at: string | null
}

export interface PlacementDispatch {
  id: string
  placement_id: string
  line_id: string
  round_id: string
  company_id: string
  insurer_company_id: string | null
  insurer_name: string
  insurer_contact_id: string | null
  to_email: string
  ai_draft_id: string | null
  thread_id: string | null
  gmail_thread_id: string | null
  status: DispatchStatus
  sent_at: string | null
  last_outbound_at: string | null
  last_inbound_at: string | null
  next_chase_at: string | null
  chase_count: number
  created_at: string
  updated_at: string
}

/** Per-field verbatim excerpt and where it came from, so a price can be checked against its source. */
export type Evidence = Record<string, { excerpt: string; source: string }>

export interface PlacementQuote {
  id: string
  placement_id: string
  line_id: string
  round_id: string
  dispatch_id: string | null          // null for a rate-engine quote
  insurer_name: string
  /** 'insurer' = read from a reply; 'rate_table' = priced by the employment-benefits engine. */
  source?: 'insurer' | 'rate_table'
  engine_run_id?: string | null       // gb_quotations.id
  plan_label?: string | null
  premium_text: string | null
  premium_amount: number | null
  currency: string | null
  limit_text: string | null
  limit_amount: number | null
  excess_text: string | null
  validity_text: string | null
  valid_until: string | null
  key_terms: string[]
  exclusions: string[]
  subjectivities: string[]
  summary: string | null
  evidence: Evidence
  source_message_id: string | null
  thread_id: string | null
  status: QuoteStatus
  needs_review: boolean
  extracted_by: string | null
  created_at: string
}

export interface PlacementLogEntry {
  id: string
  company_id: string
  placement_id: string | null
  line_id: string | null
  round_id: string | null
  dispatch_id: string | null
  kind: LogKind
  actor: string
  text: string
  thread_id: string | null
  message_id: string | null
  detail: Record<string, unknown>
  created_at: string
}

/** Everything the company tab needs, in one read. */
export interface PlacementBundle {
  placements: Placement[]
  lines: PlacementLine[]
  rounds: PlacementRound[]
  dispatches: PlacementDispatch[]
  quotes: PlacementQuote[]
  log: PlacementLogEntry[]
}

// ── Derived: where each line stands ─────────────────────────────────────────────────────────

export interface DispatchPosition {
  dispatch: PlacementDispatch
  quote: PlacementQuote | null       // the current (non-superseded) quote for this dispatch
  chaseDue: boolean
  expired: boolean
  threadHref: string | null
}

export interface LinePosition {
  line: PlacementLine
  round: PlacementRound | null
  roundNo: number
  dispatches: DispatchPosition[]
  /** Quotes priced by the rate engine on this line (no dispatch): latest per insurer, not superseded. */
  engineQuotes: PlacementQuote[]
  quotedCount: number
  declinedCount: number
  awaitingCount: number
  allAnswered: boolean               // every dispatch of the round has quoted or declined
  best: PlacementQuote | null        // lowest normalised premium among current quotes
  pendingChange: PlacementLogEntry | null  // a client change the agent read but nobody has acted on
}
