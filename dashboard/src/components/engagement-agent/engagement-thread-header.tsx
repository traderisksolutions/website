'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Trash2, FileText, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lead } from '@/components/engagement/types'
import { STATUS_MAP } from '@/components/engagement/types'
import { fullName } from '@/components/engagement/helpers'
import type { CustomerProfile } from '@/lib/customer-profile'

/**
 * Legacy reader header (CompanyMail). Same look as engagement/ThreadHeader: subject, then who
 * wrote, then one context line in words (company · status · state · message count · profile
 * snapshot). Start RFQ is the one filled button when offered; Details and Delete are labelled
 * icon buttons. No state colour, no shadow: a hairline under it is enough. Props unchanged.
 */

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const DOT = '#9aa0a6'
const HAIR = '#e8eaed'

const ICON_BTN = 'h-9 w-9 rounded-[10px] bg-transparent border-0 cursor-pointer inline-flex items-center justify-center hover:bg-[#f1f3f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]'

/** The zero-click "before you even open the thread" snapshot — see EngagementProfileTab for the
 *  full detail view. Fetches once per contact; a genuinely cheap read (no AI calls, pure
 *  aggregation — see src/lib/customer-profile.ts), so no caching layer needed for v1. */
function useCustomerSnapshot(contactId: string): string[] {
  const [profile, setProfile] = useState<CustomerProfile | null>(null)

  useEffect(() => {
    let cancelled = false
    setProfile(null)
    fetch(`/api/customer-profile?contactId=${contactId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setProfile(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [contactId])

  if (!profile) return []
  const activePolicies = profile.policies.filter(p => p.status === 'active')
  const parts: string[] = []
  if (activePolicies.length > 0) parts.push(`${activePolicies.length} active polic${activePolicies.length === 1 ? 'y' : 'ies'}`)
  if (profile.company?.industry) parts.push(profile.company.industry)
  if (profile.customerStatus === 'renewal_due') parts.push('Renewal due')
  if (profile.recentSummaries.length > 0) parts.push(`${profile.recentSummaries.length} prior thread${profile.recentSummaries.length === 1 ? '' : 's'}`)
  return parts
}

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
  /** Manually launch the RFQ workflow when auto-detection missed it. */
  onStartRfq?:    () => void
  /** Opens the contact/status/notes info panel (a Sheet, see ThreadView) — replaces what used
   *  to be a perpetually-visible right-hand column. */
  onOpenInfo?:    () => void
  /** Kept for callers; the header no longer changes on scroll (the hairline is enough). */
  elevated?:      boolean
}

export function EngagementThreadHeader({
  subject, lead, messageCount, needsReply,
  statusKey, confirmDelete, deleting,
  onBack, onDelete, onCancelDelete, onStartRfq, onOpenInfo,
}: EngagementThreadHeaderProps) {
  const contactName    = fullName(lead)
  const displaySubject = subject ?? contactName
  const snapshot       = useCustomerSnapshot(lead.id)
  const statusLabel    = (STATUS_MAP[statusKey] ?? STATUS_MAP.contacted).label

  const parts: string[] = []
  if (lead.company) parts.push(lead.company)
  parts.push(statusLabel)
  if (needsReply) parts.push('Awaiting your reply')
  if (messageCount > 0) parts.push(`${messageCount} message${messageCount === 1 ? '' : 's'}`)
  parts.push(...snapshot)

  return (
    <header className="flex-shrink-0 bg-white px-5 sm:px-10 pt-5 pb-4 sticky top-0 z-20" style={{ borderBottom: `1px solid ${HAIR}` }}>
      <div className="max-w-[min(1040px,100%)] mx-auto">
        {onBack && (
          <button type="button" onClick={onBack} className="lg:hidden inline-flex items-center gap-1.5 text-[13px] bg-transparent border-0 p-0 cursor-pointer mb-3 hover:underline underline-offset-[3px]" style={{ color: MUTED }}>
            <ArrowLeft size={13} aria-hidden /> All conversations
          </button>
        )}

        <div className="flex items-start justify-between gap-x-5 gap-y-3 flex-wrap">
          <div className="min-w-0 flex-1 basis-[280px]">
            <h1 className="m-0 text-[22px] font-medium leading-[1.25] tracking-[-0.02em] line-clamp-2" style={{ color: INK, textWrap: 'balance' }}>{displaySubject}</h1>
            <p className="m-0 mt-2 text-[14px] truncate" style={{ color: BODY }}>
              {contactName}{lead.email && <span style={{ color: FAINT }}> · {lead.email}</span>}
            </p>
            <p className="m-0 mt-1.5 text-[13.5px] flex items-center gap-x-1.5 gap-y-0.5 flex-wrap" style={{ color: MUTED }}>
              {parts.map((p, i) => <span key={i} className="inline-flex items-center gap-1.5">{i > 0 && <span aria-hidden style={{ color: DOT }}>·</span>}{p}</span>)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onStartRfq && !confirmDelete && (
              <button
                type="button"
                onClick={onStartRfq}
                title="Turn this email into a quotation request"
                className="h-10 px-4 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer inline-flex items-center gap-2 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#202124]"
                style={{ background: INK }}
              >
                <FileText size={15} aria-hidden /> Start RFQ
              </button>
            )}

            {onOpenInfo && !confirmDelete && (
              <button type="button" onClick={onOpenInfo} aria-label="Contact and thread details" title="Details" className={ICON_BTN} style={{ color: BODY }}>
                <Info size={17} />
              </button>
            )}

            {confirmDelete ? (
              <div className="flex items-center gap-2.5 text-[13px]">
                <span style={{ color: BODY }}>Delete this thread?</span>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="text-[13px] font-medium bg-transparent border-0 p-0 cursor-pointer disabled:opacity-50 underline underline-offset-[3px]"
                  style={{ color: '#c5221f' }}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button type="button" onClick={onCancelDelete} className="text-[13px] bg-transparent border-0 p-0 cursor-pointer" style={{ color: MUTED }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={onDelete} aria-label="Delete thread" title="Delete thread" className={cn(ICON_BTN)} style={{ color: BODY }}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
