'use client'

import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { RefreshCw, X, FileEdit, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from './types'
import { ThreadRow, type Density } from './ThreadRow'
import { leadNeedsReply } from './helpers'
import type { NewEmailDraft } from './NewEmailComposeModal'
import { useEngagementNav } from '@/providers/engagement-nav-provider'
import type { EngagementTab } from '@/providers/engagement-nav-provider'

/** One saved threadless "new compose" draft — shape returned by GET /api/engagement/drafts. */
export type DraftRow = {
  id: string; to_email: string | null; cc: string | null; subject: string | null; body: string | null
  attachments: { filename: string; mime_type?: string; storage_url: string }[] | null
  created_at: string
}

interface ConversationListProps {
  leads:          Lead[]
  visible:        Lead[]
  threadMap:      Record<string, ThreadState>
  selectedId:     string | null
  activeTab:      EngagementTab
  search:         string
  loading:        boolean
  refreshing:     boolean
  onSelect:       (id: string) => void
  onRefresh:      () => void
  onOpenDraft:    (draft: NewEmailDraft) => void
  /** ThreadListPane owns the navigator header and footer — pass this so the list does not add
   *  its own title/refresh strip on top. Defaults to shown for any standalone use. */
  hideHeader?:    boolean
  density?:       Density
  /** Avatar-only rows for a very narrow host. The navigator's own collapsed state is the icon
   *  rail in ThreadListPane (CollapsedNavRail); this stays for compatibility. */
  iconOnly?:      boolean
}

const INK = '#202124'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIRLINE = '#e8eaed'
const FIELD = '#f1f3f4'

const PAD: Record<Density, string> = { comfortable: 'py-4', standard: 'py-3', compact: 'py-2' }

function draftOf(d: DraftRow): NewEmailDraft {
  return { toEmail: d.to_email ?? '', cc: d.cc ?? '', subject: d.subject ?? '', body: d.body ?? '', attachment: d.attachments?.[0], draftId: d.id }
}

function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <div aria-hidden className="animate-pulse">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="grid grid-cols-[14px_1fr_auto] gap-x-2 pl-3.5 pr-5 py-3" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <span />
          <span className="h-[14px] w-[45%] rounded-[4px]" style={{ background: FIELD }} />
          <span className="h-[12px] w-[38px] rounded-[4px]" style={{ background: FIELD }} />
          <span className="col-start-2 col-end-4 mt-1.5 h-[13px] w-[80%] rounded-[4px]" style={{ background: FIELD }} />
          <span className="col-start-2 col-end-4 mt-1.5 h-[12px] w-[30%] rounded-[4px]" style={{ background: FIELD }} />
        </div>
      ))}
    </div>
  )
}

/** The scrollable rows for whichever quick view the navigator's filters resolve to (`visible`,
 *  computed in page.tsx). ThreadListPane renders the header, quick views and footer around it.
 *  Still owns loading the drafts list (that data is not needed anywhere else) and pushes its
 *  count into the shared nav context so the Drafts view shows a live count. */
export function ConversationList({
  leads, visible, threadMap, selectedId,
  activeTab, search,
  loading, refreshing,
  onSelect, onRefresh, onOpenDraft, hideHeader, iconOnly, density = 'standard',
}: ConversationListProps) {
  const { setCounts, setSearch } = useEngagementNav()
  const needsReplyCount = leads.filter(l => leadNeedsReply(l, threadMap[l.id])).length

  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [draftsLoading, setDraftsLoading] = useState(false)
  const loadDrafts = () => {
    setDraftsLoading(true)
    fetch('/api/engagement/drafts', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then(rows => setDrafts(Array.isArray(rows) ? rows : []))
      .finally(() => setDraftsLoading(false))
  }
  useEffect(loadDrafts, [])
  useEffect(() => { if (activeTab === 'drafts') loadDrafts() }, [activeTab])
  useEffect(() => { setCounts(c => ({ ...c, drafts: drafts.length })) }, [drafts.length, setCounts])

  async function discardDraft(id: string, e: MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Discard this draft?')) return
    await fetch(`/api/engagement/drafts/${id}`, { method: 'DELETE' })
    loadDrafts()
  }

  const empty = (text: string, action?: { label: string; onClick: () => void }) => (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="m-0 text-[14px]" style={{ color: MUTED }}>{text}</p>
      {action && (
        <button type="button" onClick={action.onClick}
          className="h-9 px-3 rounded-[10px] text-[13.5px] font-medium bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]" style={{ color: INK }}>
          {action.label}
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      {!hideHeader && !iconOnly && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 h-11" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-medium truncate" style={{ color: INK }}>
              {activeTab === 'all' ? 'All inbox' : activeTab === 'prospects' ? 'Prospects' : activeTab === 'clients' ? 'Clients' : 'Drafts'}
            </span>
            {!loading && needsReplyCount > 0 && (
              <span className="text-[12px] tabular-nums flex-shrink-0" style={{ color: FAINT }}>{needsReplyCount} need a reply</span>
            )}
          </div>
          <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Sync mail" title={refreshing ? 'Syncing…' : 'Sync mail'}
            className="w-9 h-9 inline-flex items-center justify-center rounded-[10px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] disabled:opacity-50 flex-shrink-0" style={{ color: MUTED }}>
            <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto" role="list" aria-label={activeTab === 'drafts' ? 'Drafts' : 'Conversations'}>
        {activeTab === 'drafts' ? (
          <>
            {draftsLoading && <SkeletonRows n={3} />}
            {!draftsLoading && drafts.length === 0 && empty('No saved drafts.')}
            {!draftsLoading && drafts.map(d => iconOnly ? (
              <div key={d.id} role="listitem">
                <button type="button" title={d.subject || d.to_email || '(no subject)'} aria-label={`Draft, ${d.subject || d.to_email || 'no subject'}`} onClick={() => onOpenDraft(draftOf(d))}
                  className="w-full flex items-center justify-center py-1.5 bg-transparent border-0 cursor-pointer">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: FIELD, color: MUTED }}><FileEdit size={13} /></span>
                </button>
              </div>
            ) : (
              <div key={d.id} role="listitem" className="relative">
                <button type="button" onClick={() => onOpenDraft(draftOf(d))} aria-label={`Draft, ${d.subject || 'no subject'}, to ${d.to_email || 'nobody yet'}`}
                  className={cn('w-full text-left grid grid-cols-[14px_1fr_auto] gap-x-2 pl-3.5 pr-12 bg-white border-0 cursor-pointer transition-colors hover:bg-[#f8f9fa]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124]', PAD[density])}
                  style={{ borderBottom: `1px solid ${HAIRLINE}`, color: INK }}>
                  <span className="mt-[7px] w-2 h-2 rounded-full" aria-hidden />
                  <span className="min-w-0 text-[14px] font-medium leading-snug truncate">{d.subject || '(no subject)'}</span>
                  <span className="text-[12px] tabular-nums pt-0.5 whitespace-nowrap" style={{ color: FAINT }}>{new Date(d.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>
                  <span className="col-start-2 col-end-4 min-w-0 block text-[13.5px] leading-snug truncate mt-0.5" style={{ color: '#3c4043' }}>
                    <b className="font-medium" style={{ color: INK }}>Draft</b> · to {d.to_email || '—'}
                  </span>
                  {density !== 'compact' && (
                    <span className="col-start-2 col-end-4 min-w-0 block text-[12.5px] leading-snug truncate mt-[3px]" style={{ color: MUTED }}>{(d.body ?? '').slice(0, 80) || 'No message yet'}</span>
                  )}
                </button>
                <button type="button" onClick={e => discardDraft(d.id, e)} aria-label="Discard draft" title="Discard draft"
                  className="absolute right-2 top-2 w-8 h-8 inline-flex items-center justify-center rounded-[8px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] hover:text-[#c5221f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]" style={{ color: FAINT }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </>
        ) : (
          <>
            {loading && (iconOnly
              ? <div className="flex items-center justify-center py-12"><Loader2 size={14} className="animate-spin" style={{ color: MUTED }} /></div>
              : <SkeletonRows />)}

            {!loading && !iconOnly && visible.length === 0 && (
              search
                ? empty('No conversations match this search.', { label: 'Clear search', onClick: () => setSearch('') })
                : empty('No conversations yet.')
            )}

            {!loading && visible.length > 0 && visible.map(lead => (
              <div key={lead.id} role="listitem">
                <ThreadRow lead={lead} isActive={lead.id === selectedId} threadState={threadMap[lead.id]} onClick={() => onSelect(lead.id)} density={density} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
