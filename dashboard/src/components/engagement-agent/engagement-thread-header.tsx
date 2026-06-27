'use client'

import { ArrowLeft, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lead } from '@/components/engagement/types'
import { fullName } from '@/components/engagement/helpers'
import { EngagementStatusBadge } from './engagement-status-badge'

interface EngagementThreadHeaderProps {
  subject?:       string | null
  lead:           Lead
  messageCount:   number
  needsReply:     boolean
  statusKey:      string
  confirmDelete:  boolean
  deleting:       boolean
  onBack?:        () => void
  /** Handles both first press (enter confirm mode) and confirm press */
  onDelete:       () => void
  onCancelDelete: () => void
}

export function EngagementThreadHeader({
  subject, lead, messageCount, needsReply,
  statusKey, confirmDelete, deleting,
  onBack, onDelete, onCancelDelete,
}: EngagementThreadHeaderProps) {
  const contactName    = fullName(lead)
  const displaySubject = subject ?? contactName

  return (
    <div className="flex-shrink-0 px-5 py-4 border-b border-[--border-subtle] bg-card">
      {/* Mobile back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="lg:hidden flex items-center gap-1.5 text-[11px] text-muted-foreground mb-3 hover:text-foreground transition-colors"
        >
          <ArrowLeft size={12} strokeWidth={2} />
          All conversations
        </button>
      )}

      <div className="flex items-start justify-between gap-4">
        {/* Left: subject + participant info */}
        <div className="min-w-0 flex-1">
          {/* Subject line — the visual hero of the header */}
          <h1 className="text-[15px] font-bold text-foreground tracking-tight leading-snug m-0 mb-1.5 line-clamp-2">
            {displaySubject}
          </h1>

          {/* Participant + email count — compact, single line */}
          <p className="text-[11.5px] text-muted-foreground/70 m-0 leading-snug truncate">
            {contactName}
            {lead.email && (
              <span className="text-muted-foreground/45"> · {lead.email}</span>
            )}
            {lead.company && (
              <span className="text-muted-foreground/45"> · {lead.company}</span>
            )}
            {messageCount > 0 && (
              <span className="ml-1.5 text-[10.5px] bg-muted text-muted-foreground px-1.5 py-[1px] rounded-full tabular-nums inline-flex">
                {messageCount}
              </span>
            )}
          </p>

          {/* Needs-reply — shown only as a small restrained inline indicator */}
          {needsReply && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-[5px] h-[5px] rounded-full bg-[--warning] flex-shrink-0" />
              <span className="text-[10.5px] font-medium text-[--warning]">Awaiting reply</span>
            </div>
          )}
        </div>

        {/* Right: status + delete */}
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <EngagementStatusBadge status={statusKey} />

          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[--error]">Delete?</span>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="text-[11px] font-semibold text-white bg-[--error] rounded-lg px-2.5 py-1 disabled:opacity-50 transition-opacity"
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                onClick={onCancelDelete}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={onDelete}
              aria-label="Delete thread"
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                'text-muted-foreground/35 hover:text-[--error] hover:bg-[--error]/5',
              )}
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
