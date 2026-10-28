/**
 * Placement: the broker takes a client's request for one or more policies to several insurers,
 * collects prices, and goes round again whenever the client changes the ask.
 *
 *   placement ─┬─ line (one policy requested) ─┬─ round 1 (spec as first asked) ─┬─ dispatch per insurer ─ quote
 *              │                               └─ round 2 (spec after a change)  └─ …
 *              └─ log (the company memory: what happened, what was decided, what is owed)
 */

export type PlacementStatus = 'open' | 'presented' | 'bound' | 'closed'
/** done = the debit note is issued and filed in Drive; dropped = the client did not go ahead; lost = placed elsewhere. */
export type LineStatus      = 'open' | 'quoting' | 'quoted' | 'presented' | 'bound' | 'declined' | 'closed' | 'done' | 'dropped' | 'lost'
export type RoundReason     = 'initial' | 'client_change' | 'insurer_query' | 'expiry' | 'broker'
export type DispatchStatus  = 'drafted' | 'sent' | 'acknowledged' | 'info_requested' | 'quoted' | 'declined' | 'expired' | 'withdrawn'
export type QuoteStatus     = 'received' | 'superseded' | 'shortlisted' | 'recommended' | 'selected' | 'not_chosen' | 'expired'
export type LogKind         = 'note' | 'decision' | 'ask' | 'reply' | 'change' | 'chase' | 'quote' | 'sent' | 'declined' | 'info' | 'opened' | 'closed' | 'done'
export type TierStatus      = 'proposed' | 'asked' | 'offered' | 'dropped'
export type TierSource      = 'client' | 'broker' | 'insurer'

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
  /** "Q-0142": rides in the subject of every email about the placement as [TRS-Q-0142]. */
  ref: string
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
  /** Set when the line's debit note is issued and filed in Drive. */
  done_at?: string | null
  debit_note_id?: string | null
  /** The quote the client picked, and the confirmation with that insurer (20261029_placement_bind.sql). */
  picked_quote_id?: string | null
  client_confirmed_at?: string | null
  confirm_draft_id?: string | null
  confirm_sent_at?: string | null
  insurer_confirmed_at?: string | null
  created_at: string
  updated_at: string
}

/**
 * Something the client wants priced side by side on a line: a limit ("1M"), a budget ("S$1,300
 * per head"), a plan, a deductible, or a mix. Tiers belong to the line, not the round, so a new
 * round asks every tier again on the new basis. An insurer that prices a tier nobody asked for
 * adds one with source 'insurer'.
 */
export interface PlacementTier {
  id: string
  placement_id: string
  line_id: string
  label: string
  spec: Spec
  target_premium: string | null
  status: TierStatus
  source: TierSource
  source_message_id: string | null
  created_by: string | null
  asked_at: string | null
  sort: number
  created_at: string
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
  /** Message-ID header of the request as sent: the same in every mailbox, so a reply matches wherever it lands. */
  rfc822_message_id?: string | null
  sent_from?: string | null      // the mailbox it went out from
  sent_by?: string | null        // the staff member who pressed Send
  sent_subject?: string | null
  /** The insurer product asked (20261028_insurer_products.sql); the name is joined on read. */
  insurer_product_id?: string | null
  insurer_product_name?: string | null
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
  /** The tier this price is for; null = the line's own spec. tier_label is as the insurer wrote it. */
  tier_id?: string | null
  tier_label?: string | null
  premium_per_head_text?: string | null
  premium_per_head_amount?: number | null
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

/** One comparison sent (or drafted) to the client: the quotes it carried, kept as sent. */
export interface PlacementShare {
  id: string
  placement_id: string
  company_id: string
  ai_draft_id: string | null
  quote_ids: string[]
  subject: string | null
  body: string | null
  status: 'drafted' | 'sent' | 'discarded'
  sent_at: string | null
  sent_by: string | null
  sent_from: string | null
  created_by: string | null
  created_at: string
}
/** Everything the company tab needs, in one read. */
export interface PlacementBundle {
  placements: Placement[]
  lines: PlacementLine[]
  rounds: PlacementRound[]
  dispatches: PlacementDispatch[]
  quotes: PlacementQuote[]
  tiers: PlacementTier[]
  /** Comparisons to the client; absent before 20261029_placement_bind.sql is applied. */
  shares?: PlacementShare[]
  log: PlacementLogEntry[]
}

// ── Derived: where each line stands ─────────────────────────────────────────────────────────

export interface DispatchPosition {
  dispatch: PlacementDispatch
  quote: PlacementQuote | null       // the current quote on the line's own spec, else the first tier priced
  /** Every current quote from this dispatch, one per tier (the line's own spec counts as one). */
  quotes: PlacementQuote[]
  chaseDue: boolean
  expired: boolean
  threadHref: string | null
}

export interface LinePosition {
  line: PlacementLine
  round: PlacementRound | null
  roundNo: number
  tiers: PlacementTier[]             // not dropped, in order
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
