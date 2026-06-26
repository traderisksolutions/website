export type Lead = {
  id: string; created_at: string; source: string
  first_name: string | null; last_name: string | null
  email: string | null; phone: string | null; company: string | null
  department: string | null; contact_type: string | null
  topic: string | null; details: string | null; message: string | null
  page_url: string | null; status: string; notes?: string | null
  subject?: string | null
  thread_id?: string | null
  segment?: string | null
  segment_note?: string | null
  campaign_context?: {
    campaign_id: string
    campaign_name: string
    product_type: string
    step_replied_to: number | null
  } | null
}

export type RealMsg = {
  id: string
  direction: 'inbound' | 'outbound'
  from_address: string | null
  subject: string | null
  body_text: string | null
  sent_at: string | null
  to: string[]
  cc: string[]
}

export type ThreadState = {
  loading: boolean
  thread:  { id: string; subject: string | null; status: string; last_message_at: string | null; message_count: number } | null
  messages: RealMsg[]
  error:    string | null
}

export type StoredSummary = {
  id:          string
  summary:     string | null
  next_action: string | null
  draft_reply: string | null
  created_at:  string
}

export type RagSource = {
  file_id:     string
  file_name:   string
  chunk_index: number
  similarity:  number
  content:     string
}

export type DraftHistoryItem = {
  id:           string
  body:         string
  status:       string
  generated_by: string
  email_type:   string | null
  created_at:   string
}

export type SigOption = {
  id: string; name: string; title: string | null; phone: string | null
  email: string | null; company_tagline: string | null; sending_email: string | null
}

export type Sender = {
  email: string; label: string; type: 'shared' | 'personal'; verified: boolean
}

export const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  contacted: { label: 'Contacted', color: '#8A4200', bg: 'rgba(138,66,0,0.09)'  },
  engaged:   { label: 'Engaged',   color: '#0C338A', bg: 'rgba(12,51,138,0.09)' },
  qualified: { label: 'Qualified', color: '#096842', bg: 'rgba(9,104,66,0.09)'  },
  proposal:  { label: 'Proposal',  color: '#7E3C00', bg: 'rgba(130,60,0,0.09)'  },
  converted: { label: 'Converted', color: '#096842', bg: 'rgba(9,104,66,0.09)'  },
  dropped:   { label: 'Dropped',   color: '#445868', bg: 'rgba(16,24,40,0.07)'  },
}

export const ALL_STATUSES = ['contacted', 'engaged', 'qualified', 'proposal', 'converted', 'dropped']

export const EMAIL_TYPE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  PRICING:      { label: 'Pricing',      color: '#1d4ed8', bg: 'rgba(29,78,216,0.08)'  },
  COVERAGE:     { label: 'Coverage',     color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
  RENEWAL:      { label: 'Renewal',      color: '#b45309', bg: 'rgba(180,83,9,0.08)'   },
  DOCUMENT:     { label: 'Document',     color: '#0369a1', bg: 'rgba(3,105,161,0.08)'  },
  CLAIMS:       { label: 'Claims',       color: '#dc2626', bg: 'rgba(220,38,38,0.08)'  },
  CONVERSATION: { label: 'Conversation', color: '#059669', bg: 'rgba(5,150,105,0.08)'  },
}

export const ENGAGED_STATUSES = new Set(['contacted', 'engaged', 'qualified', 'proposal', 'converted'])
export const EMAIL_SOURCES    = new Set(['website_form', 'email', 'manual'])

export const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'live.com', 'me.com', 'msn.com', 'protonmail.com', 'aol.com', 'googlemail.com',
])
