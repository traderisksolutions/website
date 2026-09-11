/**
 * Shared vocabulary for the companies-first CRM. Every page and route under /companies,
 * /pipeline and the Home dashboard reads and writes through these types, so a company's
 * lifecycle, its people, its money and its open work mean the same thing everywhere.
 */

// ── Lifecycle ─────────────────────────────────────────────────────────────────────────────────

export const STAGES = ['lead', 'prospect', 'quoting', 'client', 'renewal_due', 'lapsed'] as const
export type Stage = typeof STAGES[number]

export const STAGE_LABEL: Record<Stage, string> = {
  lead:        'Lead',
  prospect:    'Prospect',
  quoting:     'Quoting',
  client:      'Client',
  renewal_due: 'Renewal due',
  lapsed:      'Lapsed',
}

export const STAGE_HELP: Record<Stage, string> = {
  // Lead and prospect are reserved for sales outreach, which is not connected yet. Anyone we
  // already correspond with is a client.
  lead:        'Reserved for sales outreach.',
  prospect:    'Reserved for sales outreach.',
  quoting:     'A quote or RFQ is in progress.',
  client:      'Has at least one policy placed through TRS.',
  renewal_due: 'A policy ends within 60 days.',
  lapsed:      'No active policy and no recent activity.',
}

export type StageTone = 'neutral' | 'blue' | 'amber' | 'green' | 'red'
export const STAGE_TONE: Record<Stage, StageTone> = {
  lead: 'neutral', prospect: 'blue', quoting: 'amber', client: 'green', renewal_due: 'amber', lapsed: 'red',
}

export const COMPANY_KINDS = ['client', 'insurer', 'partner', 'other'] as const
export type CompanyKind = typeof COMPANY_KINDS[number]

// ── Company ───────────────────────────────────────────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  kind: CompanyKind
  stage: Stage
  stage_changed_at: string | null
  owner_email: string | null
  domains: string[]
  domain: string | null
  type: string | null
  industry: string | null
  address: string | null
  notes: string | null
  source: string | null
  ai_brief: AiBrief | null
  ai_brief_at: string | null
  ai_brief_model: string | null
  created_at: string
  updated_at: string
}

export interface MoneyByCurrency { currency: string; outstanding: number; overdue: number }

/** A company row plus the roll-ups the list, pipeline and home views need. */
export interface CompanySummaryRow extends Company {
  contactCount: number
  openThreads: number
  needsReply: number
  lastActivityAt: string | null
  money: MoneyByCurrency[]
  overdueCount: number
  openDebitNotes: number
  nextRenewalDate: string | null
  activePolicies: number
  openQuotes: number
  suggestedStage: Stage | null
}

// ── People ────────────────────────────────────────────────────────────────────────────────────

export type PersonParty = 'client' | 'insurer' | 'trs' | 'other'

export interface Person {
  email: string
  name: string | null
  contactId: string | null
  party: PersonParty
  domain: string
  sent: number
  received: number
  cc: number
  threads: number
  score: number
  firstSeen: string | null
  lastSeen: string | null
  topics: { category: string; count: number }[]
  isPrimary: boolean
}

// ── Payments ──────────────────────────────────────────────────────────────────────────────────

export type DerivedPaymentStatus = 'paid' | 'partial' | 'unpaid' | 'overdue'

export interface DebitNoteRow {
  id: string
  company_id: string
  contact_id: string | null
  policy_id: string | null
  debit_note_no: string
  issue_date: string
  payment_due_date: string | null
  currency: string
  gross_amount: number
  net_amount: number | null
  paid_amount: number | null
  paid_direct_amount: number | null
  status: 'unpaid' | 'partially_paid' | 'paid'
  paid_direct_status: 'unpaid' | 'partially_paid' | 'paid' | null
  pay_direct_to_insurer: boolean | null
  insurer: string | null
  event_type: string | null
  drive_folder_url: string | null
  updated_at: string
}

export interface PaymentDerived extends DebitNoteRow {
  outstanding: number
  derived: DerivedPaymentStatus
  daysOverdue: number
  daysToDue: number | null
  policyNumber: string | null
  classOfInsurance: string | null
}

export interface PaymentSummary {
  byCurrency: MoneyByCurrency[]
  overdueCount: number
  openCount: number
  nextDue: string | null
}

// ── Quotes (RFQ + pricing matrix + group benefits, unified) ───────────────────────────────────

export type QuoteKind = 'rfq' | 'pricing_matrix' | 'group_benefits'

export interface QuoteRow {
  id: string
  kind: QuoteKind
  title: string
  status: string
  isOpen: boolean
  created_at: string
  effective_date: string | null
  productLine: string | null
  memberCount: number | null
  quotesReceived: number | null
  href: string
  caseId: string | null
}

// ── AI brief ──────────────────────────────────────────────────────────────────────────────────

export interface AiBrief {
  summary: string
  relationship: string
  open_items: { title: string; detail?: string; due?: string | null }[]
  risks: string[]
  upcoming: { what: string; when: string | null }[]
  suggested_stage: Stage | null
  sources: string[]
  generated_at: string
  model: string
  deep: boolean
}

// ── Link suggestions (triage) ─────────────────────────────────────────────────────────────────

export type LinkVerdict = 'existing' | 'new' | 'not_client' | 'unsure'

export interface LinkSuggestion {
  id: string
  thread_id: string
  verdict: LinkVerdict
  suggested_company_id: string | null
  suggested_name: string | null
  suggested_domain: string | null
  confidence: number | null
  rationale: string | null
  status: 'pending' | 'accepted' | 'rejected'
  model: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

// ── Cases ─────────────────────────────────────────────────────────────────────────────────────

export interface CaseRow {
  id: string
  name: string
  description: string | null
  status: string
  company_id: string | null
  created_at: string
  updated_at: string
  thread_count: number
  last_activity: string | null
}

// ── Threads (company-scoped view) ─────────────────────────────────────────────────────────────

export interface CompanyThread {
  id: string
  subject: string | null
  snippet: string | null
  category: string | null
  status: string
  message_count: number
  last_message_at: string | null
  lastDirection: 'inbound' | 'outbound' | null
  needsReply: boolean
  contact: { id: string; name: string | null; email: string | null } | null
  summary: string | null
  nextAction: string | null
  caseIds: string[]
}

// ── Activity timeline ─────────────────────────────────────────────────────────────────────────

export type ActivityKind =
  | 'email_in' | 'email_out' | 'ai_draft' | 'debit_note' | 'payment' | 'quote' | 'case' | 'stage' | 'note'

// ── Overview (alerts + where we left off) ─────────────────────────────────────────────────────

export type AlertKind = 'overdue' | 'awaiting_reply' | 'renewal' | 'policy_ended' | 'summary_stale' | 'no_summary'
export type AlertTone = 'red' | 'amber' | 'blue' | 'neutral'

export interface Alert {
  id: string
  kind: AlertKind
  tone: AlertTone
  title: string
  detail: string | null
  href: string | null
  at: string | null
}

export interface LeftOff {
  lastOutbound: { at: string; by: string; subject: string | null; threadId: string } | null
  lastInbound:  { at: string; from: string; subject: string | null; threadId: string } | null
  lastStageChange: { at: string; stage: string; by: string | null } | null
}

export interface CompanyOverview {
  alerts: Alert[]
  leftOff: LeftOff
  lastThreads: CompanyThread[]
  stakeholders: Person[]
  needsReply: number
  statusLine: string
  summaryStale: boolean
}

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  at: string
  title: string
  detail: string | null
  href: string | null
}
