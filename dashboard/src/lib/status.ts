// Single source of truth for pipeline status colors and labels.
// Import this everywhere instead of defining per-page STATUS_MAP objects.

export type PipelineStatus =
  | 'new' | 'prospect' | 'contacted' | 'engaged'
  | 'qualified' | 'proposal' | 'converted' | 'dropped'
  | 'replied' | 'cc'

export type OutboundStatus = 'new' | 'contacted' | 'replied' | 'qualified' | 'disqualified'

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:          { label: 'New',          color: '#0F3D91', bg: 'rgba(15,61,145,0.07)'  },
  prospect:     { label: 'Prospect',     color: '#667085', bg: 'rgba(20,30,50,0.05)'   },
  contacted:    { label: 'Contacted',    color: '#a66300', bg: 'rgba(194,122,7,0.09)'  },
  engaged:      { label: 'Engaged',      color: '#0F3D91', bg: 'rgba(15,61,145,0.07)'  },
  qualified:    { label: 'Qualified',    color: '#0a6e4b', bg: 'rgba(15,138,95,0.09)'  },
  proposal:     { label: 'Proposal',     color: '#b45309', bg: 'rgba(217,119,6,0.09)'  },
  converted:    { label: 'Converted',    color: '#0F8A5F', bg: 'rgba(15,138,95,0.12)'  },
  dropped:      { label: 'Dropped',      color: '#667085', bg: 'rgba(20,30,50,0.05)'   },
  replied:      { label: 'Replied',      color: '#a66300', bg: 'rgba(194,122,7,0.09)'  },
  disqualified: { label: 'Disqualified', color: '#C2414D', bg: 'rgba(194,65,77,0.08)'  },
  cc:           { label: 'CC',           color: '#9ca3af', bg: 'rgba(20,30,50,0.04)'   },
}

export const PIPELINE_STAGES = ['new', 'contacted', 'engaged', 'qualified', 'proposal', 'converted', 'dropped'] as const
export const ENGAGE_STAGES   = ['contacted', 'engaged', 'qualified', 'proposal', 'converted', 'dropped'] as const

export function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.dropped
}

export function statusBadgeClass(status: string): string {
  const css: Record<string, string> = {
    new:          'st-badge st-new',
    prospect:     'st-badge st-prospect',
    contacted:    'st-badge st-contacted',
    engaged:      'st-badge st-engaged',
    qualified:    'st-badge st-qualified',
    proposal:     'st-badge st-proposal',
    converted:    'st-badge st-converted',
    dropped:      'st-badge st-dropped',
    replied:      'st-badge st-replied',
    disqualified: 'st-badge st-new',
    cc:           'st-badge st-cc',
  }
  return css[status] ?? 'st-badge st-dropped'
}
