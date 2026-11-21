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

// One neutral fill for every state; the badge draws it with the matching classes.
const BG = 'var(--trs-field)'
const FG = 'var(--trs-ink-2)'

export const STATUS_MAP: Record<AppStatus, StatusConfig> = {
  // State is never colour-coded: one neutral fill, ink text; the label carries the meaning.
  new:       { label: 'New',       bg: BG, color: FG },
  contacted: { label: 'Contacted', bg: BG, color: FG },
  engaged:   { label: 'Engaged',   bg: BG, color: FG },
  qualified: { label: 'Qualified', bg: BG, color: FG },
  proposal:  { label: 'Proposal',  bg: BG, color: FG },
  converted: { label: 'Converted', bg: BG, color: FG },
  dropped:   { label: 'Dropped',   bg: BG, color: FG },
  replied:   { label: 'Replied',   bg: BG, color: FG },
  prospect:  { label: 'Prospect',  bg: BG, color: FG },
  cc:        { label: 'CC',        bg: BG, color: FG },
  // Campaign
  draft:     { label: 'Draft',     bg: BG, color: FG },
  review:    { label: 'Review',    bg: BG, color: FG },
  active:    { label: 'Active',    bg: BG, color: FG },
  paused:    { label: 'Paused',    bg: BG, color: FG },
  completed: { label: 'Completed', bg: BG, color: FG },
  archived:  { label: 'Archived',  bg: BG, color: FG },
  // Debit notes
  unpaid:         { label: 'Unpaid',    bg: BG, color: FG },
  partially_paid: { label: 'Partial',   bg: BG, color: FG },
  paid:           { label: 'Paid',      bg: BG, color: FG },
  // Pipeline status bucket (new/closed reuse the contact-pipeline colors above)
  in_progress: { label: 'In Progress', bg: BG, color: FG },
  closed:      { label: 'Closed',      bg: BG, color: FG },
  spam:        { label: 'Spam',        bg: BG, color: FG },
  // Priority
  high:   { label: 'High',   bg: BG, color: FG },
  medium: { label: 'Medium', bg: BG, color: FG },
  low:    { label: 'Low',    bg: BG, color: FG },
  // Outbound reply classification — folded onto the same 5-hue system as everything else above
  // (green=good, blue=informational, gray=neutral, red=bad, amber=needs follow-up) rather than
  // introducing more one-off hues; the label text still differentiates all 8 categories.
  positive:       { label: 'Positive',       bg: BG, color: FG },
  meeting_intent: { label: 'Meeting Intent', bg: BG, color: FG },
  question:       { label: 'Question',       bg: BG, color: FG },
  neutral:        { label: 'Neutral',        bg: BG, color: FG },
  negative:       { label: 'Not Interested', bg: BG, color: FG },
  unsubscribe:    { label: 'Unsubscribe',    bg: BG, color: FG },
  out_of_office:  { label: 'Out of Office',  bg: BG, color: FG },
  wrong_person:   { label: 'Wrong Person',   bg: BG, color: FG },
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
        'inline-flex items-center rounded px-2 py-0.5 text-small leading-4 whitespace-nowrap bg-trs-field text-trs-muted',
        className,
      )}
    >
      {label ?? cfg.label}
    </span>
  )
}
