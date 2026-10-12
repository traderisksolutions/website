// Leads are read from the leads_unified view: one row per sales_accounts row, with the best
// contact and the latest draft folded in. Read-only here; writes go to the base tables.

export const OUTREACH_STATUSES = ['pending_approval', 'approved', 'rejected', 'queued', 'sent', 'replied', 'suppressed', 'cancelled'] as const
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]

export const EMAIL_STATUSES = ['verified', 'found_publicly', 'suggested', 'unknown', 'invalid', 'bounced', 'suppressed'] as const
export type EmailStatus = (typeof EMAIL_STATUSES)[number]

export const ACTIONS = ['draft', 'research', 'human_review', 'suppress', 'reject'] as const
export type RecommendedAction = (typeof ACTIONS)[number]

export const ACCOUNT_STATUSES = ['new', 'researching', 'scored', 'queued', 'suppressed', 'rejected', 'closed'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export const OUTREACH_LABEL: Record<OutreachStatus | 'none', string> = {
  pending_approval: 'Pending approval', approved: 'Approved', rejected: 'Rejected', queued: 'Queued',
  sent: 'Sent', replied: 'Replied', suppressed: 'Suppressed', cancelled: 'Cancelled', none: 'No draft',
}
export const EMAIL_LABEL: Record<EmailStatus | 'none', string> = {
  verified: 'Verified', found_publicly: 'Found publicly', suggested: 'Suggested', unknown: 'Unknown',
  invalid: 'Invalid', bounced: 'Bounced', suppressed: 'Suppressed', none: 'No email',
}
export const ACTION_LABEL: Record<RecommendedAction, string> = {
  draft: 'Draft', research: 'Research', human_review: 'Human review', suppress: 'Suppress', reject: 'Reject',
}
export const ACCOUNT_LABEL: Record<AccountStatus, string> = {
  new: 'New', researching: 'Researching', scored: 'Scored', queued: 'Queued', suppressed: 'Suppressed', rejected: 'Rejected', closed: 'Closed',
}

/** A fixed map, not Intl.DisplayNames: the server and the browser name some regions
 *  differently, which breaks hydration. */
const LOCATION_NAME: Record<string, string> = {
  SG: 'Singapore', MY: 'Malaysia', ID: 'Indonesia', HK: 'Hong Kong', TH: 'Thailand', VN: 'Vietnam',
  PH: 'Philippines', TW: 'Taiwan', CN: 'China', AU: 'Australia',
}
export const locationLabel = (code: string) => LOCATION_NAME[code] ?? code

/** Columns the table needs. The heavy fields (draft body, evidence, contacts) load when a lead opens. */
export const LIST_COLUMNS = [
  'id', 'location', 'company', 'domain', 'industry', 'product_line', 'fit_score', 'intent_score', 'total_score',
  'contact_name', 'contact_title', 'contact_email', 'email_status', 'email_verified', 'contact_count',
  'recommended_action', 'account_status', 'exclusion_flags', 'outreach_status', 'outreach_to_email',
  'drafted_at', 'updated_at', 'created_at',
].join(',')

export type LeadRow = {
  id: string
  location: string
  company: string | null
  domain: string | null
  industry: string | null
  product_line: string | null
  fit_score: number | null
  intent_score: number | null
  total_score: number | null
  contact_name: string | null
  contact_title: string | null
  contact_email: string | null
  email_status: EmailStatus | null
  email_verified: boolean | null
  contact_count: number | null
  recommended_action: RecommendedAction | null
  account_status: AccountStatus | null
  exclusion_flags: string[] | null
  outreach_status: OutreachStatus | null
  outreach_to_email: string | null
  drafted_at: string | null
  updated_at: string | null
  created_at: string | null
}

export type LeadContact = {
  id?: string
  name?: string | null
  title?: string | null
  email?: string | null
  email_status?: string | null
  email_confidence?: number | null
  email_source_url?: string | null
  linkedin_url?: string | null
  phone?: string | null
  phone_status?: string | null
}

export type LeadDetail = LeadRow & {
  legal_name: string | null
  country: string | null
  company_size: string | null
  business_model: string | null
  confidence: number | null
  intent_summary: string | null
  workflow_pain: string | null
  conversation_angle: string | null
  evidence: unknown
  score_reasons: unknown
  uncertainty: unknown
  source_urls: string[] | null
  discovery_date: string | null
  last_researched_at: string | null
  email_source_url: string | null
  email_confidence: number | null
  contact_linkedin_url: string | null
  contact_phone: string | null
  contacts: LeadContact[] | null
  outreach_id: string | null
  outreach_channel: string | null
  outreach_subject: string | null
  outreach_body: string | null
  outreach_version: number | null
  approved_at: string | null
  sent_at: string | null
  source: string | null
  company_id: string | null
}

/** Per-location counts. "all" is the total. */
export type LeadKpis = {
  accounts: number
  contacts: number
  verifiedContacts: number
  withEmail: number
  added24h: number
  added7d: number
  drafts: Partial<Record<OutreachStatus, number>>
}

/** newSince: rows created after this are marked New in the table.
 *  lastAddedAt: the newest account on record; stale means the lead tool stopped. */
export type KpiSet = { byLocation: Record<string, LeadKpis>; lastAddedAt: string | null; newSince: string }
