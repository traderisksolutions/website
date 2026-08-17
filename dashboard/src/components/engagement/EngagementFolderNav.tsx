'use client'

import { Search, X, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEngagementNav } from '@/providers/engagement-nav-provider'
import type { EngagementTab } from '@/providers/engagement-nav-provider'
import { ConversationList } from '@/components/engagement/ConversationList'

/**
 * Renders inside EngagementRail.tsx on /engagement — the rail itself becomes the conversation
 * list (one column), not a filter bar sitting beside a separate list column. Filter chrome
 * (tabs/search/group) stays fixed; the list below it scrolls on its own, fed by the same context
 * page.tsx mirrors its real leads/threadMap/selectedId into.
 */
const TABS: { key: EngagementTab; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'prospects', label: 'Prospects' },
  { key: 'clients',   label: 'Clients'   },
  { key: 'drafts',    label: 'Drafts'    },
]

export function EngagementFolderNav() {
  const {
    activeTab, setActiveTab, search, setSearch, counts, refreshing, onRefresh,
    leads, visible, threadMap, selectedId, loading, onSelect, onOpenDraft,
  } = useEngagementNav()

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex flex-col gap-3 px-2 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Engagement</span>
          <button
            onClick={() => onRefresh?.()}
            disabled={!onRefresh || refreshing}
            title="Refresh"
            className="p-1.5 -m-1.5 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} strokeWidth={2} className={cn(refreshing && 'animate-spin')} />
          </button>
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

        <div className="flex items-center rounded-lg bg-muted p-0.5">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex-1 min-w-0 flex items-center justify-center gap-1 h-7 px-1 rounded-md transition-colors',
                'text-[10.5px] font-medium',
                activeTab === tab.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="truncate">{tab.label}</span>
              <span className={cn(
                'text-[9px] font-bold tabular-nums flex-shrink-0',
                activeTab === tab.key ? 'text-primary' : 'text-muted-foreground/70',
              )}>
                {counts[tab.key]}
              </span>
            </button>
          ))}
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
