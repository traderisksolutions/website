'use client'

import { Search, X, RefreshCw, Building2, Inbox, Users, UserCheck, FileEdit } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEngagementNav } from '@/providers/engagement-nav-provider'
import type { EngagementTab } from '@/providers/engagement-nav-provider'
import { ConversationList } from '@/components/engagement/ConversationList'

/**
 * Renders in place of the normal nav sections when Sidebar.tsx is on /engagement — the sidebar
 * itself becomes the conversation list (one column), not a filter bar sitting beside a separate
 * list column. Filter chrome (tabs/search/group) stays fixed; the list below it scrolls on its
 * own, fed by the same context page.tsx mirrors its real leads/threadMap/selectedId into.
 */
const TABS: { key: EngagementTab; label: string; icon: React.ElementType }[] = [
  { key: 'all',       label: 'All',       icon: Inbox },
  { key: 'prospects', label: 'Prospects', icon: Users },
  { key: 'clients',   label: 'Clients',   icon: UserCheck },
  { key: 'drafts',    label: 'Drafts',    icon: FileEdit },
]

export function EngagementFolderNav() {
  const {
    activeTab, setActiveTab, search, setSearch, groupByCompany, setGroupByCompany, counts, refreshing, onRefresh,
    leads, visible, threadMap, selectedId, loading, onSelect, onOpenDraft,
  } = useEngagementNav()

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex flex-col gap-3 px-2 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Engagement</span>
        </div>

        <div className="flex items-center gap-2 h-8 px-2.5 rounded-lg bg-muted border border-transparent focus-within:border-border focus-within:bg-background transition-colors">
          <Search size={12} className="text-muted-foreground flex-shrink-0" strokeWidth={2} />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            aria-label="Search conversations"
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-[11.5px] text-foreground placeholder:text-muted-foreground/60 border-none outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground flex-shrink-0"><X size={11} /></button>
          )}
        </div>

        <div className="flex flex-col gap-0.5">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 h-8 px-2.5 rounded-md text-left transition-colors',
                'text-[12px]',
                activeTab === tab.key
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <tab.icon size={13} strokeWidth={activeTab === tab.key ? 2.2 : 1.8} className="flex-shrink-0" />
              <span className="flex-1 truncate">{tab.label}</span>
              <span className={cn(
                'text-[9.5px] font-bold px-1.5 py-0.5 rounded-full tabular-nums flex-shrink-0',
                activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}>
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setGroupByCompany(v => !v)}
            className={cn(
              'flex items-center gap-2 h-7 px-2.5 rounded-md text-[11.5px] transition-colors',
              groupByCompany
                ? 'bg-primary/8 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Building2 size={12} strokeWidth={groupByCompany ? 2.2 : 1.8} className="flex-shrink-0" />
            Group
          </button>
          <button
            onClick={() => onRefresh?.()}
            disabled={!onRefresh || refreshing}
            title="Refresh"
            className="p-1.5 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} strokeWidth={2} className={cn(refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* The actual conversation rows — this IS the "one column" the sidebar becomes. */}
      <div className="flex-1 min-h-0 border-t border-[--border-subtle]">
        <ConversationList
          leads={leads}
          visible={visible}
          threadMap={threadMap}
          selectedId={selectedId}
          activeTab={activeTab}
          search={search}
          groupByCompany={groupByCompany}
          loading={loading}
          refreshing={refreshing}
          onSelect={id => onSelect?.(id)}
          onOpenDraft={draft => onOpenDraft?.(draft)}
          onRefresh={() => onRefresh?.()}
          hideHeader
        />
      </div>
    </div>
  )
}
