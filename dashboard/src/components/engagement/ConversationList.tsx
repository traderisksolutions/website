'use client'

import { Fragment } from 'react'
import { Search, RefreshCw, X, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lead, ThreadState } from './types'
import { EMAIL_SOURCES, PERSONAL_DOMAINS } from './types'
import { EngagementThreadRow } from '@/components/engagement-agent/engagement-thread-row'
import { domainOf, companyLabel, needsReply as calcNeedsReply } from './helpers'

type EngagementTab = 'all' | 'prospects' | 'clients'

interface ConversationListProps {
  leads:          Lead[]
  visible:        Lead[]
  threadMap:      Record<string, ThreadState>
  selectedId:     string | null
  search:         string
  activeTab:      EngagementTab
  groupByCompany: boolean
  loading:        boolean
  refreshing:     boolean
  prospectsCount: number
  clientsCount:   number
  onSelect:       (id: string) => void
  onSearch:       (q: string) => void
  onTab:          (t: EngagementTab) => void
  onGroupToggle:  () => void
  onRefresh:      () => void
}

const TABS: { key: EngagementTab; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'prospects', label: 'Prospects' },
  { key: 'clients',   label: 'Clients'   },
]

export function ConversationList({
  leads, visible, threadMap, selectedId,
  search, activeTab, groupByCompany,
  loading, refreshing,
  prospectsCount, clientsCount,
  onSelect, onSearch, onTab, onGroupToggle, onRefresh,
}: ConversationListProps) {
  const needsReplyCount = Object.values(threadMap)
    .filter(t => calcNeedsReply(t.messages)).length

  const tabCount = (key: EngagementTab) => {
    if (key === 'all')       return leads.length
    if (key === 'prospects') return prospectsCount
    return clientsCount
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2.5 border-b border-[--border-subtle]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground tracking-tight">
              Conversations
            </span>
            {!loading && needsReplyCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[--warning-bg] text-[--warning]">
                {needsReplyCount} awaiting reply
              </span>
            )}
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 px-2 py-1 text-[10.5px] font-medium rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw size={10} strokeWidth={2} className={cn(refreshing && 'animate-spin')} />
            {refreshing ? 'Syncing…' : 'Refresh'}
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 h-8 px-3 rounded-lg bg-muted border border-transparent focus-within:border-border focus-within:bg-background transition-colors">
          <Search size={12} className="text-muted-foreground flex-shrink-0" strokeWidth={2} />
          <input
            type="text"
            placeholder="Search name, company, topic…"
            value={search}
            aria-label="Search conversations"
            onChange={e => onSearch(e.target.value)}
            className="flex-1 bg-transparent text-[11.5px] text-foreground placeholder:text-muted-foreground/60 border-none outline-none"
          />
          {search && (
            <button onClick={() => onSearch('')} className="text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0 border-b border-[--border-subtle]">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => onTab(tab.key)}
            className={cn(
              'flex-1 py-2 flex items-center justify-center gap-1.5',
              'text-[10.5px] font-medium transition-colors border-b-2',
              activeTab === tab.key
                ? 'text-primary border-primary font-semibold'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {tab.label}
            <span className={cn(
              'text-[9.5px] font-bold px-1.5 py-0.5 rounded-full tabular-nums',
              activeTab === tab.key
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
            )}>
              {tabCount(tab.key)}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-shrink-0 px-3 py-1.5 border-b border-[--border-subtle] bg-background/60">
        <span className="text-[10.5px] text-muted-foreground">
          {loading ? 'Loading…' : `${visible.length} conversation${visible.length !== 1 ? 's' : ''}${search ? ' matching' : ''}`}
        </span>
        <button
          onClick={onGroupToggle}
          className={cn(
            'flex items-center gap-1 text-[10.5px] px-2 py-1 rounded-md transition-colors',
            groupByCompany
              ? 'bg-primary/8 text-primary font-medium'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <Building2 size={10} strokeWidth={2} />
          Group
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
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
                onClick={() => onSearch('')}
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
