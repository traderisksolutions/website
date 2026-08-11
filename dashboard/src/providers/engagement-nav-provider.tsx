'use client'

/**
 * Shares the Engagement Agent's list-filtering state (tab/search/group-by-company + counts)
 * between /engagement/page.tsx (owns the actual lead/thread data) and Sidebar.tsx (renders the
 * filter controls when on that route — see EngagementFolderNav) — the two are siblings under
 * ConditionalShell, not parent/child, so this is the same cross-component-state pattern
 * ChatDockProvider already uses for the Nexus chat dock.
 *
 * Mounted app-wide (harmless no-op state on every other page) rather than conditionally by
 * pathname, so Sidebar.tsx (rendered on every page) never has to handle "no provider mounted".
 */
import { createContext, useContext, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react'

export type EngagementTab = 'all' | 'prospects' | 'clients' | 'drafts'
export type EngagementNavCounts = { all: number; prospects: number; clients: number; drafts: number }

const EMPTY_COUNTS: EngagementNavCounts = { all: 0, prospects: 0, clients: 0, drafts: 0 }

interface EngagementNavContextValue {
  activeTab: EngagementTab
  setActiveTab: Dispatch<SetStateAction<EngagementTab>>
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  groupByCompany: boolean
  setGroupByCompany: Dispatch<SetStateAction<boolean>>
  counts: EngagementNavCounts
  setCounts: Dispatch<SetStateAction<EngagementNavCounts>>
  refreshing: boolean
  setRefreshing: Dispatch<SetStateAction<boolean>>
  onRefresh: (() => void) | null
  setOnRefresh: Dispatch<SetStateAction<(() => void) | null>>
}

const EngagementNavContext = createContext<EngagementNavContextValue | null>(null)

export function useEngagementNav(): EngagementNavContextValue {
  const ctx = useContext(EngagementNavContext)
  if (!ctx) throw new Error('useEngagementNav must be used within EngagementNavProvider')
  return ctx
}

export function EngagementNavProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<EngagementTab>('all')
  const [search, setSearch] = useState('')
  const [groupByCompany, setGroupByCompany] = useState(false)
  const [counts, setCounts] = useState<EngagementNavCounts>(EMPTY_COUNTS)
  const [refreshing, setRefreshing] = useState(false)
  const [onRefresh, setOnRefresh] = useState<(() => void) | null>(null)

  return (
    <EngagementNavContext.Provider value={{
      activeTab, setActiveTab, search, setSearch, groupByCompany, setGroupByCompany,
      counts, setCounts, refreshing, setRefreshing, onRefresh, setOnRefresh,
    }}>
      {children}
    </EngagementNavContext.Provider>
  )
}
