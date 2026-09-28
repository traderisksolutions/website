'use client'

/**
 * Shares the Engagement Agent's entire conversation-list feed (filter state + the actual
 * leads/threads data) between /engagement/page.tsx (owns fetching/realtime) and
 * EngagementRail.tsx (renders the list itself as a dedicated rail on that route — see
 * EngagementFolderNav) — the two are siblings under ConditionalShell, not parent/child, so this
 * is the same cross-component-state pattern ChatDockProvider already uses for the Nexus chat
 * dock.
 *
 * Originally just filter state (tab/search/group); expanded to carry the list data itself once
 * it became clear the rail becomes the thread list literally — one column, not a folder-nav
 * sitting beside a separate list column. Mounted app-wide (harmless no-op state on every other
 * page) rather than conditionally by pathname, so EngagementRail.tsx never has to handle "no
 * provider mounted".
 */
import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import type { Lead, ThreadState } from '@/components/engagement/types'
import type { NewEmailDraft } from '@/components/engagement/NewEmailComposeModal'

export type EngagementTab =
  | 'all' | 'needs_reply' | 'awaiting_client' | 'unlinked' | 'unassigned' | 'drafts'
  | 'renewals' | 'claims' | 'rfqs' | 'clients' | 'prospects'
export type EngagementNavCounts = Record<EngagementTab, number>

const EMPTY_COUNTS: EngagementNavCounts = { all: 0, needs_reply: 0, awaiting_client: 0, unlinked: 0, unassigned: 0, drafts: 0, renewals: 0, claims: 0, rfqs: 0, clients: 0, prospects: 0 }

/** localStorage key for the navigator's collapsed state (64px icon rail vs the full column). */
export const KEY_NAV_COLLAPSED = 'engagement_nav_collapsed'

interface EngagementNavContextValue {
  activeTab: EngagementTab
  setActiveTab: Dispatch<SetStateAction<EngagementTab>>
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  counts: EngagementNavCounts
  setCounts: Dispatch<SetStateAction<EngagementNavCounts>>
  refreshing: boolean
  setRefreshing: Dispatch<SetStateAction<boolean>>
  onRefresh: (() => void) | null
  setOnRefresh: Dispatch<SetStateAction<(() => void) | null>>

  // ── The list feed itself — pushed down by page.tsx, rendered by EngagementRail's EngagementFolderNav.
  leads: Lead[]
  setLeads: Dispatch<SetStateAction<Lead[]>>
  visible: Lead[]
  setVisible: Dispatch<SetStateAction<Lead[]>>
  threadMap: Record<string, ThreadState>
  setThreadMap: Dispatch<SetStateAction<Record<string, ThreadState>>>
  /** Mirrors page.tsx's real selectedId, for highlighting the active row — the SIDEBAR-rendered
   *  list can't own selection itself (thread-loading is page.tsx's effect), so row clicks go
   *  through the `onSelect` callback below instead of a context setter. */
  selectedId: string | null
  setSelectedId: Dispatch<SetStateAction<string | null>>
  loading: boolean
  setLoading: Dispatch<SetStateAction<boolean>>
  onSelect: ((id: string) => void) | null
  setOnSelect: Dispatch<SetStateAction<((id: string) => void) | null>>
  onOpenDraft: ((draft: NewEmailDraft) => void) | null
  setOnOpenDraft: Dispatch<SetStateAction<((draft: NewEmailDraft) => void) | null>>
  /** Manually link a thread to a company from the "Unlinked" tab's inline picker — registered by
   *  page.tsx (which owns the real `leads` state) so the row updates without a full refetch. */
  onLinkCompany: ((threadId: string, companyId: string, companyName: string) => void) | null
  setOnLinkCompany: Dispatch<SetStateAction<((threadId: string, companyId: string, companyName: string) => void) | null>>
  /** Navigator collapsed to the 64px icon rail (desktop only). Persisted under KEY_NAV_COLLAPSED;
   *  EngagementRail renders the icon rail and ConditionalShell narrows its margin to match. */
  navCollapsed: boolean
  setNavCollapsed: Dispatch<SetStateAction<boolean>>
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
  const [counts, setCounts] = useState<EngagementNavCounts>(EMPTY_COUNTS)
  const [refreshing, setRefreshing] = useState(false)
  const [onRefresh, setOnRefresh] = useState<(() => void) | null>(null)

  const [leads, setLeads] = useState<Lead[]>([])
  const [visible, setVisible] = useState<Lead[]>([])
  const [threadMap, setThreadMap] = useState<Record<string, ThreadState>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [onSelect, setOnSelect] = useState<((id: string) => void) | null>(null)
  const [onOpenDraft, setOnOpenDraft] = useState<((draft: NewEmailDraft) => void) | null>(null)
  const [onLinkCompany, setOnLinkCompany] = useState<((threadId: string, companyId: string, companyName: string) => void) | null>(null)

  // Collapsed state: render expanded on first paint, correct from localStorage in a client-only
  // effect (same SSR-safe pattern as useResizableDimension), then persist every change.
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [collapsedLoaded, setCollapsedLoaded] = useState(false)
  useEffect(() => {
    try { setNavCollapsed(localStorage.getItem(KEY_NAV_COLLAPSED) === '1') } catch { /* best effort */ }
    setCollapsedLoaded(true)
  }, [])
  useEffect(() => {
    if (!collapsedLoaded) return
    try { localStorage.setItem(KEY_NAV_COLLAPSED, navCollapsed ? '1' : '0') } catch { /* best effort */ }
  }, [navCollapsed, collapsedLoaded])

  return (
    <EngagementNavContext.Provider value={{
      activeTab, setActiveTab, search, setSearch,
      counts, setCounts, refreshing, setRefreshing, onRefresh, setOnRefresh,
      leads, setLeads, visible, setVisible, threadMap, setThreadMap,
      selectedId, setSelectedId, loading, setLoading, onSelect, setOnSelect, onOpenDraft, setOnOpenDraft,
      onLinkCompany, setOnLinkCompany,
      navCollapsed, setNavCollapsed,
    }}>
      {children}
    </EngagementNavContext.Provider>
  )
}
