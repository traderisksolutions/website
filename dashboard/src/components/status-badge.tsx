import { cn } from '@/lib/utils'

export type ContactStatus =
  | 'new' | 'contacted' | 'engaged' | 'qualified'
  | 'proposal' | 'converted' | 'dropped' | 'replied'
  | 'prospect' | 'cc'

export type CampaignStatus =
  | 'draft' | 'review' | 'active' | 'paused' | 'completed' | 'archived'

export type AppStatus = ContactStatus | CampaignStatus

type StatusConfig = { label: string; bg: string; color: string }

export const STATUS_MAP: Record<AppStatus, StatusConfig> = {
  // Contact pipeline — all validated ≥ 4.5:1 on white card
  new:       { label: 'New',       bg: 'rgba(12,51,138,0.09)',  color: '#0C338A' },
  contacted: { label: 'Contacted', bg: 'rgba(138,66,0,0.09)',   color: '#8A4200' },
  engaged:   { label: 'Engaged',   bg: 'rgba(12,51,138,0.09)',  color: '#0C338A' },
  qualified: { label: 'Qualified', bg: 'rgba(9,104,66,0.09)',   color: '#096842' },
  proposal:  { label: 'Proposal',  bg: 'rgba(130,60,0,0.09)',   color: '#7E3C00' },
  converted: { label: 'Converted', bg: 'rgba(9,104,66,0.12)',   color: '#096842' },
  dropped:   { label: 'Dropped',   bg: 'rgba(16,24,40,0.07)',   color: '#445868' },
  replied:   { label: 'Replied',   bg: 'rgba(138,66,0,0.09)',   color: '#8A4200' },
  prospect:  { label: 'Prospect',  bg: 'rgba(16,24,40,0.07)',   color: '#445868' },
  cc:        { label: 'CC',        bg: 'rgba(16,24,40,0.06)',   color: '#5C6878' },
  // Campaign
  draft:     { label: 'Draft',     bg: 'rgba(130,64,0,0.09)',   color: '#7E4000' },
  review:    { label: 'Review',    bg: 'rgba(12,51,138,0.09)',  color: '#0C338A' },
  active:    { label: 'Active',    bg: 'rgba(9,104,66,0.09)',   color: '#096842' },
  paused:    { label: 'Paused',    bg: 'rgba(90,34,184,0.09)',  color: '#5A22B8' },
  completed: { label: 'Completed', bg: 'rgba(16,24,40,0.07)',   color: '#445868' },
  archived:  { label: 'Archived',  bg: 'rgba(16,24,40,0.06)',   color: '#5C6878' },
}

interface StatusBadgeProps {
  status: AppStatus
  label?: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const cfg = STATUS_MAP[status]
  if (!cfg) return null

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        className,
      )}
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {label ?? cfg.label}
    </span>
  )
}
