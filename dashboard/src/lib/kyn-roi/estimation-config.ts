// ROI estimation model for the Kyn ROI page.
// Assumptions reflect time avoided by a Singapore insurance professional per automation event.
// Conservative estimates — not user-editable in the UI.

export const HOURLY_RATE_SGD = 150

// These keys must match the `feature` values in the gemini_usage_log table.
export type GeminiFeature =
  | 'draft_reply'
  | 'auto_summarize'
  | 'refresh_summary'
  | 'summarize'
  | 'email_analysis'
  | 'outbound_search'
  | 'rag_index'

export interface ActionConfig {
  label: string
  minutesSaved: number
  workflowId: string
  basis: string
}

export const GEMINI_FEATURE_CONFIG: Record<GeminiFeature, ActionConfig> = {
  draft_reply: {
    label: 'Reply Drafted',
    minutesSaved: 15,
    workflowId: 'email_drafting',
    basis: 'Writing a professional insurance reply from scratch — research, tone, regulatory awareness',
  },
  auto_summarize: {
    label: 'Thread Auto-Summarised',
    minutesSaved: 5,
    workflowId: 'thread_intelligence',
    basis: 'Reading through email history to understand context before responding',
  },
  refresh_summary: {
    label: 'Summary Refreshed',
    minutesSaved: 3,
    workflowId: 'thread_intelligence',
    basis: 'Re-reading thread after new messages to re-establish context',
  },
  summarize: {
    label: 'Thread Summarised',
    minutesSaved: 5,
    workflowId: 'thread_intelligence',
    basis: 'Manual thread context analysis on demand',
  },
  email_analysis: {
    label: 'Lead Classified',
    minutesSaved: 10,
    workflowId: 'lead_qualification',
    basis: 'Reading and triaging a new inbound enquiry, determining type and urgency',
  },
  outbound_search: {
    label: 'Lead Search Run',
    minutesSaved: 20,
    workflowId: 'outbound_research',
    basis: 'Manual prospect discovery on LinkedIn/Apollo — search, filter, export, qualify',
  },
  rag_index: {
    label: 'Document Indexed',
    minutesSaved: 2,
    workflowId: 'knowledge_base',
    basis: 'Uploading, chunking, and tagging a policy or product document for retrieval',
  },
}

export const CAMPAIGN_ACTION_CONFIG: ActionConfig = {
  label: 'Campaign Drafted',
  minutesSaved: 45,
  workflowId: 'campaign_drafting',
  basis: 'Researching, briefing, and writing a multi-email outbound sequence manually',
}

export interface WorkflowDef {
  id: string
  label: string
  description: string
  color: string
}

export const WORKFLOW_DEFS: WorkflowDef[] = [
  {
    id: 'email_drafting',
    label: 'Email Drafting',
    description: 'AI-drafted replies reviewed and approved by your team',
    color: '#3b82f6',
  },
  {
    id: 'thread_intelligence',
    label: 'Thread Intelligence',
    description: 'Automatic summarisation and context analysis of email threads',
    color: '#10b981',
  },
  {
    id: 'lead_qualification',
    label: 'Lead Qualification',
    description: 'Instant classification and triage of inbound enquiries',
    color: '#f59e0b',
  },
  {
    id: 'outbound_research',
    label: 'Outbound Research',
    description: 'Automated prospect discovery and lead list building',
    color: '#8b5cf6',
  },
  {
    id: 'campaign_drafting',
    label: 'Campaign Drafting',
    description: 'AI-generated multi-step outbound email sequences',
    color: '#f97316',
  },
  {
    id: 'knowledge_base',
    label: 'Knowledge Base',
    description: 'Indexing and retrieval of policy and product documents',
    color: '#06b6d4',
  },
]
