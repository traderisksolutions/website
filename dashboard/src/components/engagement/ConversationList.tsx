'use client'

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { RefreshCw, X, FileEdit, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from './types'
import { ThreadRow, type Density } from './ThreadRow'
import { leadNeedsReply } from './helpers'
import type { NewEmailDraft } from './NewEmailCompose'
import { useEngagementNav } from '@/providers/engagement-nav-provider'
import { useConfirm } from '@/components/ui/confirm'
import { Btn } from '@/components/crm/primitives'
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
  /** More rows on the server: a sentinel at the foot loads them on scroll; More does the same. */
  hasMore?:       boolean
  loadingMore?:   boolean
  onMore?:        () => void
  /** The list failed to load: the error with Retry, never "no conversations". */
  loadError?:     string | null
}

const PAD: Record<Density, string> = { comfortable: 'py-4', standard: 'py-3', compact: 'py-2' }

function draftOf(d: DraftRow): NewEmailDraft {
  return { toEmail: d.to_email ?? '', cc: d.cc ?? '', subject: d.subject ?? '', body: d.body ?? '', attachment: d.attachments?.[0], draftId: d.id }
}

function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <div aria-hidden className="animate-pulse">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="grid grid-cols-[14px_1fr_auto] gap-x-2 pl-3.5 pr-5 py-3 border-b border-trs-line">
          <span />
          <span className="h-3.5 w-[45%] rounded bg-trs-field" />
          <span className="h-3 w-[38px] rounded bg-trs-field" />
          <span className="col-start-2 col-end-4 mt-1.5 h-3 w-[80%] rounded bg-trs-field" />
          <span className="col-start-2 col-end-4 mt-1.5 h-3 w-[30%] rounded bg-trs-field" />
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
  hasMore = false, loadingMore = false, onMore, loadError = null,
}: ConversationListProps) {
  const { setCounts, setSearch, seed, setSeed } = useEngagementNav()
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
  // The page brings the drafts with its first response; they are taken once, then read from the API.
  const seedReady = seed !== undefined
  useEffect(() => {
    if (!seedReady) return
    if (seed?.drafts) { setDrafts(seed.drafts); setSeed(s => s ? { ...s, drafts: null } : s) }
    else loadDrafts()
  }, [seedReady]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'drafts') loadDrafts() }, [activeTab])
  useEffect(() => { setCounts(c => ({ ...c, drafts: drafts.length })) }, [drafts.length, setCounts])

  // The foot of the list in view loads the next page.
  const sentinel = useRef<HTMLDivElement>(null)
  const more = useRef(onMore)
  more.current = onMore
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore || loadingMore || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) more.current?.() }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadingMore, visible.length])

  const confirmBox = useConfirm()
  async function discardDraft(id: string, e: MouseEvent) {
    e.stopPropagation()
    if (!(await confirmBox({ title: 'Discard this draft?', body: 'It comes off Drafts. Nothing has been sent.', action: 'Discard', danger: true }))) return
    await fetch(`/api/engagement/drafts/${id}`, { method: 'DELETE' })
    loadDrafts()
  }

  const empty = (text: string, action?: { label: string; onClick: () => void }) => (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="m-0 text-body text-trs-muted">{text}</p>
      {action && (
        <Btn level="tertiary" size="xs" onClick={action.onClick} className="h-9 border-0 text-trs-ink hover:bg-trs-field">
          {action.label}
        </Btn>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      {!hideHeader && !iconOnly && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 h-11 border-b border-trs-line">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-body font-medium truncate text-trs-ink">
              {activeTab === 'drafts' ? 'Drafts' : 'Inbox'}
            </span>
            {!loading && needsReplyCount > 0 && (
              <span className="text-small tabular-nums flex-shrink-0 text-trs-subtle">{needsReplyCount} need a reply</span>
            )}
          </div>
          <Btn level="tertiary" size="xs" onClick={onRefresh} disabled={refreshing} aria-label="Sync mail" title={refreshing ? 'Syncing…' : 'Sync mail'}
            className="w-9 h-9 px-0 border-0 flex-shrink-0 hover:bg-trs-field">
            <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
          </Btn>
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
                  <span className="w-8 h-8 rounded-full flex items-center justify-center bg-trs-field text-trs-muted"><FileEdit size={13} /></span>
                </button>
              </div>
            ) : (
              <div key={d.id} role="listitem" className="relative">
                <button type="button" onClick={() => onOpenDraft(draftOf(d))} aria-label={`Draft, ${d.subject || 'no subject'}, to ${d.to_email || 'nobody yet'}`}
                  className={cn('w-full text-left grid grid-cols-[14px_1fr_auto] gap-x-2 pl-3.5 pr-12 bg-white border-0 border-b border-solid border-trs-line text-trs-ink cursor-pointer transition-colors hover:bg-trs-tint',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-trs-ink', PAD[density])}>
                  <span className="mt-[7px] w-2 h-2 rounded-full" aria-hidden />
                  <span className="min-w-0 text-body font-medium leading-snug truncate">{d.subject || '(no subject)'}</span>
                  <span className="text-small tabular-nums pt-0.5 whitespace-nowrap text-trs-subtle">{new Date(d.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>
                  <span className="col-start-2 col-end-4 min-w-0 block text-body leading-snug truncate mt-0.5 text-trs-ink-2">
                    <b className="font-medium text-trs-ink">Draft</b> · to {d.to_email || '—'}
                  </span>
                  {density !== 'compact' && (
                    <span className="col-start-2 col-end-4 min-w-0 block text-small leading-snug truncate mt-[3px] text-trs-muted">{(d.body ?? '').slice(0, 80) || 'No message yet'}</span>
                  )}
                </button>
                <Btn level="tertiary" size="xs" onClick={e => discardDraft(d.id, e)} aria-label="Discard draft" title="Discard draft"
                  className="absolute right-2 top-2 w-8 px-0 border-0 text-trs-subtle hover:bg-trs-field hover:text-trs-neg">
                  <X size={13} />
                </Btn>
              </div>
            ))}
          </>
        ) : (
          <>
            {loading && !loadError && (iconOnly
              ? <div className="flex items-center justify-center py-12"><Loader2 size={14} className="animate-spin text-trs-muted" /></div>
              : <SkeletonRows />)}

            {loadError && !iconOnly && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center" role="alert">
                <p className="m-0 text-body text-trs-neg">{loadError}</p>
                <Btn size="xs" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Retrying…' : 'Retry'}</Btn>
              </div>
            )}

            {!loading && !loadError && !iconOnly && visible.length === 0 && (
              search
                ? empty('No conversations match this search.', { label: 'Clear search', onClick: () => setSearch('') })
                : empty('No conversations.')
            )}

            {!loading && visible.length > 0 && visible.map(lead => (
              <div key={lead.id} role="listitem">
                <ThreadRow lead={lead} isActive={lead.id === selectedId} threadState={threadMap[lead.id]} onClick={() => onSelect(lead.id)} density={density} />
              </div>
            ))}

            {!loading && hasMore && !iconOnly && (
              <div ref={sentinel} className="flex justify-center py-3">
                <Btn level="tertiary" size="xs" onClick={() => onMore?.()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'More'}</Btn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
