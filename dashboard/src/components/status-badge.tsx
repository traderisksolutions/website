import { cn } from '@/lib/utils'

export type ContactStatus =
  | 'new' | 'contacted' | 'engaged' | 'qualified'
  | 'proposal' | 'converted' | 'dropped' | 'replied'
  | 'prospect' | 'cc'

export type CampaignStatus =
  | 'draft' | 'review' | 'active' | 'paused' | 'completed' | 'archived'

export type DebitNoteStatus = 'unpaid' | 'partially_paid' | 'paid'

export type PipelineStatusBucket = 'in_progress' | 'closed' | 'spam'
export type PriorityLevel = 'high' | 'medium' | 'low'
export type ReplyLabel =
  | 'positive' | 'neutral' | 'negative' | 'unsubscribe'
  | 'out_of_office' | 'wrong_person' | 'meeting_intent' | 'question'

export type AppStatus = ContactStatus | CampaignStatus | DebitNoteStatus | PipelineStatusBucket | PriorityLevel | ReplyLabel

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
  // Debit notes
  unpaid:         { label: 'Unpaid',    bg: 'rgba(192,51,71,0.09)', color: '#C03347' },
  partially_paid: { label: 'Partial',   bg: 'rgba(138,66,0,0.09)',  color: '#8A4200' },
  paid:           { label: 'Paid',      bg: 'rgba(9,104,66,0.09)',  color: '#096842' },
  // Pipeline status bucket (new/closed reuse the contact-pipeline colors above)
  in_progress: { label: 'In Progress', bg: 'rgba(138,66,0,0.09)',  color: '#8A4200' },
  closed:      { label: 'Closed',      bg: 'rgba(9,104,66,0.09)',  color: '#096842' },
  spam:        { label: 'Spam',        bg: 'rgba(16,24,40,0.07)',  color: '#445868' },
  // Priority
  high:   { label: 'High',   bg: 'rgba(192,51,71,0.09)', color: '#C03347' },
  medium: { label: 'Medium', bg: 'rgba(138,66,0,0.09)',  color: '#8A4200' },
  low:    { label: 'Low',    bg: 'rgba(16,24,40,0.07)',  color: '#445868' },
  // Outbound reply classification — folded onto the same 5-hue system as everything else above
  // (green=good, blue=informational, gray=neutral, red=bad, amber=needs follow-up) rather than
  // introducing more one-off hues; the label text still differentiates all 8 categories.
  positive:       { label: 'Positive',       bg: 'rgba(9,104,66,0.09)',  color: '#096842' },
  meeting_intent: { label: 'Meeting Intent', bg: 'rgba(9,104,66,0.09)',  color: '#096842' },
  question:       { label: 'Question',       bg: 'rgba(12,51,138,0.09)', color: '#0C338A' },
  neutral:        { label: 'Neutral',        bg: 'rgba(16,24,40,0.07)',  color: '#445868' },
  negative:       { label: 'Not Interested', bg: 'rgba(192,51,71,0.09)', color: '#C03347' },
  unsubscribe:    { label: 'Unsubscribe',    bg: 'rgba(192,51,71,0.09)', color: '#C03347' },
  out_of_office:  { label: 'Out of Office',  bg: 'rgba(138,66,0,0.09)',  color: '#8A4200' },
  wrong_person:   { label: 'Wrong Person',   bg: 'rgba(138,66,0,0.09)',  color: '#8A4200' },
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
