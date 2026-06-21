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
  // Contact pipeline
  new:       { label: 'New',       bg: 'rgba(15,61,145,0.07)',   color: '#0F3D91' },
  contacted: { label: 'Contacted', bg: 'rgba(194,122,7,0.09)',   color: '#a66300' },
  engaged:   { label: 'Engaged',   bg: 'rgba(15,61,145,0.07)',   color: '#0F3D91' },
  qualified: { label: 'Qualified', bg: 'rgba(15,138,95,0.09)',   color: '#0a6e4b' },
  proposal:  { label: 'Proposal',  bg: 'rgba(217,119,6,0.09)',   color: '#b45309' },
  converted: { label: 'Converted', bg: 'rgba(15,138,95,0.12)',   color: '#0F8A5F' },
  dropped:   { label: 'Dropped',   bg: 'rgba(20,30,50,0.05)',    color: '#667085' },
  replied:   { label: 'Replied',   bg: 'rgba(194,122,7,0.09)',   color: '#a66300' },
  prospect:  { label: 'Prospect',  bg: 'rgba(20,30,50,0.05)',    color: '#667085' },
  cc:        { label: 'CC',        bg: 'rgba(20,30,50,0.04)',    color: '#9ca3af' },
  // Campaign
  draft:     { label: 'Draft',     bg: 'rgba(194,122,7,0.09)',   color: '#92400e' },
  review:    { label: 'Review',    bg: 'rgba(30,64,175,0.08)',   color: '#1e40af' },
  active:    { label: 'Active',    bg: 'rgba(22,101,52,0.08)',   color: '#166534' },
  paused:    { label: 'Paused',    bg: 'rgba(124,58,237,0.08)',  color: '#7c3aed' },
  completed: { label: 'Completed', bg: 'rgba(20,30,50,0.06)',    color: '#555555' },
  archived:  { label: 'Archived',  bg: 'rgba(20,30,50,0.04)',    color: '#aaaaaa' },
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
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        className,
      )}
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {label ?? cfg.label}
    </span>
  )
}
