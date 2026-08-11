'use client'

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuditLog } from '@/hooks/useAuditLog'
import { createClient } from '@/lib/supabase/client'
import type { Lead, ThreadState } from '@/components/engagement/types'
import { EMAIL_SOURCES, ENGAGED_STATUSES } from '@/components/engagement/types'
import { matchesSearch } from '@/components/engagement/helpers'
import { ConversationList } from '@/components/engagement/ConversationList'
import { ThreadView } from '@/components/engagement/ThreadView'
import { NewEmailComposeModal, type NewEmailDraft } from '@/components/engagement/NewEmailComposeModal'
import { EngagementShell } from '@/components/engagement/shell'
import { EaListPanel, EaWorkspaceArea, EaWorkspaceEmptyState } from '@/components/engagement/EaLayout'
import { useEngagementNav } from '@/providers/engagement-nav-provider'
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
  // EngagementNavProvider now — Sidebar.tsx renders the actual conversation list (see
  // EngagementFolderNav) since the sidebar itself becomes the thread list on this route (one
  // column, not a folder-nav beside a separate list panel); this page owns fetching/realtime and
  // mirrors its state up for Sidebar to render, same cross-component pattern as ChatDockProvider.
  const {
    activeTab, search, groupByCompany, setCounts, setRefreshing: setNavRefreshing, setOnRefresh,
    setLeads: setNavLeads, setVisible: setNavVisible, setThreadMap: setNavThreadMap,
    setSelectedId: setNavSelectedId, setLoading: setNavLoading, setOnSelect, setOnOpenDraft: setNavOnOpenDraft,
  } = useEngagementNav()

  const [leads,           setLeads]           = useState<Lead[]>([])
  const [loading,         setLoading]         = useState(true)
  const [refreshing,      setRefreshingState] = useState(false)
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [threadMap,       setThreadMap]       = useState<Record<string, ThreadState>>({})
  const [mobilePanelView, setMobilePanelView] = useState<'list' | 'thread'>('list')
  const [newCompose,      setNewCompose]      = useState<NewEmailDraft | null>(null)

  const setRefreshing = useCallback((v: boolean) => { setRefreshingState(v); setNavRefreshing(v) }, [setNavRefreshing])

  // Mirror this page's real state into the shared context so Sidebar's EngagementFolderNav can
  // render the actual list — page.tsx stays the single source of truth (all the fetch/realtime
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

  // Segment helpers
  const isProspect = (l: Lead) =>
    (EMAIL_SOURCES.has(l.source) || !!l.campaign_context) && l.segment !== 'existing_client'
  const isClient = (l: Lead) =>
    (!EMAIL_SOURCES.has(l.source) && !l.campaign_context) || l.segment === 'existing_client'

  const prospectsCount = useMemo(() => leads.filter(isProspect).length, [leads]) // eslint-disable-line react-hooks/exhaustive-deps
  const clientsCount   = useMemo(() => leads.filter(isClient).length,   [leads]) // eslint-disable-line react-hooks/exhaustive-deps

  // Push the all/prospects/clients counts up to Sidebar's EngagementFolderNav — `drafts` is
  // merged in separately by ConversationList (which owns loading the drafts list).
  useEffect(() => {
    setCounts(c => ({ ...c, all: leads.length, prospects: prospectsCount, clients: clientsCount }))
  }, [leads.length, prospectsCount, clientsCount, setCounts])

  // Sorted + filtered list
  const visible = useMemo(() => {
    const filtered = leads.filter(l => {
      if (activeTab === 'prospects') return isProspect(l)
      if (activeTab === 'clients')   return isClient(l)
      return true
    }).filter(l => matchesSearch(l, search))

    return [...filtered].sort((a, b) => {
      const ta = threadMap[a.id]?.messages.at(-1)?.sent_at ?? a.created_at
      const tb = threadMap[b.id]?.messages.at(-1)?.sent_at ?? b.created_at
      return new Date(tb).getTime() - new Date(ta).getTime()
    })
  }, [leads, activeTab, search, threadMap]) // eslint-disable-line react-hooks/exhaustive-deps
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

    const supabase = createClient()
    const channel  = supabase
      .channel(`ea-live-${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'email_messages', filter: `thread_id=eq.${threadId}` },
        payload => {
          const r = payload.new as {
            id: string; direction: 'inbound' | 'outbound'; from_address: string | null
            subject: string | null; body_text: string | null; sent_at: string | null
          }
          setThreadMap(prev => {
            const t = prev[selectedId]
            // Only append to an already-loaded thread; skip if the initial fetch will cover it.
            if (!t || t.loading || t.messages.some(m => m.id === r.id)) return prev
            const msg = {
              id: r.id, direction: r.direction, from_address: r.from_address,
              subject: r.subject, body_text: r.body_text, sent_at: r.sent_at,
              to: [] as string[], cc: [] as string[],
            }
            return { ...prev, [selectedId]: { ...t, messages: [...t.messages, msg] } }
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
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
  // EngagementNavProvider so the Refresh button in Sidebar's folder-nav can trigger it.
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

  const selectedLead   = leads.find(l => l.id === selectedId) ?? null
  const selectedThread = selectedId ? threadMap[selectedId] : undefined
  // Below the breakpoint where Sidebar can host the list (see useNarrowViewport), this page
  // falls back to its own EaListPanel + ConversationList — the sidebar collapses to icons there
  // and has no room for it.
  const isDesktop = !useNarrowViewport()

  const listContent = (
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
      onSelect={handleSelect}
      onOpenDraft={handleOpenDraft}
      onRefresh={handleRefresh}
    />
  )
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
        // The conversation list itself renders in Sidebar.tsx (EngagementFolderNav, fed by the
        // context mirror above) — one column on the left, not a folder-nav beside a separate
        // list panel. This workspace area gets the full remaining width.
        <div className="flex flex-1 min-w-0 overflow-hidden">
          {workspaceContent}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <EaListPanel mobileHidden={mobilePanelView === 'thread'}>
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
