export const WA_SOURCES    = new Set(['whatsapp_click'])
export const EMAIL_SOURCES = new Set(['website_form', 'email', 'manual'])
export const ALL_SOURCES   = new Set([...Array.from(WA_SOURCES), ...Array.from(EMAIL_SOURCES)])

export const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#1d4ed8', bg: 'rgba(59,130,246,0.10)'  },
  contacted: { label: 'Contacted', color: '#b45309', bg: 'rgba(245,158,11,0.10)'  },
  engaged:   { label: 'Engaged',   color: '#2563eb', bg: 'rgba(37,99,235,0.10)'   },
  qualified: { label: 'Qualified', color: '#15803d', bg: 'rgba(34,197,94,0.10)'   },
  proposal:  { label: 'Proposal',  color: '#d97706', bg: 'rgba(217,119,6,0.10)'   },
  converted: { label: 'Converted', color: '#7e22ce', bg: 'rgba(168,85,247,0.10)'  },
  dropped:   { label: 'Dropped',   color: '#4b5563', bg: 'rgba(107,114,128,0.10)' },
}

export const ALL_STATUSES = [
  'new', 'contacted', 'engaged', 'qualified', 'proposal', 'converted', 'dropped',
]
