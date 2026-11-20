'use client'

import { lastRealMessage } from '@/lib/threads/waiting'
import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from './types'
import { fullName, timeAgo, leadNeedsReply } from './helpers'
import { threadTitle } from '@/lib/crm/subject'

/**
 * One conversation in the navigator, in the Notion Mail register. Standard (the default) is two
 * lines: dot, sender, the triage type in muted text, time; then `Company · subject`. Compact is one
 * line: sender, subject, time. Comfortable adds the state line ("Needs your reply", "Awaiting
 * client"). Unread is the ink dot only. Selected = field grey with a 3px ink bar; hover = tint.
 */

export type Density = 'comfortable' | 'standard' | 'compact'
const PAD: Record<Density, string> = { comfortable: 'py-3', standard: 'py-2', compact: 'py-[7px]' }

const TYPE_LABEL: Record<string, string> = { renewal: 'Renewal', claim: 'Claim', rfq: 'Quote request', group_benefits: 'Group benefits', finance: 'Finance', new_business: 'New business' }

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
  const last = lastRealMessage(msgs)
  const state = needs ? 'Needs your reply' : (last?.direction === 'outbound' || lead.lastDirection === 'outbound') ? 'Awaiting client' : null
  const type = lead.category ? TYPE_LABEL[lead.category] : null
  const chase = !needs && lead.chaseDue ? `Chaser ${new Date(`${lead.chaseDue}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}` : null
  const stateLine = [state, chase, type].filter(Boolean).join(' · ')
  const rowCls = cn('relative w-full text-left border-0 border-b border-solid border-trs-line text-trs-ink cursor-pointer transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-trs-ink',
    PAD[density], isActive ? 'bg-trs-field' : 'bg-white hover:bg-trs-tint')
  const holder = lead.private ? `In ${(lead.private.owner ?? 'a colleague').split(/[\s,]+/)[0]}’s inbox` : null
  const label = `${name}, ${subject}${needs ? ', needs your reply' : ''}${holder ? `, ${holder}` : ''}`
  const bar = isActive && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-trs-ink" aria-hidden />
  const dot = <span data-dot className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', needs ? 'bg-trs-ink' : 'bg-transparent')} aria-hidden />

  if (density === 'compact') return (
    <button type="button" onClick={onClick} aria-pressed={isActive} aria-label={label} title={lead.subject ?? undefined}
      className={cn(rowCls, 'flex items-center gap-2 pl-3 pr-4')}>
      {bar}{dot}
      <span className="w-[112px] flex-shrink-0 text-body font-medium truncate">{name}</span>
      <span className="flex-1 min-w-0 text-body truncate text-trs-ink-2">{subject}</span>
      {holder && <span className="flex-shrink-0 text-small text-trs-warn">{holder}</span>}
      <span suppressHydrationWarning className="text-small tabular-nums whitespace-nowrap flex-shrink-0 text-trs-subtle">{timeAgo(timestamp)}</span>
    </button>
  )

  return (
    <button type="button" onClick={onClick} aria-pressed={isActive} aria-label={label}
      className={cn(rowCls, 'grid grid-cols-[6px_1fr_auto] items-center gap-x-2 pl-3 pr-4')}>
      {bar}{dot}
      <span className="min-w-0 flex items-baseline gap-1.5 leading-snug">
        <span className="min-w-0 text-body font-medium truncate">{name}</span>
        {density === 'standard' && type && <span className="flex-shrink-0 text-small text-trs-muted">{type}</span>}
        {holder && <span className="flex-shrink-0 text-small text-trs-warn">{holder}</span>}
      </span>
      <span suppressHydrationWarning className="text-small tabular-nums whitespace-nowrap text-trs-subtle">{timeAgo(timestamp)}</span>
      <span className="col-start-2 col-end-4 min-w-0 block text-body leading-snug truncate mt-px text-trs-ink-2" title={lead.subject ?? undefined}>
        {company ? <><b className="font-medium text-trs-ink">{company}</b> · </> : null}{subject}
      </span>
      {density === 'comfortable' && stateLine && (
        <span className="col-start-2 col-end-4 min-w-0 block text-small leading-snug truncate mt-0.5 text-trs-muted">{stateLine}</span>
      )}
    </button>
  )
}
