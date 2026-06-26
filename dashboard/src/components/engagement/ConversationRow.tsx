'use client'

import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from './types'
import { EMAIL_SOURCES, STATUS_MAP } from './types'
import { fullName, timeAgo, needsReply as calcNeedsReply } from './helpers'

interface ConversationRowProps {
  lead:        Lead
  isActive:    boolean
  threadState: ThreadState | undefined
  onClick:     () => void
}

export function ConversationRow({ lead, isActive, threadState, onClick }: ConversationRowProps) {
  const msgs      = threadState?.messages ?? []
  const lastMsg   = msgs.at(-1)
  const hasReply  = calcNeedsReply(msgs)
  const name      = fullName(lead)
  const initial   = (name[0] ?? lead.email?.[0] ?? '?').toUpperCase()
  const preview   = lead.subject ?? lead.topic ?? lead.company ?? lead.email ?? '—'
  const timestamp = lastMsg?.sent_at ?? lead.created_at
  const isCampaign = !!lead.campaign_context
  const isForm     = lead.source === 'website_form'
  const isThread   = lead.source === 'thread'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-3 border-b border-[--border-subtle] transition-colors',
        'flex items-start gap-3 cursor-pointer',
        'border-l-2',
        isActive  && 'bg-accent border-l-primary',
        !isActive && hasReply  && 'bg-white border-l-[--warning] hover:bg-accent/40',
        !isActive && !hasReply && 'bg-white border-l-transparent hover:bg-accent/30',
      )}
    >
      {/* Avatar */}
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
        'text-[12px] font-bold mt-0.5',
        isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}>
        {initial}
      </div>

      <div className="flex-1 min-w-0">
        {/* Row 1: name + timestamp */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className={cn(
            'text-[12.5px] truncate leading-tight',
            hasReply ? 'font-semibold text-foreground' : 'font-medium text-foreground/80',
          )}>
            {name || lead.email?.split('@')[0] || '—'}
          </p>
          <span className="text-[10.5px] text-muted-foreground tabular-nums flex-shrink-0">
            {timeAgo(timestamp)}
          </span>
        </div>

        {/* Row 2: preview + indicators */}
        <div className="flex items-center gap-1.5">
          <p className="flex-1 text-[11px] text-muted-foreground truncate">
            {preview}
          </p>

          {/* Needs-reply dot */}
          {hasReply && !isActive && (
            <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[--warning]" />
          )}

          {/* Source chip — only show for non-obvious sources */}
          {isCampaign && (
            <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[--warning-bg] text-[--warning]">
              Campaign
            </span>
          )}
          {!isCampaign && isThread && (
            <span className="flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              FWD
            </span>
          )}
          {!isCampaign && isForm && (
            <span className="flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-primary/8 text-primary">
              Form
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
