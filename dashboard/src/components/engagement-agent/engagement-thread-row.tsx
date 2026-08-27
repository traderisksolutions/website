'use client'

import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from '@/components/engagement/types'
import { fullName, timeAgo, needsReply as calcNeedsReply } from '@/components/engagement/helpers'

// Triage badge styles — only the actionable categories get a chip (not general/other).
const CATEGORY_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  rfq:     { label: 'RFQ',     bg: 'rgba(79,70,229,0.12)',  color: '#4338ca' },
  claim:   { label: 'CLAIM',   bg: 'rgba(190,18,60,0.12)',  color: '#be123c' },
  renewal: { label: 'RENEWAL', bg: 'rgba(4,120,87,0.12)',   color: '#047857' },
}

interface EngagementThreadRowProps {
  lead:        Lead
  isActive:    boolean
  threadState: ThreadState | undefined
  onClick:     () => void
  /** Rail collapsed below the icon threshold — render just the avatar circle (name/subject/
   *  timestamp/badges all hidden, no room for them), with the same active/needs-reply tinting. */
  iconOnly?:   boolean
}

export function EngagementThreadRow({
  lead, isActive, threadState, onClick, iconOnly,
}: EngagementThreadRowProps) {
  const msgs      = threadState?.messages ?? []
  const hasReply  = calcNeedsReply(msgs)
  const name      = fullName(lead)
  const initial   = (name[0] ?? lead.email?.[0] ?? '?').toUpperCase()
  // Row 2 context: prefer company, fall back to email domain
  const context   = lead.company ?? (lead.email ? lead.email.split('@')[0] : null)
  // Preview: subject or topic
  const snippet   = lead.subject ?? lead.topic ?? '—'
  const timestamp = msgs.at(-1)?.sent_at ?? lead.created_at
  const isCampaign = !!lead.campaign_context

  if (iconOnly) {
    const label = [name || lead.email, snippet].filter(Boolean).join(' · ')
    return (
      <button
        onClick={onClick}
        aria-pressed={isActive}
        title={label}
        className={cn(
          'w-full flex items-center justify-center py-1.5 border-l-2 outline-none transition-colors',
          'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/30',
          isActive  && 'bg-primary/[.04] border-l-primary',
          !isActive && hasReply  && 'border-l-[--warning] hover:bg-[--warning-bg]/30',
          !isActive && !hasReply && 'border-l-transparent hover:bg-muted/50',
        )}
      >
        <span className={cn(
          'relative w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold select-none',
          isActive
            ? 'bg-primary/12 text-primary'
            : hasReply
              ? 'bg-[--warning-bg] text-[--warning]'
              : 'bg-muted text-muted-foreground',
        )}>
          {initial}
          {hasReply && !isActive && (
            <span className="absolute -top-0.5 -right-0.5 w-[7px] h-[7px] rounded-full bg-[--warning] ring-2 ring-card" />
          )}
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'w-full text-left border-b border-[--border-subtle]',
        'flex items-start gap-3 px-3.5 py-3',
        'border-l-2 outline-none transition-colors',
        'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/30',
        // Active
        isActive  && 'bg-primary/[.04] border-l-primary',
        // Needs reply (and not active)
        !isActive && hasReply  && 'bg-white border-l-[--warning] hover:bg-[--warning-bg]/30',
        // Default
        !isActive && !hasReply && 'bg-white border-l-transparent hover:bg-muted/50',
      )}
    >
      {/* Avatar */}
      <div className={cn(
        'flex-shrink-0 w-[28px] h-[28px] rounded-full flex items-center justify-center mt-[3px]',
        'text-[11px] font-bold select-none',
        isActive
          ? 'bg-primary/12 text-primary'
          : hasReply
            ? 'bg-[--warning-bg] text-[--warning]'
            : 'bg-muted text-muted-foreground',
      )}>
        {initial}
      </div>

      <div className="flex-1 min-w-0">
        {/* Row 1: Name (+ company inline) + timestamp */}
        <div className="flex items-baseline justify-between gap-2 mb-[3px]">
          <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
            <span className={cn(
              'text-[12.5px] truncate leading-tight min-w-0',
              hasReply
                ? 'font-semibold text-foreground'
                : 'font-medium text-foreground/90',
            )}>
              {name || lead.email?.split('@')[0] || '—'}
            </span>
            {context && (
              <span className="text-[10.5px] text-muted-foreground/60 font-normal flex-shrink truncate min-w-0 max-w-[140px]">
                {context}
              </span>
            )}
          </div>
          <span className="text-[10.5px] text-muted-foreground/60 tabular-nums flex-shrink-0 leading-tight whitespace-nowrap">
            {timeAgo(timestamp)}
          </span>
        </div>

        {/* Row 2: Subject snippet + state indicators */}
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[11px] text-muted-foreground/65 truncate leading-snug m-0">
            {snippet}
          </p>

          {/* Needs-reply dot — visible when not active, helps scan */}
          {hasReply && !isActive && (
            <span className="flex-shrink-0 w-[5px] h-[5px] rounded-full bg-[--warning]" />
          )}

          {/* Triage category badge — rfq / claim / renewal only (badge, not action) */}
          {lead.category && CATEGORY_BADGE[lead.category] && (
            <span className="flex-shrink-0 text-[8.5px] font-bold uppercase tracking-wide px-2 py-[2px] rounded-sm whitespace-nowrap"
              style={{ background: CATEGORY_BADGE[lead.category].bg, color: CATEGORY_BADGE[lead.category].color }}>
              {CATEGORY_BADGE[lead.category].label}
            </span>
          )}

          {/* Campaign tag — present but minimal, not a loud chip */}
          {isCampaign && (
            <span className="flex-shrink-0 text-[8.5px] font-bold px-2 py-[2px] rounded-sm bg-[--warning-bg] text-[--warning]">
              C
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
