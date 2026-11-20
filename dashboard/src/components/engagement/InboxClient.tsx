'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, ThreadState } from '@/components/engagement/types'
import { EMAIL_SOURCES, ENGAGED_STATUSES } from '@/components/engagement/types'
import { matchesSearch } from '@/components/engagement/helpers'
import { ThreadListPane, SEARCH_INPUT_ID } from '@/components/engagement/ThreadListPane'
import { ThreadView } from '@/components/engagement/ThreadView'
import { NewEmailCompose, type NewEmailDraft } from '@/components/engagement/NewEmailCompose'
import { EngagementShell } from '@/components/engagement/shell'
import { EaListPanel, EaWorkspaceArea, EaWorkspaceEmptyState } from '@/components/engagement/EaLayout'
import { useEngagementNav, type LinkResult } from '@/providers/engagement-nav-provider'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'
import { inMailbox } from '@/lib/mail/visibility'
import { usePrivateThread } from '@/components/today/desk/PrivateThread'
import type { InboxCounts } from '@/lib/mail/inbox-list'
import type { InboxFirst } from '@/lib/engagement/inbox-first'
import { InboxTeamProvider, seedCompanyCard } from '@/components/engagement/company-card'
import { firstPaintKey, keepFirstPaint } from '@/components/engagement/first-paint'

/**
 * The Inbox's interactive body (/engagement). The page reads the first screen on the server and
 * passes it in as `initial` (src/lib/engagement/inbox-first.ts): the list, counts and mailbox names,
 * the form leads, the open thread, and what the rail and the navigator show first. Without it (the
 * read failed) the list reads itself, as before. Everything after the first paint is unchanged.
 */

// ── API helpers ───────────────────────────────────────────────────────────────

type Page = { rows: Lead[]; total: number; counts: InboxCounts; nextOffset: number | null; offset: number; mailboxes: string[] }

/** One page of threads from the server (100, newest first), with the view's total and the counts. */
async function fetchPage(p: { offset: number; view: string; mailbox: string; q: string; include?: string | null; fresh?: boolean }): Promise<Page> {
  const qs = new URLSearchParams({ paged: '1', offset: String(p.offset), view: p.view, mailbox: p.mailbox })
  if (p.q.trim()) { qs.set('q', p.q.trim()); qs.set('body', '1') }
  if (p.include) qs.set('include', p.include)
  if (p.fresh) qs.set('fresh', '1')
  const res = await fetch(`/api/engagement/conversations?${qs}`, { cache: 'no-store' })
  const data = await res.json().catch(() => null) as (Page & { error?: string }) | null
  if (!res.ok || !data || !Array.isArray(data.rows)) throw new Error(data?.error ? `The conversations did not load: ${data.error}` : `The conversations did not load (${res.status}).`)
  return { ...data, rows: data.rows.map(c => ({ ...c, source: 'thread' as const })) }
}

/** Website-form and email leads in an engaged status: they sit in the main list beside the threads. */
async function fetchFormLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' }).catch(() => null)
  const raw: unknown = res?.ok ? await res.json().catch(() => []) : []
  return (Array.isArray(raw) ? raw as Lead[] : []).filter(l => EMAIL_SOURCES.has(l.source) && ENGAGED_STATUSES.has(l.status))
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
  // A colleague's private thread: listed for everyone, opened only by those it is visible to.
  if (res.status === 403) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'This email lives in a colleague’s inbox.')
  if (!res.ok) return { thread: null, messages: [] }
  const data = await res.json()
  return {
    thread:   data.thread   ?? null,
    messages: Array.isArray(data.messages) ? data.messages : [],
  }
}

/** Every word of the search in the lead's own fields (form leads are not in the server's search). */
const leadMatches = (l: Lead, q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean).every(w => matchesSearch(l, w))

/** Every row of the first screen by id: threads, then form leads over them (as `merge` does). */
function rowsById(initial: InboxFirst | null): Record<string, Lead> {
  const out: Record<string, Lead> = {}
  for (const r of [...(initial?.rows ?? []), ...(initial?.formLeads ?? [])]) out[r.id] = r
  return out
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

export function InboxClient({ initial }: { initial: InboxFirst | null }) {
  const searchParams = useSearchParams()
  // ?thread= is what claims, the policy ledger and the queue link with; it means the same as ?lead=.
  const initLeadId   = searchParams.get('lead') ?? searchParams.get('thread')

  // The list and its filters live in EngagementNavProvider: EngagementRail renders the navigator on
  // wide screens; this page owns the fetching and mirrors its state up (one-way).
  const {
    activeTab, search, mailbox, setCounts, setRefreshing: setNavRefreshing, setOnRefresh,
    setLeads: setNavLeads, setVisible: setNavVisible, setThreadMap: setNavThreadMap,
    setSelectedId: setNavSelectedId, setLoading: setNavLoading, setOnSelect, setOnOpenDraft: setNavOnOpenDraft,
    setOnLinkCompany, navCollapsed, setNavCollapsed,
    setTotal, setHasMore, setLoadingMore, setOnMore, setLoadError, setMailboxes, setSeed,
  } = useEngagementNav()

  // The server's reads for the rail and the open thread's company, kept before the children mount.
  useState(() => {
    for (const [id, card] of Object.entries(initial?.cards ?? {})) seedCompanyCard(id, card)
    const rail = initial?.rail
    if (rail?.bar) keepFirstPaint(firstPaintKey.bar(rail.threadId), rail.bar)
    if (rail?.referral) keepFirstPaint(firstPaintKey.referral(rail.threadId), rail.referral)
    if (rail?.summaries) keepFirstPaint(firstPaintKey.summaries(rail.threadId), rail.summaries)
    return null
  })
  // The navigator's drafts and staff names: handed over on mount, withdrawn on leaving the Inbox.
  useEffect(() => {
    setSeed({ drafts: initial?.drafts ?? null, staffNames: initial?.staffNames ?? null })
    return () => setSeed(undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Every row loaded so far by id, and the order of the current view's rows.
  const [byId,            setById]            = useState<Record<string, Lead>>(() => rowsById(initial))
  const [order,           setOrder]           = useState<string[]>(() => initial?.rows.map(r => r.id) ?? [])
  const [formLeads,       setFormLeads]       = useState<Lead[]>(() => initial?.formLeads ?? [])
  const [page,            setPage]            = useState<Omit<Page, 'rows'> | null>(() => initial?.page ?? null)
  const [loading,         setLoading]         = useState(!initial)
  const [moreBusy,        setMoreBusy]        = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [selectedId,      setSelectedId]      = useState<string | null>(() => initial?.selectedId ?? null)
  const [threadMap,       setThreadMap]       = useState<Record<string, ThreadState>>(() =>
    initial?.selectedId && initial.thread ? { [initial.selectedId]: initial.thread } : {})
  const [mobilePanelView, setMobilePanelView] = useState<'list' | 'thread'>(() => initial?.deepLinked ? 'thread' : 'list')
  const [newCompose,      setNewCompose]      = useState<{ draft: NewEmailDraft; key: number } | null>(null)
  // The server's first page already carried the deep link (&include=).
  const deepLinkDone = useRef(!!initial && !!initLeadId)
  // The first page came with the page: the first load is skipped while the view is the one it read.
  const firstFromServer = useRef(!!initial)
  const request = useRef(0)

  // The search reaches the server a moment after typing stops.
  const [query, setQuery] = useState(search)
  useEffect(() => { const t = window.setTimeout(() => setQuery(search), 350); return () => window.clearTimeout(t) }, [search])
  const view = activeTab === 'drafts' ? 'all' : activeTab

  const setRefreshing = useCallback((v: boolean) => setNavRefreshing(v), [setNavRefreshing])

  // A Nexus step targeting a recipient with no thread hands over a new-email
  // draft here (compose-only) — open the composer so it lands in Engagement.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.sessionStorage.getItem('trs_pending_new')
    if (!raw) return
    window.sessionStorage.removeItem('trs_pending_new')
    try { setNewCompose({ draft: JSON.parse(raw) as NewEmailDraft, key: Date.now() }); setMobilePanelView('thread') } catch { /* ignore */ }
  }, [])

  const log = useAuditLog()

  // Form leads sit in Inbox (the all view) beside the threads, under the same pill and search.
  // While older pages are still on the server, only leads as new as the oldest loaded row show.
  const threads = useMemo(() => order.flatMap(id => byId[id] ? [byId[id]] : []), [order, byId])
  const leadThreadIds = useMemo(() => new Set(formLeads.flatMap(l => l.thread_id ? [l.thread_id] : [])), [formLeads])
  const shownLeads = useMemo(() => formLeads.filter(l => inMailbox(mailbox, []) && leadMatches(l, query)), [formLeads, mailbox, query])
  const visible = useMemo(() => {
    if (view !== 'all') return threads
    const oldest = page?.nextOffset != null ? threads.at(-1)?.created_at ?? null : null
    const leads = shownLeads.filter(l => !oldest || l.created_at >= oldest)
    return [...threads.filter(t => !leadThreadIds.has(t.id)), ...leads]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [view, threads, shownLeads, leadThreadIds, page])

  // Mirror into the shared context.
  useEffect(() => { setNavLeads(visible) }, [visible, setNavLeads])
  useEffect(() => { setNavVisible(visible) }, [visible, setNavVisible])
  useEffect(() => { setNavThreadMap(threadMap) }, [threadMap, setNavThreadMap])
  useEffect(() => { setNavSelectedId(selectedId) }, [selectedId, setNavSelectedId])
  useEffect(() => { setNavLoading(loading) }, [loading, setNavLoading])
  useEffect(() => { setLoadError(error) }, [error, setLoadError])
  useEffect(() => { setLoadingMore(moreBusy) }, [moreBusy, setLoadingMore])
  useEffect(() => { setHasMore(page?.nextOffset != null) }, [page, setHasMore])
  useEffect(() => { if (page) setMailboxes(page.mailboxes) }, [page, setMailboxes])
  // The true totals from the server; Inbox adds the form leads under the same pill and search.
  useEffect(() => {
    if (!page) return
    setCounts(c => ({ ...c, ...page.counts, all: page.counts.all + shownLeads.length }))
    setTotal(page.total + (view === 'all' ? shownLeads.length : 0))
  }, [page, shownLeads.length, view, setCounts, setTotal])

  const merge = useCallback((rows: Lead[]) => setById(prev => {
    const next = { ...prev }
    for (const r of rows) next[r.id] = r
    return next
  }), [])

  // The first page of the view: on open, and whenever the view, the pill or the search changes.
  const load = useCallback(async (opts: { fresh?: boolean } = {}) => {
    const id = ++request.current
    setError(null)
    try {
      const include = !deepLinkDone.current ? initLeadId : null
      const [p, leads] = await Promise.all([
        fetchPage({ offset: 0, view, mailbox, q: query, include, fresh: opts.fresh }),
        fetchFormLeads(),
      ])
      if (id !== request.current) return
      merge([...p.rows, ...leads])
      setOrder(p.rows.map(r => r.id))
      setFormLeads(leads)
      const { rows, ...meta } = p
      setPage(meta)
      // ?lead= carries either a lead id or an email thread id (company drawer, Nexus, chat, CRM
      // activity all pass thread ids). A thread attached to a lead is listed under the lead's id.
      const all = [...leads, ...rows]
      const linked = !deepLinkDone.current && initLeadId ? all.find(l => l.id === initLeadId || l.thread_id === initLeadId) : undefined
      if (initLeadId) deepLinkDone.current = true
      if (linked) setMobilePanelView('thread')
      // Default selection = the newest conversation.
      const newest = [...all].filter(l => !l.private).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.id ?? null
      setSelectedId(prev => prev ?? linked?.id ?? newest)
    } catch (e) {
      if (id !== request.current) return
      setError(e instanceof Error ? e.message : 'The conversations did not load.')
    } finally {
      if (id === request.current) { setLoading(false); setRefreshing(false) }
    }
  }, [initLeadId, view, mailbox, query, merge, setRefreshing])

  useEffect(() => {
    const served = firstFromServer.current && view === 'all' && mailbox === 'all' && !query.trim()
    firstFromServer.current = false
    if (served) return
    setLoading(true); setOrder([]); setPage(null); void load()
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  // The next 100: on scroll to the foot of the list, or More.
  const loadMore = useCallback(async () => {
    if (!page || page.nextOffset == null || moreBusy) return
    const id = request.current
    setMoreBusy(true)
    try {
      const p = await fetchPage({ offset: page.nextOffset, view, mailbox, q: query })
      if (id !== request.current) return
      merge(p.rows)
      setOrder(prev => [...prev, ...p.rows.map(r => r.id).filter(x => !prev.includes(x))])
      const { rows, ...meta } = p
      void rows
      setPage(meta)
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : 'The conversations did not load.')
    } finally { setMoreBusy(false) }
  }, [page, moreBusy, view, mailbox, query, merge])
  useEffect(() => { setOnMore(() => () => void loadMore()) }, [loadMore, setOnMore])

  // Load thread on selection
  useEffect(() => {
    if (!selectedId) return
    const lead = byId[selectedId]
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
  }, [selectedId, byId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Was a realtime INSERT subscription. Cloud SQL cannot push, so the open thread is
  // re-fetched on an interval; fetchThread already merges without duplicating messages.
  useEffect(() => {
    if (!selectedId) return
    const threadId = byId[selectedId]?.thread_id
    if (!threadId) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      const lead = byId[selectedId]
      if (lead) void fetchThread(lead.thread_id ?? null, lead.email)
    }
    // Every minute: new mail is filed by the ingest, not by this tab (was 20s; 20 Nov 2026).
    const poll = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', tick) }
  }, [selectedId, byId])

  const patchLead = useCallback((match: (l: Lead) => boolean, change: (l: Lead) => Lead) => {
    setById(prev => {
      const next = { ...prev }
      for (const [k, l] of Object.entries(prev)) if (match(l)) next[k] = change(l)
      return next
    })
    setFormLeads(prev => prev.map(l => match(l) ? change(l) : l))
  }, [])

  function handleStatus(id: string, status: string) {
    const lead = byId[id]
    patchLead(l => l.id === id, l => ({ ...l, status }))
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
    const lead = byId[id]
    patchLead(l => l.id === id, l => ({ ...l, segment: 'existing_client', segment_note: note || null }))
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
    setOrder(prev => prev.filter(x => x !== id))
    setFormLeads(prev => prev.filter(l => l.id !== id))
    setThreadMap(prev => { const next = { ...prev }; delete next[id]; return next })
    setPage(p => p ? { ...p, total: Math.max(0, p.total - 1), counts: { ...p.counts, all: Math.max(0, p.counts.all - 1) } } : p)
    setSelectedId(null)
  }

  // Kept in a ref so Refresh always re-reads the thread open now.
  const refreshSelectedThreadRef = useRef<() => void>(() => {})
  function refreshSelectedThread() {
    if (!selectedId) return
    const lead = byId[selectedId]
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
  refreshSelectedThreadRef.current = refreshSelectedThread

  // Refresh: one Gmail read on demand, then the list read fresh (registered for the navigator's Sync).
  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    fetch('/api/email/ingest-trigger', { method: 'POST' })
      .catch(() => {})
      .finally(() => { void load({ fresh: true }); refreshSelectedThreadRef.current() })
  }, [load, setRefreshing])
  useEffect(() => { setOnRefresh(() => handleRefresh) }, [handleRefresh, setOnRefresh])

  // A colleague's private thread opens the ring-fence modal, not the reading pane (Jarod, 20 Nov 2026).
  const openPrivate = usePrivateThread()
  const byIdRef = useRef(byId)
  useEffect(() => { byIdRef.current = byId }, [byId])
  const handleSelect = useCallback((id: string) => {
    const lead = byIdRef.current[id]
    if (lead?.private) { void openPrivate(lead.thread_id ?? id, { name: (lead.private.owner ?? 'a colleague').split(/[\s,]+/)[0] }); return }
    setNewCompose(null); setSelectedId(id); setMobilePanelView('thread')
  }, [openPrivate])
  useEffect(() => { setOnSelect(() => handleSelect) }, [handleSelect, setOnSelect])
  const handleOpenDraft = useCallback((draft: NewEmailDraft) => { setNewCompose({ draft, key: Date.now() }); setMobilePanelView('thread') }, [])
  useEffect(() => { setNavOnOpenDraft(() => handleOpenDraft) }, [handleOpenDraft, setNavOnOpenDraft])

  // A person files a thread (Link company, Change company). A thread filed under an insurer or
  // partner keeps that filing; the pick becomes the client it is about (thread_insurers). A company
  // named but not on file is created by the route. A failure comes back to the picker, which shows
  // it in red with Retry.
  const handleLinkCompany = useCallback(async (threadId: string, companyId: string | null, companyName: string): Promise<LinkResult> => {
    try {
      const res = await fetch(`/api/engagement/thread/${threadId}/company`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, name: companyName }),
      })
      const r = await res.json().catch(() => ({})) as { companyId?: string; clientCompanyId?: string; companyName?: string; error?: string }
      if (!res.ok) return { ok: false, error: r.error ? `Not linked: ${r.error}` : `Not linked (${res.status}).` }
      patchLead(
        l => l.thread_id === threadId || l.id === threadId,
        l => r.clientCompanyId ? { ...l, clientCompanyId: r.clientCompanyId, clientNamed: null } : { ...l, companyId: r.companyId ?? companyId, companyName: r.companyName ?? companyName, companyKind: l.companyKind ?? 'client' },
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? `Not linked: ${e.message}` : 'Not linked.' }
    }
  }, [patchLead])
  useEffect(() => { setOnLinkCompany(() => handleLinkCompany) }, [handleLinkCompany, setOnLinkCompany])

  const selectedLead   = selectedId ? byId[selectedId] ?? null : null
  const selectedThread = selectedId ? threadMap[selectedId] : undefined
  // Below the breakpoint where EngagementRail can host the navigator (see useNarrowViewport),
  // this page renders it inline in EaListPanel — EngagementRail hides there and has no room.
  const isDesktop = !useNarrowViewport()

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

  // New email takes the whole reading pane; Close returns to the thread that was open.
  const workspaceContent = newCompose ? (
    <NewEmailCompose
      key={newCompose.key}
      initial={newCompose.draft}
      onClose={() => { setNewCompose(null); if (!selectedLead) setMobilePanelView('list') }}
      onSent={() => { void load({ fresh: true }) }}
    />
  ) : selectedLead ? (
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
      body={loading ? 'Loading…' : error ? 'The conversations did not load.' : visible.length === 0 ? 'No conversations.' : 'Choose from the list on the left.'}
    />
  )

  return (
    <InboxTeamProvider value={initial?.team ?? NO_TEAM}>
    <EngagementShell>
      {isDesktop ? (
        // The navigator renders in EngagementRail.tsx (fed by the context mirror above); this
        // workspace area gets the full remaining width.
        <div className="flex flex-1 min-w-0 overflow-hidden">
          {workspaceContent}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <EaListPanel mobileHidden={mobilePanelView === 'thread'} className="lg:!w-[320px]">
            <ThreadListPane />
          </EaListPanel>
          <EaWorkspaceArea mobileHidden={mobilePanelView === 'list'}>
            {workspaceContent}
          </EaWorkspaceArea>
        </div>
      )}
    </EngagementShell>
    </InboxTeamProvider>
  )
}

const NO_TEAM = { me: null, staff: [] }
