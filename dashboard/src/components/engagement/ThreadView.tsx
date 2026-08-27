'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, ThreadState, StoredSummary, RagSource } from './types'
import { fullName, extractEmail } from './helpers'
import { EaWorkspaceColumn, EaMessageArea, ScrollToLatestButton } from './EaLayout'
import { EngagementThreadHeader } from '@/components/engagement-agent/engagement-thread-header'
import { AddToCaseControl } from '@/components/engagement/AddToCaseControl'
import { EngagementMessageCard } from '@/components/engagement-agent/engagement-message-card'
import { cleanEmailBody } from '@/lib/clean-email-body'
import { EngagementComposePanel } from '@/components/engagement-agent/engagement-compose-panel'
import { EngagementContextPanel } from '@/components/engagement-agent/engagement-context-panel'
import { AiAnalysisPanel } from '@/components/engagement-agent/ai-analysis-panel'
import { EngagementDock } from './EngagementDock'
import ThreadRfqWorkflow from './ThreadRfqWorkflow'
import ThreadGbQuote from './ThreadGbQuote'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface ThreadViewProps {
  lead:            Lead
  threadState:     ThreadState
  onStatus:        (id: string, s: string) => void
  onTransfer:      (id: string, note: string) => Promise<void>
  onDelete:        (id: string) => void
  onThreadRefresh: () => void
  onBack?:         () => void
}

// Reply-All recipients = the To+CC of the message being replied to (the latest one). We KEEP
// internal @trade-risksol.com colleagues (the whole point — everyone on the thread stays in the
// loop) and only drop: whoever's already in the To field, automated addresses, and the shared
// operations@ mailbox (the send route auto-adds that itself).
function computeReplyAllCcs(messages: RealMsg[], toAddr: string): string[] {
  const latest = messages.at(-1)
  if (!latest) return []
  const to  = toAddr.trim().toLowerCase()
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of [...(latest.to ?? []), ...(latest.cc ?? [])]) {
    const e  = extractEmail(raw)
    const le = e.toLowerCase()
    if (!e || le === to) continue
    if (le === 'operations@trade-risksol.com') continue
    if (le.includes('noreply') || le.includes('no-reply') || le.includes('mailer-daemon')) continue
    if (seen.has(le)) continue
    seen.add(le); out.push(e)
  }
  return out
}

export function ThreadView({
  lead, threadState, onStatus, onTransfer, onDelete, onThreadRefresh, onBack,
}: ThreadViewProps) {
  const initialMsg = lead.details || lead.message

  // Summaries
  const [summaries,        setSummaries]        = useState<StoredSummary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(false)
  const [analyzing,        setAnalyzing]        = useState(false)

  // RAG draft
  const [ragDraft,         setRagDraft]         = useState<{ content: string; sources: RagSource[] } | null>(null)

  // Right context sidebar collapse
  // Closed by default — was a perpetually-visible column; now an on-demand Sheet opened from
  // the info button in EngagementThreadHeader, so the reading pane keeps the full width.
  const [contextOpen,      setContextOpen]      = useState(false)

  // RFQ context — is this thread an insurer's quotation conversation?
  const [rfqContext, setRfqContext] = useState<{ is_insurer_rfq: boolean; case_id?: string | null; insurer_name?: string | null; insured?: string | null } | null>(null)

  // Dock imperative open (e.g. an RFQ/analysis step wanting its own tab open). Reply is no
  // longer a dock tab — it's always visible in-flow — so a draft arriving from elsewhere now
  // scrolls the composer into view instead (see scrollComposerIntoView below).
  const [dockSignal, setDockSignal] = useState<{ tab: 'analysis' | 'rfq' | 'gbquote'; stamp: number } | undefined>(undefined)

  // ── Thread scroll region ─────────────────────────────────────────────────────────────────
  const messageAreaRef  = useRef<HTMLDivElement>(null)
  const composerRef     = useRef<HTMLDivElement>(null)
  const [showScrollToLatest, setShowScrollToLatest] = useState(false)
  const scrolledInitRef = useRef<string | null>(null)   // threadId we've already auto-scrolled on open
  const pendingSendScrollRef = useRef(false)             // set by a successful send, consumed once messages refresh

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = messageAreaRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  const scrollComposerIntoView = useCallback(() => {
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  function handleMessageAreaScroll() {
    const el = messageAreaRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollToLatest(distanceFromBottom > 120)
  }

  // ── Party switcher: a conversation can span several threads (client, employee, insurer…).
  //    The page loads the primary thread; picking another party in the right panel overrides
  //    which thread's messages the workspace shows. propThreadId is the page-loaded (anchor)
  //    thread; activeThreadId is the one currently displayed.
  const propThreadId = threadState.thread?.id ?? null
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [overrideState,  setOverrideState]  = useState<ThreadState | null>(null)
  const [refreshNonce,   setRefreshNonce]   = useState(0)
  const isOverriding  = !!activeThreadId && activeThreadId !== propThreadId
  const effectiveState = isOverriding && overrideState ? overrideState : threadState
  const { thread, messages, loading, error } = effectiveState
  const needsReply = messages.at(-1)?.direction === 'inbound'

  // Compose headers
  const [toAddress,     setToAddress]     = useState('')
  const [ccList,        setCcList]        = useState<string[]>([])
  const [bccList,       setBccList]       = useState<string[]>([])
  const [customSubject, setCustomSubject] = useState('')
  const [replyAll,      setReplyAll]      = useState(true)   // default to Reply All
  const initedThreadRef = useRef<string | null>(null)

  // Restore draft from history
  const [pendingRestore, setPendingRestore] = useState<{ body: string; generatedBy: string; stamp: number } | null>(null)

  // Delete confirm
  const [deleting,       setDeleting]      = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)

  const threadId        = thread?.id ?? null
  const latestMessageId = messages.at(-1)?.id ?? null
  const log             = useAuditLog()

  // Load the selected party's thread when it differs from the page-loaded one. refreshNonce
  // lets a send re-pull the override in place (keeps old messages visible while loading).
  useEffect(() => {
    if (!isOverriding) { setOverrideState(null); return }
    let cancelled = false
    setOverrideState(prev => prev ?? { loading: true, thread: null, messages: [], error: null })
    fetch(`/api/engagement/thread?thread_id=${encodeURIComponent(activeThreadId!)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!cancelled) setOverrideState({ loading: false, thread: d.thread ?? null, messages: Array.isArray(d.messages) ? d.messages : [], error: null }) })
      .catch(() => { if (!cancelled) setOverrideState({ loading: false, thread: null, messages: [], error: 'Failed to load conversation' }) })
    return () => { cancelled = true }
  }, [activeThreadId, propThreadId, refreshNonce, isOverriding])

  // Reset per-lead state when switching leads (incl. any active party override)
  useEffect(() => {
    initedThreadRef.current = null
    setActiveThreadId(null)
    setOverrideState(null)
    setAnalyzing(false)
    setReplyAll(true)
    const s = threadState.thread?.subject ?? ''
    setCustomSubject(s ? (s.startsWith('Re:') ? s : `Re: ${s}`) : 'Re: Your enquiry | Trade Risk Solutions')
    setToAddress(lead.email ?? '')
    setCcList([])
    setBccList([])
    setSummaries([])
    setRagDraft(null)
  }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise TO/CC/subject from the active thread's messages. Re-runs when the displayed
  // thread changes (lead switch OR party switch), but never on a plain poll of the same thread.
  useEffect(() => {
    if (messages.length === 0) return
    if (initedThreadRef.current === threadId) return
    initedThreadRef.current = threadId

    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
    // Prefer the party who last wrote to us; for a thread we started (no inbound yet), fall
    // back to whoever we last addressed — so To follows the selected party either way.
    let toGuess = lastInbound?.from_address ? extractEmail(lastInbound.from_address) : ''
    if (!toGuess) {
      const lastOutbound = [...messages].reverse().find(m => m.direction === 'outbound')
      if (lastOutbound?.to?.[0]) toGuess = extractEmail(lastOutbound.to[0])
    }
    if (toGuess) setToAddress(toGuess)

    if (thread?.subject) {
      const s = thread.subject
      setCustomSubject(s.startsWith('Re:') ? s : `Re: ${s}`)
    }
    // Reply All (default): CC everyone on the message being replied to. Sender-only clears CC.
    setCcList(replyAll ? computeReplyAllCcs(messages, toGuess || toAddress) : [])
  }, [threadId, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle Reply All ↔ sender-only, recomputing CC from the current thread.
  function toggleReplyAll() {
    const next = !replyAll
    setReplyAll(next)
    setCcList(next ? computeReplyAllCcs(messages, toAddress) : [])
  }

  // A send should refresh the page thread AND (if a party override is active) re-pull it.
  // Also flags that the next messages-settled effect run should scroll to the newly-sent
  // message (see the scroll-management effect below) — a genuine round-trip refetch, not an
  // optimistic append (see EngagementComposePanel.handleSend), so we can't scroll immediately.
  function handleThreadRefresh() {
    pendingSendScrollRef.current = true
    onThreadRefresh()
    if (isOverriding) setRefreshNonce(n => n + 1)
  }

  // Auto-scroll rules: (1) instantly to the bottom once when a thread first finishes loading
  // (switching threads/opening one should start you at the latest message, matching the
  // existing defaultOpen assumption below), (2) smoothly to the bottom after a send completes.
  // Never auto-scrolls on message expand/collapse or sidebar resize — those don't touch
  // scrolledInitRef/pendingSendScrollRef at all.
  useEffect(() => {
    if (loading || !threadId) return
    if (pendingSendScrollRef.current) {
      pendingSendScrollRef.current = false
      scrollToBottom(true)
      return
    }
    if (scrolledInitRef.current !== threadId) {
      scrolledInitRef.current = threadId
      scrollToBottom(false)
    }
  }, [threadId, loading, messages.length, scrollToBottom])

  // Read any existing summary when the thread changes (display only — never generates).
  // The reply draft is NOT auto-loaded; it appears only when the employee clicks Generate.
  useEffect(() => {
    setSummaries([])
    setRagDraft(null)
    if (!threadId) return

    setSummariesLoading(true)
    fetch(`/api/engagement/thread-summaries?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setSummaries(Array.isArray(data) ? data : []))
      .catch(() => setSummaries([]))
      .finally(() => setSummariesLoading(false))

    log({
      action: 'thread.viewed', resource_type: 'thread', resource_id: threadId,
      metadata: { contact: lead.email, subject: lead.subject },
    })
  }, [threadId, lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Is this thread an insurer's RFQ conversation? → show a context banner.
  useEffect(() => {
    setRfqContext(null)
    if (!threadId) return
    fetch(`/api/nexus/rfq/thread-context?thread_id=${threadId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setRfqContext(d))
      .catch(() => {})
  }, [threadId])

  // Pending reply handed over from a Nexus roadmap step (via sessionStorage) →
  // load it into the composer and scroll it into view (Reply is always visible in-flow now,
  // so there's no dock tab to open — just bring the composer into the viewport).
  useEffect(() => {
    if (!threadId || typeof window === 'undefined') return
    const raw = window.sessionStorage.getItem('trs_pending_reply')
    if (!raw) return
    try {
      const p = JSON.parse(raw) as { threadId?: string; toEmail?: string; subject?: string; body?: string }
      if (p.threadId && p.threadId !== threadId) return
      window.sessionStorage.removeItem('trs_pending_reply')
      if (p.subject) setCustomSubject(p.subject)
      if (p.toEmail) setToAddress(p.toEmail)
      if (p.body) setPendingRestore({ body: p.body, generatedBy: 'nexus-step', stamp: Date.now() })
      scrollComposerIntoView()
    } catch { /* ignore */ }
  }, [threadId]) // eslint-disable-line react-hooks/exhaustive-deps

  // NOTE: AI Analysis is generated ON DEMAND only (the Refresh button →
  // refreshSummaries below). It no longer auto-polls or auto-generates when a new
  // email arrives — matching the rewired "button press only" behaviour.

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      if (threadId) {
        await fetch(`/api/engagement/thread?thread_id=${encodeURIComponent(threadId)}`, { method: 'DELETE' })
      }
      onDelete(lead.id)
    } finally { setDeleting(false); setConfirmDelete(false) }
  }

  // The Refresh button GENERATES the analysis on demand (server auto-summarize on
  // inbound was removed), then reloads the stored summary. Awaitable so the Reply
  // "Generate" can run one analysis pass before drafting (#3).
  async function runAnalysis(): Promise<void> {
    if (!threadId) return
    setAnalyzing(true)
    try {
      await fetch('/api/engagement/refresh-summary', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ thread_id: threadId, message_id: latestMessageId }),
      })
    } catch { /* ignore — still reload below */ }
    try {
      const data = await fetch(`/api/engagement/thread-summaries?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' }).then(r => r.json())
      setSummaries(Array.isArray(data) ? data : [])
    } catch { setSummaries([]) }
    finally { setAnalyzing(false) }
  }
  function refreshSummaries() { void runAnalysis() }

  // Auto-expand: last message + last inbound message
  const lastInboundIdx = messages.reduce((found, m, i) => m.direction === 'inbound' ? i : found, -1)

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden">

      {/* ── Center pane ── */}
      <EaWorkspaceColumn>

        {/* Thread header */}
        <EngagementThreadHeader
          subject={thread?.subject ?? lead.subject ?? lead.topic ?? null}
          lead={lead}
          messageCount={messages.length}
          needsReply={needsReply}
          statusKey={lead.status}
          confirmDelete={confirmDelete}
          deleting={deleting}
          onBack={onBack}
          onDelete={handleDelete}
          onCancelDelete={() => setConfirmDelete(false)}
          onOpenInfo={() => setContextOpen(true)}
        />

        {/* Only offer "Add to Nexus case" when the thread isn't already in one —
            an insurer RFQ thread already belongs to its case (shown by the banner
            below), so the two would otherwise contradict each other. */}
        {!rfqContext?.case_id && <AddToCaseControl threadId={threadId} />}

        {/* Wraps just the scrollable reading viewport (not the dock below) so the floating
            "scroll to latest" button pins to the visible message area regardless of whether
            the dock below is collapsed (tab strip only) or expanded (up to 380px). */}
        <div className="relative flex-1 min-h-0 flex flex-col">
        {/* ── Messages scroll region — the composer lives inside it too, as the last item in
             the same flow, so scrolling to the bottom of the thread naturally reveals it. ── */}
        <EaMessageArea ref={messageAreaRef} onScroll={handleMessageAreaScroll}>

          {/* Campaign banner */}
          {lead.campaign_context && (
            <CampaignBanner ctx={lead.campaign_context} />
          )}

          {/* Insurer RFQ context banner */}
          {rfqContext?.is_insurer_rfq && (
            <div className="border-b border-[--border-subtle] bg-indigo-50/70 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] font-semibold text-indigo-700 truncate">
                🏷 Insurer quote · {rfqContext.insurer_name ?? 'Insurer'}{rfqContext.insured ? ` · ${rfqContext.insured} RFQ` : ' RFQ'}
              </span>
              {rfqContext.case_id && (
                <a href={`/nexus?case=${rfqContext.case_id}`} className="text-[10.5px] font-semibold text-indigo-700 hover:underline flex-shrink-0 ml-2">
                  open file →
                </a>
              )}
            </div>
          )}

          <div className="flex flex-col">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <span className="text-[12px] text-muted-foreground">Loading email thread…</span>
              </div>
            )}
            {!loading && error && (
              <div className="flex items-center justify-center py-10">
                <span className="text-[12px] text-[--error]">{error}</span>
              </div>
            )}
            {!loading && !error && messages.length === 0 && (
              <div className="flex flex-col gap-4 px-4 py-8">
                <p className="text-center text-[12px] text-muted-foreground">
                  No email thread found for {lead.email ?? 'this contact'}.
                </p>
                {initialMsg && (
                  <div className="border border-[--border-subtle] rounded-xl p-4 bg-card">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2 m-0">
                      Original message from lead form
                    </p>
                    <p className="text-[13px] text-foreground/80 whitespace-pre-wrap leading-[1.7] m-0">
                      {cleanEmailBody(initialMsg)}
                    </p>
                  </div>
                )}
              </div>
            )}
            {!loading && messages.map((msg, i) => (
              <EngagementMessageCard
                key={msg.id}
                msg={msg}
                defaultOpen={i === messages.length - 1 || i === lastInboundIdx}
                isLatest={i === messages.length - 1}
              />
            ))}
          </div>

          {/* ── Reply composer — part of the thread flow, not a detached panel ── */}
          {!loading && (
            <div ref={composerRef}>
              <EngagementComposePanel
                lead={lead}
                thread={thread}
                messages={messages}
                toAddress={toAddress}
                ccList={ccList}
                bccList={bccList}
                customSubject={customSubject}
                setToAddress={setToAddress}
                setCcList={setCcList}
                setBccList={setBccList}
                setCustomSubject={setCustomSubject}
                replyAll={replyAll}
                onToggleReplyAll={toggleReplyAll}
                storedDraft={summaries[0]?.draft_reply ?? null}
                storedRagDraft={ragDraft?.content ?? null}
                storedRagSources={ragDraft?.sources ?? []}
                onThreadRefresh={handleThreadRefresh}
                onAnalyze={runAnalysis}
                pendingRestore={pendingRestore}
              />
            </div>
          )}
        </EaMessageArea>

        <ScrollToLatestButton visible={showScrollToLatest} onClick={() => scrollToBottom(true)} />
        </div>

        {/* ── Bottom dock: AI Analysis · RFQ · Pricing Quote ── */}
        <EngagementDock
          analysis={
            <AiAnalysisPanel
              summaries={summaries}
              loading={summariesLoading || analyzing}
              threadId={threadId}
              latestMessageId={latestMessageId}
              ragSources={ragDraft?.sources ?? []}
              onRefresh={refreshSummaries}
            />
          }
          rfq={
            threadId
              ? <ThreadRfqWorkflow threadId={threadId} messageId={latestMessageId} defaultInsured={lead.company ?? fullName(lead) ?? ''} />
              : <div className="p-5 text-[12px] text-muted-foreground/60">Open an email thread to start an RFQ.</div>
          }
          gbquote={
            threadId
              ? <ThreadGbQuote
                  threadId={threadId}
                  defaultCompany={lead.company ?? fullName(lead) ?? ''}
                  onDraftReply={(body) => { setPendingRestore({ body, generatedBy: 'gb-quote', stamp: Date.now() }); scrollComposerIntoView() }}
                />
              : <div className="p-5 text-[12px] text-muted-foreground/60">Open an email thread to quote a census.</div>
          }
          openSignal={dockSignal}
        />
      </EaWorkspaceColumn>

      {/* ── Contact/status/notes info — a Sheet, not a perpetual column (see EngagementThreadHeader's
           info button) — reclaims the ~244px this used to occupy on every thread view. ── */}
      <Sheet open={contextOpen} onOpenChange={setContextOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0">
          <SheetHeader className="border-b border-[--border-subtle] pb-3">
            <SheetTitle>Thread details</SheetTitle>
          </SheetHeader>
          <div style={{ '--ea-context-w': '100%' } as React.CSSProperties} className="flex-1 min-h-0 overflow-y-auto">
            <EngagementContextPanel
              lead={lead}
              messages={messages}
              threadId={threadId}
              conversationThreadId={propThreadId}
              activeThreadId={threadId}
              onSelectThread={setActiveThreadId}
              onStatus={onStatus}
              onTransfer={onTransfer}
              onRestoreDraft={(body, generatedBy) => { setPendingRestore({ body, generatedBy, stamp: Date.now() }); setContextOpen(false) }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ── Campaign banner ───────────────────────────────────────────────────────────

type CampaignCtx = NonNullable<Lead['campaign_context']>
type Seq = { step_number: number; subject: string | null; body: string | null }

function CampaignBanner({ ctx }: { ctx: CampaignCtx }) {
  const [open,       setOpen]       = useState(false)
  const [seqs,       setSeqs]       = useState<Seq[]>([])
  const [seqsLoading, setSeqsLoading] = useState(false)
  const [seqsLoaded, setSeqsLoaded]  = useState(false)

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !seqsLoaded) {
      setSeqsLoading(true)
      fetch(`/api/campaigns/${ctx.campaign_id}/steps`, { cache: 'no-store' })
        .then(r => r.json())
        .then((data: Seq[]) => setSeqs(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => { setSeqsLoading(false); setSeqsLoaded(true) })
    }
  }

  return (
    <div className="border-b border-[--border-subtle] bg-[--warning-bg]/40 flex-shrink-0">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[--warning-bg]/60 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[--warning] flex-shrink-0" />
          <span className="text-[11px] font-semibold text-[--warning] truncate">
            Campaign: {ctx.campaign_name} · {ctx.product_type}
            {ctx.step_replied_to ? ` · step ${ctx.step_replied_to} replied` : ''}
          </span>
        </div>
        <span className="text-[10px] text-[--warning] flex-shrink-0 ml-2">
          {open ? 'Hide' : 'View emails'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          {seqsLoading && (
            <p className="text-[11.5px] text-muted-foreground m-0">Loading…</p>
          )}
          {!seqsLoading && seqsLoaded && seqs.length === 0 && (
            <p className="text-[11.5px] text-muted-foreground italic m-0">No sequence steps found.</p>
          )}
          {!seqsLoading && seqs.map(seq => (
            <div key={seq.step_number} className="px-3 py-2.5 bg-card rounded-lg border border-[--border-subtle]">
              <p className="text-[11px] font-bold text-[--warning] flex items-center gap-2 m-0 mb-1">
                Step {seq.step_number}{seq.subject ? `: ${seq.subject}` : ''}
                {ctx.step_replied_to === seq.step_number && (
                  <span className="text-[9.5px] bg-[--warning] text-white px-1.5 py-0.5 rounded-[6px]">
                    replied here
                  </span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground leading-[1.55] line-clamp-3 m-0">
                {seq.body || '(empty)'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
