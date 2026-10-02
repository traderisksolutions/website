'use client'

import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from './types'
import { fullName, timeAgo, leadNeedsReply } from './helpers'

/**
 * One conversation in the navigator. Grid `14px 1fr auto`: an ink dot when the thread needs a
 * reply (else transparent), sender and time, then `Company · subject`, then one muted state line
 * ("Needs your reply", "Awaiting client", with the triage type appended). Unread is the dot only —
 * no weight games, no colour. Selected = field grey with a 3px ink bar; hover = #f8f9fa.
 */

export type Density = 'comfortable' | 'standard' | 'compact'
const PAD: Record<Density, string> = { comfortable: 'py-4', standard: 'py-3', compact: 'py-2' }

const TYPE_LABEL: Record<string, string> = { renewal: 'Renewal', claim: 'Claim', rfq: 'Quote request', finance: 'Finance', new_business: 'New business' }

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
  const subject = lead.subject ?? lead.topic ?? lead.snippet ?? '(no subject)'
  const timestamp = msgs.at(-1)?.sent_at ?? lead.created_at
  const last = msgs.at(-1)
  const state = needs ? 'Needs your reply' : (last?.direction === 'outbound' || lead.lastDirection === 'outbound') ? 'Awaiting client' : null
  const type = lead.category ? TYPE_LABEL[lead.category] : null
  const stateLine = [state, type].filter(Boolean).join(' · ')

  return (
    <button type="button" onClick={onClick} aria-pressed={isActive} aria-label={`${name}, ${subject}${needs ? ', needs your reply' : ''}`}
      className={cn('relative w-full text-left grid grid-cols-[14px_1fr_auto] gap-x-2 pl-3.5 pr-5 border-0 cursor-pointer transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124]',
        PAD[density], isActive ? 'bg-[#f1f3f4]' : 'bg-white hover:bg-[#f8f9fa]')}
      style={{ borderBottom: `1px solid ${HAIRLINE}`, color: INK }}>
      {isActive && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: INK }} aria-hidden />}
      <span data-dot className="mt-[7px] w-2 h-2 rounded-full" style={{ background: needs ? INK : 'transparent' }} aria-hidden />
      <span className="min-w-0 text-[14px] font-medium leading-snug truncate">{name}</span>
      <span className="text-[12px] tabular-nums pt-0.5 whitespace-nowrap" style={{ color: FAINT }}>{timeAgo(timestamp)}</span>
      <span className="col-start-2 col-end-4 min-w-0 block text-[13.5px] leading-snug truncate mt-0.5" style={{ color: BODY }}>
        {company ? <><b className="font-medium" style={{ color: INK }}>{company}</b> · </> : null}{subject}
      </span>
      {density !== 'compact' && stateLine && (
        <span className="col-start-2 col-end-4 min-w-0 block text-[12.5px] leading-snug truncate mt-[3px]" style={{ color: MUTED }}>{stateLine}</span>
      )}
    </button>
  )
}
