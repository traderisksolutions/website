'use client'

import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from '@/components/engagement/types'
import { fullName, timeAgo, leadNeedsReply } from '@/components/engagement/helpers'

/**
 * Legacy conversation row (CompanyMail). The same row as engagement/ThreadRow: grid
 * `14px 1fr auto`, an ink dot when the thread needs a reply (else transparent), sender and time,
 * `Company · subject`, then one muted state line in words ("Needs your reply", "Awaiting client",
 * the triage type and "Campaign" appended). Selected = field grey with a 3px ink bar. No colour
 * chips, no weight games. `iconOnly` keeps the collapsed-rail avatar for callers that use it.
 */

const TYPE_LABEL: Record<string, string> = { renewal: 'Renewal', claim: 'Claim', rfq: 'Quote request', group_benefits: 'Group benefits', finance: 'Finance', new_business: 'New business' }

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIRLINE = '#e8eaed'
const FIELD = '#f1f3f4'

interface EngagementThreadRowProps {
  lead:        Lead
  isActive:    boolean
  threadState: ThreadState | undefined
  onClick:     () => void
  /** Rail collapsed below the icon threshold — render just the avatar circle (name/subject/
   *  timestamp/state all hidden, no room for them), with the same active/needs-reply cues. */
  iconOnly?:   boolean
}

export function EngagementThreadRow({
  lead, isActive, threadState, onClick, iconOnly,
}: EngagementThreadRowProps) {
  const msgs      = threadState?.messages ?? []
  const needs     = leadNeedsReply(lead, threadState)
  const name      = fullName(lead) || lead.email?.split('@')[0] || '—'
  const initial   = (name[0] ?? lead.email?.[0] ?? '?').toUpperCase()
  const company   = lead.companyName ?? lead.company ?? null
  const subject   = lead.subject ?? lead.topic ?? lead.snippet ?? '(no subject)'
  const timestamp = msgs.at(-1)?.sent_at ?? lead.created_at
  const last      = msgs.at(-1)
  const state     = needs ? 'Needs your reply' : (last?.direction === 'outbound' || lead.lastDirection === 'outbound') ? 'Awaiting client' : null
  const type      = lead.category ? TYPE_LABEL[lead.category] ?? null : null
  const campaign  = lead.campaign_context ? 'Campaign' : null
  const stateLine = [state, type, campaign].filter(Boolean).join(' · ')
  const ariaLabel = `${name}, ${subject}${needs ? ', needs your reply' : ''}`

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        aria-label={ariaLabel}
        title={[name, subject].filter(Boolean).join(' · ')}
        className={cn(
          'relative w-full flex items-center justify-center py-1.5 border-0 cursor-pointer transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124]',
          isActive ? 'bg-[#f1f3f4]' : 'bg-white hover:bg-[#f8f9fa]',
        )}
      >
        {isActive && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: INK }} aria-hidden />}
        <span
          className="relative w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-medium select-none"
          style={isActive ? { background: INK, color: '#fff' } : { background: FIELD, color: INK }}
          aria-hidden
        >
          {initial}
          {needs && !isActive && (
            <span data-dot className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white" style={{ background: INK }} />
          )}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={ariaLabel}
      className={cn(
        'relative w-full text-left grid grid-cols-[14px_1fr_auto] gap-x-2 pl-3.5 pr-5 py-3 border-0 cursor-pointer transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124]',
        isActive ? 'bg-[#f1f3f4]' : 'bg-white hover:bg-[#f8f9fa]',
      )}
      style={{ borderBottom: `1px solid ${HAIRLINE}`, color: INK }}
    >
      {isActive && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: INK }} aria-hidden />}
      <span data-dot className="mt-[7px] w-2 h-2 rounded-full" style={{ background: needs ? INK : 'transparent' }} aria-hidden />
      <span className="min-w-0 text-[14px] font-medium leading-snug truncate">{name}</span>
      <span className="text-[12px] tabular-nums pt-0.5 whitespace-nowrap" style={{ color: FAINT }}>{timeAgo(timestamp)}</span>
      <span className="col-start-2 col-end-4 min-w-0 block text-[13.5px] leading-snug truncate mt-0.5" style={{ color: BODY }}>
        {company ? <><b className="font-medium" style={{ color: INK }}>{company}</b> · </> : null}{subject}
      </span>
      {stateLine && (
        <span className="col-start-2 col-end-4 min-w-0 block text-[12.5px] leading-snug truncate mt-[3px]" style={{ color: MUTED }}>{stateLine}</span>
      )}
    </button>
  )
}
