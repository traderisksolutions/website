'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, ThreadState } from '@/components/engagement/types'
import { EMAIL_SOURCES, ENGAGED_STATUSES } from '@/components/engagement/types'
import { matchesSearch } from '@/components/engagement/helpers'
import { ConversationList } from '@/components/engagement/ConversationList'
import { ThreadView } from '@/components/engagement/ThreadView'
import { EngagementShell } from '@/components/engagement/shell'
import { EaListPanel, EaWorkspaceArea, EaWorkspaceEmptyState } from '@/components/engagement/EaLayout'

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

// ── Tab types ─────────────────────────────────────────────────────────────────

type EngagementTab = 'all' | 'prospects' | 'clients'

// ── Page inner ────────────────────────────────────────────────────────────────

function EngagementPageInner() {
  const searchParams = useSearchParams()
  const initLeadId   = searchParams.get('lead')

  const [leads,           setLeads]           = useState<Lead[]>([])
  const [loading,         setLoading]         = useState(true)
  const [refreshing,      setRefreshing]      = useState(false)
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [search,          setSearch]          = useState('')
  const [groupByCompany,  setGroupByCompany]  = useState(false)
  const [threadMap,       setThreadMap]       = useState<Record<string, ThreadState>>({})
  const [mobilePanelView, setMobilePanelView] = useState<'list' | 'thread'>('list')
  const [activeTab,       setActiveTab]       = useState<EngagementTab>('all')

  const log = useAuditLog()

  // Segment helpers
  const isProspect = (l: Lead) =>
    (EMAIL_SOURCES.has(l.source) || !!l.campaign_context) && l.segment !== 'existing_client'
  const isClient = (l: Lead) =>
    (!EMAIL_SOURCES.has(l.source) && !l.campaign_context) || l.segment === 'existing_client'

  const prospectsCount = useMemo(() => leads.filter(isProspect).length, [leads]) // eslint-disable-line react-hooks/exhaustive-deps
  const clientsCount   = useMemo(() => leads.filter(isClient).length,   [leads]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Load leads
  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const data = await fetchLeads()
      setLeads(data)
      setSelectedId(prev => {
        if (!prev && initLeadId && data.some(l => l.id === initLeadId)) return initLeadId
        return prev ?? (data[0]?.id ?? null)
      })
    } finally { setLoading(false); setRefreshing(false) }
  }, [initLeadId])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 30_000)
    return () => clearInterval(t)
  }, [load])

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

  const selectedLead   = leads.find(l => l.id === selectedId) ?? null
  const selectedThread = selectedId ? threadMap[selectedId] : undefined

  return (
    <EngagementShell>
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ── */}
        <EaListPanel mobileHidden={mobilePanelView === 'thread'}>
          <ConversationList
            leads={leads}
            visible={visible}
            threadMap={threadMap}
            selectedId={selectedId}
            search={search}
            activeTab={activeTab}
            groupByCompany={groupByCompany}
            loading={loading}
            refreshing={refreshing}
            prospectsCount={prospectsCount}
            clientsCount={clientsCount}
            onSelect={id => { setSelectedId(id); setMobilePanelView('thread') }}
            onSearch={setSearch}
            onTab={setActiveTab}
            onGroupToggle={() => setGroupByCompany(v => !v)}
            onRefresh={() => {
              // Fire Gmail sync in background (non-blocking — new emails appear on next auto-refresh)
              fetch('/api/email/ingest-trigger', { method: 'POST' }).catch(() => {})
              load(true)
              refreshSelectedThread()
            }}
          />
        </EaListPanel>

        {/* ── Thread workspace ── */}
        <EaWorkspaceArea mobileHidden={mobilePanelView === 'list'}>
          {selectedLead ? (
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
          )}
        </EaWorkspaceArea>
      </div>
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
