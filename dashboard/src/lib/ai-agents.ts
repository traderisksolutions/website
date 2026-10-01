/**
 * The agents, and the single place that says which code path belongs to which.
 *
 * Spend is attributed at read time by mapping `feature` onto an agent, rather than by a column
 * on the ledger. That is deliberate: it attributes the rows already written as well as the new
 * ones, and it needs no migration. The cost is that a new feature must be added to FEATURE_AGENT
 * below or it lands in `unattributed` — which the spend page shows rather than hides.
 */

export type AgentId = 'housekeeping' | 'crm' | 'askai' | 'groupbenefits' | 'pricingmatrix' | 'unattributed'

export interface AgentSpec {
  id:    AgentId
  label: string
  /** What it does, in one line, for the spend page. */
  work:  string
  /** The env var holding this agent's own Gemini key. */
  envKey: string
  /** The model tier it runs on. */
  model: string
}

export const AGENTS: Record<Exclude<AgentId, 'unattributed'>, AgentSpec> = {
  housekeeping: {
    id: 'housekeeping',
    label: 'Housekeeping',
    work: 'Files mail to a company, names unknown domains, reads signatures, keeps counters true.',
    envKey: 'GEMINI_API_KEY_HOUSEKEEPING',
    model: 'gemini-3.5-flash-lite',
  },
  crm: {
    id: 'crm',
    label: 'Client relationships',
    work: 'Reads every thread a company has, then drafts the next reply with its sources attached.',
    envKey: 'GEMINI_API_KEY_CRM',
    model: 'gemini-3.8-flash',
  },
  askai: {
    id: 'askai',
    label: 'Ask AI',
    work: 'Answers a question from the web and the company archive, and cites where each claim came from.',
    envKey: 'GEMINI_API_KEY_ASKAI',
    model: 'gemini-3.8-flash',
  },
  pricingmatrix: {
    id: 'pricingmatrix',
    label: 'Pricing matrix',
    work: 'Reads an insurer rate workbook and brochure twice over, reconciles the two readings, and flags every number they disagree on.',
    envKey: 'GEMINI_API_KEY_PRICINGMATRIX',
    // Reading A. Reading B stays on the pro tier, so the two readings remain genuinely different
    // models — a cross-check between one model and itself confirms nothing.
    model: 'gemini-3.8-flash',
  },
  groupbenefits: {
    id: 'groupbenefits',
    label: 'Group benefits',
    work: 'Reads each insurer\u2019s brochure and premium calculator once a year onto a canonical schedule, then prices a census and compares the options.',
    envKey: 'GEMINI_API_KEY_GROUPBENEFITS',
    // Reading a 60-page brochure onto a canonical schedule is a long-context job, which is what
    // this tier is for. The comparison itself needs no model at all: it is arithmetic over the
    // canon, so most of this agent's work costs nothing per quote.
    model: 'gemini-3.8-flash',
  },
}

/** Which agent owns each logged feature. */
export const FEATURE_AGENT: Record<string, AgentId> = {
  // ── Housekeeping ──────────────────────────────────────────────────────────
  crm_triage:        'housekeeping',
  crm_signature:     'housekeeping',
  auto_summarize:    'housekeeping',
  refresh_summary:   'housekeeping',
  summarize:         'housekeeping',
  email_classify:    'housekeeping',
  outbound_search:   'housekeeping',
  email_analysis:    'housekeeping',

  // ── Client relationships ──────────────────────────────────────────────────
  draft_reply:              'crm',
  draft_reply_drafter:      'crm',
  draft_reply_editor:       'crm',
  rag_draft_reply:          'crm',
  inbound_auto_draft:       'crm',
  draft_email:              'crm',
  outbound_reply_draft:     'crm',
  crm_brief:                'crm',
  crm_next_reply:           'crm',
  crm_chat:                 'crm',
  company_retrieval_query:  'crm',
  company_retrieval_embed:  'crm',
  rag_index:                'crm',
  nexus_synthesis:          'crm',
  nexus_strategy:           'crm',
  chat_consultant:          'crm',
  rfq_recommend:            'crm',
  rfq_quote_decision:       'crm',

  // ── Ask AI ────────────────────────────────────────────────────────────────
  ask_ai:          'askai',
  ask_ai_grounded: 'askai',
  ask_ai_clause:   'askai',

  // ── Group benefits ────────────────────────────────────────────────────────
  // The annual ingest, and the two places a model still helps. Comparing the quoted options
  // is absent from this list because it is deterministic — no model, nothing to attribute.
  gb_extract_schedule: 'groupbenefits',
  gb_extract_gemini:   'groupbenefits',
  gb_extract_judge:    'groupbenefits',
  gb_alias_suggest:    'groupbenefits',
  gb_plan_match:       'groupbenefits',
  gb_rules_extract:    'groupbenefits',

  // ── Pricing matrix ────────────────────────────────────────────────────────
  pm_rate_extract:            'pricingmatrix',
  pm_rate_extract_adjudicate: 'pricingmatrix',
  pm_benefit_extract:         'pricingmatrix',
  pm_rules_extract:           'pricingmatrix',
  pm_shape_detect:            'pricingmatrix',
  pm_plan_match:              'pricingmatrix',
  pm_classify_categories:     'pricingmatrix',
  pm_recommend:               'pricingmatrix',
}

export function agentOfFeature(feature: string | null | undefined): AgentId {
  return FEATURE_AGENT[feature ?? ''] ?? 'unattributed'
}

export function agentLabel(id: AgentId): string {
  return id === 'unattributed' ? 'Unattributed' : AGENTS[id].label
}

/**
 * The key an agent should use, falling back to the shared keys so nothing breaks before the
 * three dedicated keys are set. Returns the name it resolved as well, so a caller can say which
 * key answered — a wrong key fails as plausible-looking output, not as an error, so knowing
 * which one was used matters.
 */
export function agentKey(id: Exclude<AgentId, 'unattributed'>): { key: string | null; via: string } {
  const own = process.env[AGENTS[id].envKey]
  if (own && own.length > 20 && !own.startsWith('your_')) return { key: own, via: AGENTS[id].envKey }

  const shared: [string, string | undefined][] = [
    ['GEMINI_API_KEY_DRAFT_EMAIL',    process.env.GEMINI_API_KEY_DRAFT_EMAIL],
    ['GEMINI_API_KEY_EMAIL_ANALYSIS', process.env.GEMINI_API_KEY_EMAIL_ANALYSIS],
    ['GEMINI_API_KEY_INBOUND',        process.env.GEMINI_API_KEY_INBOUND],
    ['GEMINI_API_KEY',                process.env.GEMINI_API_KEY],
  ]
  for (const [name, val] of shared) {
    // A placeholder is worse than nothing: Gemini answers a bad key with HTTP 400, which the
    // callers treat as "no result" and quietly fall back to a default. .env.local ships
    // GEMINI_API_KEY_DRAFT_EMAIL as "your_gemini_api_key", so this check is not theoretical.
    if (val && val.length > 20 && !val.startsWith('your_')) return { key: val, via: name }
  }
  return { key: null, via: 'none' }
}
