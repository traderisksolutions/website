'use client'

import { Fragment, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { RefreshCw, X, FileEdit } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from './types'
import { PERSONAL_DOMAINS } from './types'
import { EngagementThreadRow } from '@/components/engagement-agent/engagement-thread-row'
import { domainOf, companyLabel, needsReply as calcNeedsReply } from './helpers'
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
  groupByCompany: boolean
  loading:        boolean
  refreshing:     boolean
  onSelect:       (id: string) => void
  onRefresh:      () => void
  onOpenDraft:    (draft: NewEmailDraft) => void
  /** Sidebar's EngagementFolderNav already has its own title/refresh chrome above this list —
   *  skip this component's own header so they don't stack. The mobile fallback (EaListPanel)
   *  still wants it, so this defaults to shown. */
  hideHeader?:    boolean
}

/** Tabs/search/group-toggle render in Sidebar.tsx (EngagementFolderNav) on desktop — this
 *  component is the actual scrollable rows for whichever set the folder-nav's filters resolve to
 *  (`visible`, computed in page.tsx), plus (unless hideHeader) a title/"awaiting reply"/refresh
 *  header for the mobile fallback layout, which renders this standalone. It still owns loading
 *  the drafts list (that data isn't needed anywhere else) and pushes its count into the shared
 *  nav context so the Drafts tab shows a live count. */
export function ConversationList({
  leads, visible, threadMap, selectedId,
  activeTab, search, groupByCompany,
  loading, refreshing,
  onSelect, onRefresh, onOpenDraft, hideHeader,
}: ConversationListProps) {
  const { setCounts, setSearch } = useEngagementNav()
  const needsReplyCount = Object.values(threadMap)
    .filter(t => calcNeedsReply(t.messages)).length

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {!hideHeader && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 h-11 border-b border-[--border-subtle]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-foreground tracking-tight truncate">
              {activeTab === 'all' ? 'All conversations' : activeTab === 'prospects' ? 'Prospects' : activeTab === 'clients' ? 'Clients' : 'Drafts'}
            </span>
            {!loading && needsReplyCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[--warning-bg] text-[--warning] flex-shrink-0">
                {needsReplyCount} awaiting reply
              </span>
            )}
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 px-2 py-1 text-[10.5px] font-medium rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw size={10} strokeWidth={2} className={cn(refreshing && 'animate-spin')} />
            {refreshing ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'drafts' ? (
          <>
            {draftsLoading && (
              <div className="flex items-center justify-center py-12">
                <span className="text-[12px] text-muted-foreground">Loading drafts…</span>
              </div>
            )}
            {!draftsLoading && drafts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 gap-2">
                <p className="text-[12px] text-muted-foreground text-center">No saved drafts.</p>
              </div>
            )}
            {!draftsLoading && drafts.map(d => (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenDraft({
                  toEmail: d.to_email ?? '', cc: d.cc ?? '', subject: d.subject ?? '', body: d.body ?? '',
                  attachment: d.attachments?.[0], draftId: d.id,
                })}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpenDraft({ toEmail: d.to_email ?? '', cc: d.cc ?? '', subject: d.subject ?? '', body: d.body ?? '', attachment: d.attachments?.[0], draftId: d.id }) }}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 border-b border-[--border-subtle] text-left hover:bg-accent/40 transition-colors cursor-pointer"
              >
                <FileEdit size={13} className="text-muted-foreground/60 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-foreground truncate">{d.subject || '(no subject)'}</span>
                    <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">{new Date(d.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">To: {d.to_email || '—'}</p>
                  <p className="text-[11px] text-muted-foreground/70 truncate">{(d.body ?? '').slice(0, 80) || 'No message yet'}</p>
                </div>
                <button onClick={e => discardDraft(d.id, e)} className="text-muted-foreground/40 hover:text-rose-500 flex-shrink-0"><X size={13} /></button>
              </div>
            ))}
          </>
        ) : (
          <>
            {loading && (
              <div className="flex items-center justify-center py-12">
                <span className="text-[12px] text-muted-foreground">Loading conversations…</span>
              </div>
            )}

            {!loading && visible.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 gap-2">
                <p className="text-[12px] text-muted-foreground text-center">
                  {search ? 'No conversations match your search.' : 'No conversations yet.'}
                </p>
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Clear search
                  </button>
                )}
              </div>
            )}

            {!loading && visible.length > 0 && (
              groupByCompany
                ? <GroupedList visible={visible} threadMap={threadMap} selectedId={selectedId} onSelect={onSelect} />
                : visible.map(lead => (
                    <EngagementThreadRow
                      key={lead.id}
                      lead={lead}
                      isActive={lead.id === selectedId}
                      threadState={threadMap[lead.id]}
                      onClick={() => onSelect(lead.id)}
                    />
                  ))
            )}
          </>
        )}
      </div>
    </div>
  )
}

function GroupedList({ visible, threadMap, selectedId, onSelect }: {
  visible:   Lead[]
  threadMap: Record<string, ThreadState>
  selectedId: string | null
  onSelect:  (id: string) => void
}) {
  const groups = new Map<string, Lead[]>()
  for (const lead of visible) {
    const d   = domainOf(lead.email)
    const key = PERSONAL_DOMAINS.has(d) ? '__personal__' : d
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(lead)
  }

  return (
    <>
      {Array.from(groups.entries()).map(([key, group]) => (
        <Fragment key={key}>
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-[--border-subtle]">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
              {companyLabel(key)}
            </span>
            {group.length > 1 && (
              <span className="text-[9.5px] text-muted-foreground/60 tabular-nums">
                {group.length}
              </span>
            )}
          </div>
          {group.map(lead => (
            <EngagementThreadRow
              key={lead.id}
              lead={lead}
              isActive={lead.id === selectedId}
              threadState={threadMap[lead.id]}
              onClick={() => onSelect(lead.id)}
            />
          ))}
        </Fragment>
      ))}
    </>
  )
}
