'use client'

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuditLog } from '@/hooks/useAuditLog'
import { createClient } from '@/lib/supabase/client'
import type { Lead, ThreadState } from '@/components/engagement/types'
import { EMAIL_SOURCES, ENGAGED_STATUSES } from '@/components/engagement/types'
import { matchesSearch, leadNeedsReply } from '@/components/engagement/helpers'
import { ThreadListPane, SEARCH_INPUT_ID } from '@/components/engagement/ThreadListPane'
import { ThreadView } from '@/components/engagement/ThreadView'
import { NewEmailComposeModal, type NewEmailDraft } from '@/components/engagement/NewEmailComposeModal'
import { EngagementShell } from '@/components/engagement/shell'
import { EaListPanel, EaWorkspaceArea, EaWorkspaceEmptyState } from '@/components/engagement/EaLayout'
import { useEngagementNav, type EngagementTab, type EngagementNavCounts } from '@/providers/engagement-nav-provider'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchLeads(): Promise<Lead[]> {
  const [leadsRes, convRes] = await Promise.all([
    fetch('/api/leads',                         { cache: 'no-store' }),
    fetch('/api/engagement/conversations',       { cache: 'no-store' }),
  ])

  const raw: Lead[]  = leadsRes.ok ? await leadsRes.json() : []
  const engagedLeads = (Array.isArray(raw) ? raw : [])
    .filter(l => EMAIL_SOURCES.has(l.source) && ENGAGED_STATUSES.has(l.status))

  const convRaw: Lead[] = convRes.ok ? await convRes.json() : []
  const conversations   = Array.isArray(convRaw) ? convRaw : []

  // Dedup: if a lead already references a thread directly don't double-show it
  const leadThreadIds  = new Set(engagedLeads.flatMap(l => l.thread_id ? [l.thread_id] : []))
  const newConversations = conversations
    .filter(c => !leadThreadIds.has(c.id))
    .map(c => ({ ...c, source: 'thread' as const }))

  return [...engagedLeads, ...newConversations]
}

async function patchStatus(id: string, status: string) {
  await fetch('/api/leads', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id, status }),
  })
}

async function fetchThread(
  threadId: string | null,
  email:    string | null,
): Promise<{ thread: ThreadState['thread']; messages: ThreadState['messages'] }> {
  const param = threadId
    ? `thread_id=${encodeURIComponent(threadId)}`
    : email ? `email=${encodeURIComponent(email)}` : null
  if (!param) return { thread: null, messages: [] }
  const res = await fetch(`/api/engagement/thread?${param}`, { cache: 'no-store' })
  if (!res.ok) return { thread: null, messages: [] }
  const data = await res.json()
  return {
    thread:   data.thread   ?? null,
    messages: Array.isArray(data.messages) ? data.messages : [],
  }
}

// ── Page inner ────────────────────────────────────────────────────────────────

function EngagementPageInner() {
  const searchParams = useSearchParams()
  const initLeadId   = searchParams.get('lead')

  // Tab/search/group-by-company filter state AND the list feed itself live in
  // EngagementNavProvider now — EngagementRail.tsx renders the actual conversation list (see
  // EngagementFolderNav) as a dedicated left column on this route (one column, not a folder-nav
  // beside a separate list panel); this page owns fetching/realtime and mirrors its state up for
  // EngagementRail to render, same cross-component pattern as ChatDockProvider.
  const {
    activeTab, search, setCounts, setRefreshing: setNavRefreshing, setOnRefresh,
    setLeads: setNavLeads, setVisible: setNavVisible, setThreadMap: setNavThreadMap,
    setSelectedId: setNavSelectedId, setLoading: setNavLoading, setOnSelect, setOnOpenDraft: setNavOnOpenDraft,
    setOnLinkCompany, navCollapsed, setNavCollapsed,
  } = useEngagementNav()

  const [leads,           setLeads]           = useState<Lead[]>([])
  const [loading,         setLoading]         = useState(true)
  const [refreshing,      setRefreshingState] = useState(false)
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [threadMap,       setThreadMap]       = useState<Record<string, ThreadState>>({})
  const [mobilePanelView, setMobilePanelView] = useState<'list' | 'thread'>('list')
  const [newCompose,      setNewCompose]      = useState<NewEmailDraft | null>(null)

  const setRefreshing = useCallback((v: boolean) => { setRefreshingState(v); setNavRefreshing(v) }, [setNavRefreshing])

  // Mirror this page's real state into the shared context so EngagementRail's EngagementFolderNav
  // can render the actual list — page.tsx stays the single source of truth (all the fetch/realtime
  // effects below still operate on the local state), this is purely a one-way sync.
  useEffect(() => { setNavLeads(leads) }, [leads, setNavLeads])
  useEffect(() => { setNavThreadMap(threadMap) }, [threadMap, setNavThreadMap])
  useEffect(() => { setNavSelectedId(selectedId) }, [selectedId, setNavSelectedId])
  useEffect(() => { setNavLoading(loading) }, [loading, setNavLoading])

  // A Nexus step targeting a recipient with no thread hands over a new-email
  // draft here (compose-only) — open the composer so it lands in Engagement.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.sessionStorage.getItem('trs_pending_new')
    if (!raw) return
    window.sessionStorage.removeItem('trs_pending_new')
    try { setNewCompose(JSON.parse(raw) as NewEmailDraft) } catch { /* ignore */ }
  }, [])

  const log = useAuditLog()

  // Which section a conversation belongs to. Prospects/clients come from lead intake; the rest
  // read the thread itself (category, company link, direction of the newest message).
  const isProspect = (l: Lead) =>
    (EMAIL_SOURCES.has(l.source) || !!l.campaign_context) && l.segment !== 'existing_client'
  const isClient = (l: Lead) =>
    (!EMAIL_SOURCES.has(l.source) && !l.campaign_context) || l.segment === 'existing_client'
  const inSection = useCallback((l: Lead, tab: EngagementTab): boolean => {
    switch (tab) {
      case 'all':             return true
      case 'needs_reply':     return leadNeedsReply(l, threadMap[l.id])
      case 'awaiting_client': return !leadNeedsReply(l, threadMap[l.id]) && (l.lastDirection === 'outbound' || (threadMap[l.id]?.messages.at(-1)?.direction === 'outbound'))
      case 'unlinked':        return !l.companyId
      case 'unassigned':      return !!l.companyId && !l.companyOwner
      case 'renewals':        return l.category === 'renewal'
      case 'claims':          return l.category === 'claim'
      case 'clients':         return isClient(l)
      case 'prospects':       return isProspect(l)
      case 'drafts':          return false
    }
  }, [threadMap]) // eslint-disable-line react-hooks/exhaustive-deps

  // Push every section's count up to the rail — `drafts` is merged in separately by
  // ConversationList (which owns loading the drafts list).
  useEffect(() => {
    const tabs: EngagementTab[] = ['all', 'needs_reply', 'awaiting_client', 'unlinked', 'unassigned', 'renewals', 'claims', 'clients', 'prospects']
    setCounts(c => ({ ...c, ...Object.fromEntries(tabs.map(t => [t, leads.filter(l => inSection(l, t)).length])) as Partial<EngagementNavCounts> }))
  }, [leads, inSection, setCounts])

  // Sorted + filtered list
  const visible = useMemo(() => {
    const filtered = leads.filter(l => inSection(l, activeTab)).filter(l => matchesSearch(l, search))
    return [...filtered].sort((a, b) => {
      const ta = threadMap[a.id]?.messages.at(-1)?.sent_at ?? a.created_at
      const tb = threadMap[b.id]?.messages.at(-1)?.sent_at ?? b.created_at
      return new Date(tb).getTime() - new Date(ta).getTime()
    })
  }, [leads, activeTab, search, threadMap, inSection])
  useEffect(() => { setNavVisible(visible) }, [visible, setNavVisible])

  // Load leads
  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const data = await fetchLeads()
      setLeads(data)
      // Default selection = the most recently active conversation (matches the top of
      // the sorted list), NOT data[0] which is in raw API order. `created_at` carries
      // last_message_at for conversation rows, so this is the genuine latest.
      const latestId = [...data]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.id ?? null
      setSelectedId(prev => {
        if (!prev && initLeadId && data.some(l => l.id === initLeadId)) return initLeadId
        return prev ?? latestId
      })
    } finally { setLoading(false); setRefreshing(false) }
  }, [initLeadId])

  // Keep a ref to refreshSelectedThread so the interval can call the latest
  // version without a stale closure (it captures selectedId + leads).
  const refreshSelectedThreadRef = useRef<() => void>(() => {})

  // Initial load only — no periodic auto-refresh. New emails appear on manual
  // Refresh (or the background Gmail sync below keeping the DB current).
  useEffect(() => {
    load()
  }, [load])

  // Background Gmail sync — fires immediately on mount (catches any emails missed while page was
  // closed) then repeats every 90 s as a fallback when Pub/Sub is delayed or watch is stale.
  useEffect(() => {
    const sync = () => fetch('/api/email/ingest-trigger', { method: 'POST' }).catch(() => {})
    sync()
    const t = setInterval(sync, 90_000)
    return () => clearInterval(t)
  }, [])


  // Load thread on selection
  useEffect(() => {
    if (!selectedId) return
    const lead = leads.find(l => l.id === selectedId)
    if (!lead?.thread_id && !lead?.email) return

    const cached = threadMap[selectedId]
    if (cached && !cached.loading && lead.thread_id && cached.thread?.id !== lead.thread_id) {
      setThreadMap(prev => { const n = { ...prev }; delete n[selectedId]; return n })
      return
    }
    if (cached) return

    setThreadMap(prev => ({
      ...prev,
      [selectedId]: { loading: true, thread: null, messages: [], error: null },
    }))
    fetchThread(lead.thread_id ?? null, lead.email)
      .then(({ thread, messages }) => {
        setThreadMap(prev => ({ ...prev, [selectedId]: { loading: false, thread, messages, error: null } }))
      })
      .catch(err => {
        setThreadMap(prev => ({
          ...prev,
          [selectedId]: { loading: false, thread: null, messages: [], error: err?.message ?? 'Error loading thread' },
        }))
      })
  }, [selectedId, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  // Smart Realtime — when a new message lands on the OPEN thread, APPEND it in place
  // from the event payload (no refetch, no loading spinner → no blink). New mail on
  // other threads / brand-new conversations still arrives via the 90s background sync.
  useEffect(() => {
    if (!selectedId) return
    const threadId = leads.find(l => l.id === selectedId)?.thread_id
    if (!threadId) return

    // Was a realtime INSERT subscription. Cloud SQL cannot push, so the open thread is
    // re-fetched on an interval; fetchThread already merges without duplicating messages.
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      const lead = leads.find(l => l.id === selectedId)
      if (lead) void fetchThread(lead.thread_id ?? null, lead.email)
    }
    const poll = window.setInterval(tick, 20000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', tick) }
  }, [selectedId, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleStatus(id: string, status: string) {
    const lead = leads.find(l => l.id === id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    patchStatus(id, status)
    log({
      action:        'status.changed',
      resource_type: 'lead',
      resource_id:   id,
      lead_email:    lead?.email ?? undefined,
      old_value:     { status: lead?.status ?? null },
      new_value:     { status },
      metadata:      { contact: lead?.email },
    })
  }

  async function handleTransfer(id: string, note: string) {
    const lead = leads.find(l => l.id === id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, segment: 'existing_client', segment_note: note || null } : l))
    await fetch('/api/leads', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, segment: 'existing_client', segment_note: note || null }),
    })
    log({
      action:        'lead.transferred',
      resource_type: 'lead',
      resource_id:   id,
      lead_email:    lead?.email ?? undefined,
      new_value:     { segment: 'existing_client', segment_note: note },
    })
  }

  function handleDelete(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
    setThreadMap(prev => { const next = { ...prev }; delete next[id]; return next })
    setSelectedId(null)
  }

  function refreshSelectedThread() {
    if (!selectedId) return
    const lead = leads.find(l => l.id === selectedId)
    if (!lead?.thread_id && !lead?.email) return
    setThreadMap(prev => ({
      ...prev,
      [selectedId]: {
        ...(prev[selectedId] ?? { thread: null, error: null }),
        loading: true,
        messages: prev[selectedId]?.messages ?? [],
      },
    }))
    fetchThread(lead.thread_id ?? null, lead.email)
      .then(({ thread, messages }) => {
        setThreadMap(prev => ({ ...prev, [selectedId]: { loading: false, thread, messages, error: null } }))
      })
      .catch(() => {
        setThreadMap(prev => ({
          ...prev,
          [selectedId]: {
            ...(prev[selectedId] ?? { thread: null, messages: [] }),
            loading: false,
            error: null,
          },
        }))
      })
  }
  // Update ref on every render so the interval always sees fresh selectedId + leads
  refreshSelectedThreadRef.current = refreshSelectedThread

  // Show spinner immediately, wait for Gmail sync to finish, THEN reload so newly ingested
  // emails are already in Supabase when the list re-reads. Also registered into
  // EngagementNavProvider so the Refresh button in EngagementRail's folder-nav can trigger it.
  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    fetch('/api/email/ingest-trigger', { method: 'POST' })
      .catch(() => {})
      .finally(() => { load(); refreshSelectedThreadRef.current() })
  }, [load, setRefreshing])
  useEffect(() => { setOnRefresh(() => handleRefresh) }, [handleRefresh, setOnRefresh])

  const handleSelect = useCallback((id: string) => { setSelectedId(id); setMobilePanelView('thread') }, [])
  useEffect(() => { setOnSelect(() => handleSelect) }, [handleSelect, setOnSelect])
  const handleOpenDraft = useCallback((draft: NewEmailDraft) => setNewCompose(draft), [])
  useEffect(() => { setNavOnOpenDraft(() => handleOpenDraft) }, [handleOpenDraft, setNavOnOpenDraft])

  // Manual "Link to company" action from the Unlinked tab's inline picker (ConversationRow) —
  // PATCHes the thread then updates local state in place so the row leaves Unlinked without a
  // full refetch. Only threads (thread_id set, or a 'thread'-sourced lead whose own id is the
  // thread id) can be linked this way; other lead sources have no email_threads row to patch.
  const handleLinkCompany = useCallback((threadId: string, companyId: string, companyName: string) => {
    fetch(`/api/engagement/thread/${threadId}/company`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    }).then(res => {
      if (!res.ok) return
      setLeads(prev => prev.map(l =>
        (l.thread_id === threadId || l.id === threadId) ? { ...l, companyId, companyName } : l
      ))
    }).catch(() => {})
  }, [])
  useEffect(() => { setOnLinkCompany(() => handleLinkCompany) }, [handleLinkCompany, setOnLinkCompany])

  const selectedLead   = leads.find(l => l.id === selectedId) ?? null
  const selectedThread = selectedId ? threadMap[selectedId] : undefined
  // Below the breakpoint where EngagementRail can host the navigator (see useNarrowViewport),
  // this page renders it inline in EaListPanel — EngagementRail hides there and has no room.
  const isDesktop = !useNarrowViewport()

  // Narrow viewports get the same navigator inline (full width on a phone: navigator → reader).
  // It reads the context this page mirrors into, so the handlers above still drive it.
  const listContent = <ThreadListPane />

  // Keyboard shortcuts, page-wide:
  //   ⌘K / Ctrl+K  focus the navigator search (expands the collapsed rail first)
  //   /            same, only when no field has focus
  //   c            new email, only when no field has focus and no dialog is open
  // ArrowUp/ArrowDown between rows live in ThreadListPane (roving focus inside the list).
  useEffect(() => {
    const isEditing = () => {
      const el = document.activeElement as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    }
    const dialogOpen = () => !!document.querySelector('[role="dialog"], [aria-modal="true"]')
    const focusSearch = () => {
      if (navCollapsed) setNavCollapsed(false)
      requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus())
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSearch(); return }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/' && !isEditing()) { e.preventDefault(); focusSearch(); return }
      if (e.key === 'c' && !isEditing() && !newCompose && !dialogOpen()) { e.preventDefault(); handleOpenDraft({ toEmail: '', cc: '', subject: '', body: '' }) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navCollapsed, setNavCollapsed, newCompose, handleOpenDraft])
  const workspaceContent = selectedLead ? (
    <ThreadView
      lead={selectedLead}
      threadState={selectedThread ?? { loading: true, thread: null, messages: [], error: null }}
      onStatus={handleStatus}
      onTransfer={handleTransfer}
      onDelete={handleDelete}
      onThreadRefresh={refreshSelectedThread}
      onBack={() => setMobilePanelView('list')}
    />
  ) : (
    <EaWorkspaceEmptyState
      title="Select a conversation"
      body={
        loading
          ? 'Loading…'
          : leads.length === 0
            ? 'No engaged leads yet. Change a lead status to Contacted or above.'
            : 'Choose from the list on the left.'
      }
    />
  )

  return (
    <EngagementShell>
      {isDesktop ? (
        // The conversation list itself renders in EngagementRail.tsx (EngagementFolderNav, fed by
        // the context mirror above) — one column on the left, not a folder-nav beside a separate
        // list panel. This workspace area gets the full remaining width.
        <div className="flex flex-1 min-w-0 overflow-hidden">
          {workspaceContent}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <EaListPanel mobileHidden={mobilePanelView === 'thread'} className="lg:!w-[320px]">
            {listContent}
          </EaListPanel>
          <EaWorkspaceArea mobileHidden={mobilePanelView === 'list'}>
            {workspaceContent}
          </EaWorkspaceArea>
        </div>
      )}
      {newCompose && (
        <NewEmailComposeModal
          initial={newCompose}
          onClose={() => setNewCompose(null)}
          onSent={() => { setNewCompose(null); load(true) }}
        />
      )}
    </EngagementShell>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function EngagementPage() {
  return (
    <Suspense>
      <EngagementPageInner />
    </Suspense>
  )
}
