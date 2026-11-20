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
import type { NewEmailDraft } from '@/components/engagement/NewEmailCompose'
import type { InboxView } from '@/lib/mail/inbox-list'
import type { DraftRow } from '@/components/engagement/ConversationList'
import { pageUser } from '@/lib/supabase/client'
import { seesAllMail } from '@/lib/mail/visibility'

/** What the Inbox page read on the server for the navigator: the saved drafts (taken once, then read
 *  from the API) and the staff names for the Mailbox pill (null when the list had no personal
 *  mailbox). Undefined until the page has mounted; the navigator waits for it rather than fetching. */
export type InboxSeed = { drafts: DraftRow[] | null; staffNames: Record<string, string> | null }

export type EngagementTab = InboxView | 'drafts'
export type EngagementNavCounts = Record<EngagementTab, number>

const EMPTY_COUNTS: EngagementNavCounts = { all: 0, needs_reply: 0, awaiting_client: 0, unlinked: 0, unassigned: 0, drafts: 0 }

/** localStorage key for the navigator's collapsed state (64px icon rail vs the full column). */
const KEY_NAV_COLLAPSED = 'engagement_nav_collapsed'

/** The result of a person's Link company: ok, or the error to show in red with Retry. */
export type LinkResult = { ok: true } | { ok: false; error: string }

interface EngagementNavContextValue {
  activeTab: EngagementTab
  setActiveTab: Dispatch<SetStateAction<EngagementTab>>
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  /** The mailbox pill: 'all', 'operations', or a personal address (src/lib/mail/visibility.ts). */
  mailbox: string
  setMailbox: Dispatch<SetStateAction<string>>
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
  /** The current view's true total on the server (every page, not the rows loaded). */
  total: number
  setTotal: Dispatch<SetStateAction<number>>
  /** More rows on the server: the list loads them on scroll or More. */
  hasMore: boolean
  setHasMore: Dispatch<SetStateAction<boolean>>
  loadingMore: boolean
  setLoadingMore: Dispatch<SetStateAction<boolean>>
  onMore: (() => void) | null
  setOnMore: Dispatch<SetStateAction<(() => void) | null>>
  /** The list failed to load: shown with Retry, never as an empty list. */
  loadError: string | null
  setLoadError: Dispatch<SetStateAction<string | null>>
  /** Personal mailboxes among every thread the viewer may see, for the Mailbox pill. */
  mailboxes: string[]
  setMailboxes: Dispatch<SetStateAction<string[]>>
  onSelect: ((id: string) => void) | null
  setOnSelect: Dispatch<SetStateAction<((id: string) => void) | null>>
  onOpenDraft: ((draft: NewEmailDraft) => void) | null
  setOnOpenDraft: Dispatch<SetStateAction<((draft: NewEmailDraft) => void) | null>>
  /** A person links a thread to a company (Link company, Change company) — registered by page.tsx
   *  (which owns the real `leads` state) so the row updates without a full refetch. */
  onLinkCompany: LinkFn | null
  setOnLinkCompany: Dispatch<SetStateAction<LinkFn | null>>
  /** Navigator collapsed to the 64px icon rail (desktop only). Persisted under KEY_NAV_COLLAPSED;
   *  EngagementRail renders the icon rail and ConditionalShell narrows its margin to match. */
  navCollapsed: boolean
  setNavCollapsed: Dispatch<SetStateAction<boolean>>
  seed: InboxSeed | undefined
  setSeed: Dispatch<SetStateAction<InboxSeed | undefined>>
}

type LinkFn = (threadId: string, companyId: string | null, companyName: string) => Promise<LinkResult>

const EngagementNavContext = createContext<EngagementNavContextValue | null>(null)

export function useEngagementNav(): EngagementNavContextValue {
  const ctx = useContext(EngagementNavContext)
  if (!ctx) throw new Error('useEngagementNav must be used within EngagementNavProvider')
  return ctx
}

export function EngagementNavProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<EngagementTab>('all')
  const [search, setSearch] = useState('')
  // Operations first; the developer account starts on every mailbox (Jarod, 20 Nov 2026).
  const [mailbox, setMailbox] = useState(() => (seesAllMail(pageUser()?.email) ? 'all' : 'operations'))
  const [counts, setCounts] = useState<EngagementNavCounts>(EMPTY_COUNTS)
  const [refreshing, setRefreshing] = useState(false)
  const [onRefresh, setOnRefresh] = useState<(() => void) | null>(null)

  const [leads, setLeads] = useState<Lead[]>([])
  const [visible, setVisible] = useState<Lead[]>([])
  const [threadMap, setThreadMap] = useState<Record<string, ThreadState>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [onMore, setOnMore] = useState<(() => void) | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mailboxes, setMailboxes] = useState<string[]>([])
  const [onSelect, setOnSelect] = useState<((id: string) => void) | null>(null)
  const [onOpenDraft, setOnOpenDraft] = useState<((draft: NewEmailDraft) => void) | null>(null)
  const [onLinkCompany, setOnLinkCompany] = useState<LinkFn | null>(null)
  const [seed, setSeed] = useState<InboxSeed | undefined>(undefined)

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
      activeTab, setActiveTab, search, setSearch, mailbox, setMailbox,
      counts, setCounts, refreshing, setRefreshing, onRefresh, setOnRefresh,
      leads, setLeads, visible, setVisible, threadMap, setThreadMap,
      selectedId, setSelectedId, loading, setLoading, total, setTotal, hasMore, setHasMore, loadingMore, setLoadingMore,
      onMore, setOnMore, loadError, setLoadError, mailboxes, setMailboxes, onSelect, setOnSelect, onOpenDraft, setOnOpenDraft,
      onLinkCompany, setOnLinkCompany,
      navCollapsed, setNavCollapsed, seed, setSeed,
    }}>
      {children}
    </EngagementNavContext.Provider>
  )
}
