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
  // State is never colour-coded: one neutral fill, ink text; the label carries the meaning.
  new:       { label: 'New',       bg: '#f1f3f4', color: '#3c4043' },
  contacted: { label: 'Contacted', bg: '#f1f3f4', color: '#3c4043' },
  engaged:   { label: 'Engaged',   bg: '#f1f3f4', color: '#3c4043' },
  qualified: { label: 'Qualified', bg: '#f1f3f4', color: '#3c4043' },
  proposal:  { label: 'Proposal',  bg: '#f1f3f4', color: '#3c4043' },
  converted: { label: 'Converted', bg: '#f1f3f4', color: '#3c4043' },
  dropped:   { label: 'Dropped',   bg: '#f1f3f4', color: '#3c4043' },
  replied:   { label: 'Replied',   bg: '#f1f3f4', color: '#3c4043' },
  prospect:  { label: 'Prospect',  bg: '#f1f3f4', color: '#3c4043' },
  cc:        { label: 'CC',        bg: '#f1f3f4', color: '#3c4043' },
  // Campaign
  draft:     { label: 'Draft',     bg: '#f1f3f4', color: '#3c4043' },
  review:    { label: 'Review',    bg: '#f1f3f4', color: '#3c4043' },
  active:    { label: 'Active',    bg: '#f1f3f4', color: '#3c4043' },
  paused:    { label: 'Paused',    bg: '#f1f3f4', color: '#3c4043' },
  completed: { label: 'Completed', bg: '#f1f3f4', color: '#3c4043' },
  archived:  { label: 'Archived',  bg: '#f1f3f4', color: '#3c4043' },
  // Debit notes
  unpaid:         { label: 'Unpaid',    bg: '#f1f3f4', color: '#3c4043' },
  partially_paid: { label: 'Partial',   bg: '#f1f3f4', color: '#3c4043' },
  paid:           { label: 'Paid',      bg: '#f1f3f4', color: '#3c4043' },
  // Pipeline status bucket (new/closed reuse the contact-pipeline colors above)
  in_progress: { label: 'In Progress', bg: '#f1f3f4', color: '#3c4043' },
  closed:      { label: 'Closed',      bg: '#f1f3f4', color: '#3c4043' },
  spam:        { label: 'Spam',        bg: '#f1f3f4', color: '#3c4043' },
  // Priority
  high:   { label: 'High',   bg: '#f1f3f4', color: '#3c4043' },
  medium: { label: 'Medium', bg: '#f1f3f4', color: '#3c4043' },
  low:    { label: 'Low',    bg: '#f1f3f4', color: '#3c4043' },
  // Outbound reply classification — folded onto the same 5-hue system as everything else above
  // (green=good, blue=informational, gray=neutral, red=bad, amber=needs follow-up) rather than
  // introducing more one-off hues; the label text still differentiates all 8 categories.
  positive:       { label: 'Positive',       bg: '#f1f3f4', color: '#3c4043' },
  meeting_intent: { label: 'Meeting Intent', bg: '#f1f3f4', color: '#3c4043' },
  question:       { label: 'Question',       bg: '#f1f3f4', color: '#3c4043' },
  neutral:        { label: 'Neutral',        bg: '#f1f3f4', color: '#3c4043' },
  negative:       { label: 'Not Interested', bg: '#f1f3f4', color: '#3c4043' },
  unsubscribe:    { label: 'Unsubscribe',    bg: '#f1f3f4', color: '#3c4043' },
  out_of_office:  { label: 'Out of Office',  bg: '#f1f3f4', color: '#3c4043' },
  wrong_person:   { label: 'Wrong Person',   bg: '#f1f3f4', color: '#3c4043' },
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
        'inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap',
        className,
      )}
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {label ?? cfg.label}
    </span>
  )
}
