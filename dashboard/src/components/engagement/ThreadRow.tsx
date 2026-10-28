'use client'

import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from './types'
import { fullName, timeAgo, leadNeedsReply } from './helpers'
import { threadTitle } from '@/lib/crm/subject'

/**
 * One conversation in the navigator, in the Notion Mail register. Standard (the default) is two
 * lines: dot, sender, the triage type in muted text, time; then `Company · subject`. Compact is one
 * line: sender, subject, time. Comfortable adds the state line ("Needs your reply", "Awaiting
 * client"). Unread is the ink dot only. Selected = field grey with a 3px ink bar; hover = #f8f9fa.
 */

export type Density = 'comfortable' | 'standard' | 'compact'
const PAD: Record<Density, string> = { comfortable: 'py-3', standard: 'py-2', compact: 'py-[7px]' }

const TYPE_LABEL: Record<string, string> = { renewal: 'Renewal', claim: 'Claim', rfq: 'Quote request', group_benefits: 'Group benefits', finance: 'Finance', new_business: 'New business' }

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIRLINE = '#e8eaed'

export function ThreadRow({ lead, isActive, threadState, onClick, density = 'standard' }: {
  lead: Lead; isActive: boolean; threadState: ThreadState | undefined; onClick: () => void; density?: Density
}) {
  const msgs = threadState?.messages ?? []
  const needs = leadNeedsReply(lead, threadState)
  const name = fullName(lead) || lead.email?.split('@')[0] || '—'
  const company = lead.companyName ?? lead.company ?? null
  // The housekeeping title, else the cleaned subject; the raw subject stays in the tooltip.
  const hasSubject = !!(lead.display_subject?.trim() || lead.subject?.trim())
  const subject = hasSubject ? threadTitle(lead) : (lead.topic ?? lead.snippet ?? '(no subject)')
  const timestamp = msgs.at(-1)?.sent_at ?? lead.created_at
  const last = msgs.at(-1)
  const state = needs ? 'Needs your reply' : (last?.direction === 'outbound' || lead.lastDirection === 'outbound') ? 'Awaiting client' : null
  const type = lead.category ? TYPE_LABEL[lead.category] : null
  const stateLine = [state, type].filter(Boolean).join(' · ')
  const rowCls = cn('relative w-full text-left border-0 cursor-pointer transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124]',
    PAD[density], isActive ? 'bg-[#f1f3f4]' : 'bg-white hover:bg-[#f8f9fa]')
  const label = `${name}, ${subject}${needs ? ', needs your reply' : ''}`
  const bar = isActive && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: INK }} aria-hidden />
  const dot = <span data-dot className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: needs ? INK : 'transparent' }} aria-hidden />

  if (density === 'compact') return (
    <button type="button" onClick={onClick} aria-pressed={isActive} aria-label={label} title={lead.subject ?? undefined}
      className={cn(rowCls, 'flex items-center gap-2 pl-3 pr-4')} style={{ borderBottom: `1px solid ${HAIRLINE}`, color: INK }}>
      {bar}{dot}
      <span className="w-[112px] flex-shrink-0 text-[13px] font-medium truncate">{name}</span>
      <span className="flex-1 min-w-0 text-[13px] truncate" style={{ color: BODY }}>{subject}</span>
      <span className="text-[11.5px] tabular-nums whitespace-nowrap flex-shrink-0" style={{ color: FAINT }}>{timeAgo(timestamp)}</span>
    </button>
  )

  return (
    <button type="button" onClick={onClick} aria-pressed={isActive} aria-label={label}
      className={cn(rowCls, 'grid grid-cols-[6px_1fr_auto] items-center gap-x-2 pl-3 pr-4')}
      style={{ borderBottom: `1px solid ${HAIRLINE}`, color: INK }}>
      {bar}{dot}
      <span className="min-w-0 flex items-baseline gap-1.5 leading-snug">
        <span className="min-w-0 text-[13.5px] font-medium truncate">{name}</span>
        {density === 'standard' && type && <span className="flex-shrink-0 text-[11.5px]" style={{ color: MUTED }}>{type}</span>}
      </span>
      <span className="text-[11.5px] tabular-nums whitespace-nowrap" style={{ color: FAINT }}>{timeAgo(timestamp)}</span>
      <span className="col-start-2 col-end-4 min-w-0 block text-[13px] leading-snug truncate mt-px" style={{ color: BODY }} title={lead.subject ?? undefined}>
        {company ? <><b className="font-medium" style={{ color: INK }}>{company}</b> · </> : null}{subject}
      </span>
      {density === 'comfortable' && stateLine && (
        <span className="col-start-2 col-end-4 min-w-0 block text-[12px] leading-snug truncate mt-0.5" style={{ color: MUTED }}>{stateLine}</span>
      )}
    </button>
  )
}
