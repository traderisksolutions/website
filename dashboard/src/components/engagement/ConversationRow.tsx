'use client'

import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from './types'
import { fullName, timeAgo, needsReply as calcNeedsReply } from './helpers'
import { LinkCompanyPopover } from './LinkCompanyPopover'

/**
 * Legacy row shape with the inline "Link to company" affordance. Not rendered by the navigator
 * (ThreadRow is); kept on the same tokens so any host that still mounts it matches the list.
 */

interface ConversationRowProps {
  lead:        Lead
  isActive:    boolean
  threadState: ThreadState | undefined
  onClick:     () => void
}

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIRLINE = '#e8eaed'
const FIELD = '#f1f3f4'

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
  // Only a real email_threads row can be linked — a 'thread'-sourced lead's own id IS the
  // thread id; other lead sources (e.g. WhatsApp) have no thread to patch.
  const linkableThreadId = lead.thread_id ?? (lead.source === 'thread' ? lead.id : null)
  const chip = 'flex-shrink-0 text-[11.5px] font-medium px-2 py-0.5 rounded-[6px]'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      aria-pressed={isActive}
      className={cn(
        'relative w-full text-left px-4 py-3 flex items-start gap-3 cursor-pointer transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124]',
        isActive ? 'bg-[#f1f3f4]' : 'bg-white hover:bg-[#f8f9fa]',
      )}
      style={{ borderBottom: `1px solid ${HAIRLINE}`, color: INK }}
    >
      {isActive && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: INK }} aria-hidden />}

      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-medium mt-0.5" style={{ background: FIELD, color: INK }}>
        {initial}
      </div>

      <div className="flex-1 min-w-0">
        {/* Row 1: name + timestamp */}
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <p className="m-0 text-[14px] font-medium truncate leading-tight" style={{ color: INK }}>
            {name || lead.email?.split('@')[0] || '—'}
          </p>
          <span className="text-[12px] tabular-nums flex-shrink-0" style={{ color: FAINT }}>
            {timeAgo(timestamp)}
          </span>
        </div>

        {/* Row 2: preview + indicators */}
        <div className="flex items-center gap-1.5">
          <p className="m-0 flex-1 text-[13.5px] truncate" style={{ color: BODY }}>
            {preview}
          </p>

          {/* Needs-reply dot — ink, the only unread marker */}
          {hasReply && !isActive && (
            <span className="flex-shrink-0 w-2 h-2 rounded-full" style={{ background: INK }} aria-hidden />
          )}

          {/* Source chip — only for non-obvious sources; the label carries the meaning */}
          {isCampaign && <span className={chip} style={{ background: FIELD, color: BODY }}>Campaign</span>}
          {!isCampaign && isThread && <span className={chip} style={{ background: FIELD, color: MUTED }}>Forwarded</span>}
          {!isCampaign && isForm && <span className={chip} style={{ background: FIELD, color: MUTED }}>Form</span>}
          {!lead.companyId && linkableThreadId && (
            <LinkCompanyPopover threadId={linkableThreadId} />
          )}
        </div>
      </div>
    </div>
  )
}
