'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, ThreadState, StoredSummary, RagSource } from './types'
import { fullName, extractEmail } from './helpers'
import { EaWorkspaceColumn, EaMessageArea } from './EaLayout'
import { EngagementThreadHeader } from '@/components/engagement-agent/engagement-thread-header'
import { AddToCaseControl } from '@/components/engagement/AddToCaseControl'
import { EngagementMessageCard } from '@/components/engagement-agent/engagement-message-card'
import { cleanEmailBody } from '@/lib/clean-email-body'
import { EngagementComposePanel } from '@/components/engagement-agent/engagement-compose-panel'
import { EngagementContextPanel } from '@/components/engagement-agent/engagement-context-panel'
import { AiAnalysisPanel } from '@/components/engagement-agent/ai-analysis-panel'
import { EngagementDock } from './EngagementDock'
import ThreadRfqWorkflow from './ThreadRfqWorkflow'

interface ThreadViewProps {
  lead:            Lead
  threadState:     ThreadState
  onStatus:        (id: string, s: string) => void
  onTransfer:      (id: string, note: string) => Promise<void>
  onDelete:        (id: string) => void
  onThreadRefresh: () => void
  onBack?:         () => void
}

export function ThreadView({
  lead, threadState, onStatus, onTransfer, onDelete, onThreadRefresh, onBack,
}: ThreadViewProps) {
  const { thread, messages, loading, error } = threadState
  const needsReply = messages.at(-1)?.direction === 'inbound'
  const initialMsg = lead.details || lead.message

  // Summaries
  const [summaries,        setSummaries]        = useState<StoredSummary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(false)
  const [analyzing,        setAnalyzing]        = useState(false)

  // RAG draft
  const [ragDraft,         setRagDraft]         = useState<{ content: string; sources: RagSource[] } | null>(null)

  // Right context sidebar collapse
  const [contextOpen,      setContextOpen]      = useState(true)

  // RFQ context — is this thread an insurer's quotation conversation?
  const [rfqContext, setRfqContext] = useState<{ is_insurer_rfq: boolean; case_id?: string | null; insurer_name?: string | null; insured?: string | null } | null>(null)

  // Dock imperative open (e.g. a draft arriving from a Nexus roadmap step)
  const [dockSignal, setDockSignal] = useState<{ tab: 'reply' | 'analysis' | 'rfq'; stamp: number } | undefined>(undefined)

  // Compose headers
  const [toAddress,     setToAddress]     = useState('')
  const [ccList,        setCcList]        = useState<string[]>([])
  const [bccList,       setBccList]       = useState<string[]>([])
  const [customSubject, setCustomSubject] = useState('')
  const toInitialised = useRef(false)

  // Restore draft from history
  const [pendingRestore, setPendingRestore] = useState<{ body: string; generatedBy: string; stamp: number } | null>(null)

  // Delete confirm
  const [deleting,       setDeleting]      = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)

  const threadId        = thread?.id ?? null
  const latestMessageId = messages.at(-1)?.id ?? null
  const log             = useAuditLog()

  // Reset per-lead state when switching leads
  useEffect(() => {
    toInitialised.current      = false
    setAnalyzing(false)
    const s = thread?.subject ?? ''
    setCustomSubject(s ? (s.startsWith('Re:') ? s : `Re: ${s}`) : 'Re: Your enquiry | Trade Risk Solutions')
    setToAddress(lead.email ?? '')
    setCcList([])
    setBccList([])
    setSummaries([])
    setRagDraft(null)
  }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once per lead: initialise TO/CC from first loaded messages (never re-runs on poll)
  useEffect(() => {
    if (toInitialised.current || messages.length === 0) return
    toInitialised.current = true

    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
    if (lastInbound?.from_address) {
      setToAddress(extractEmail(lastInbound.from_address))
    }
    if (thread?.subject) {
      const s = thread.subject
      setCustomSubject(s.startsWith('Re:') ? s : `Re: ${s}`)
    }
    const inboundCcs = lastInbound?.cc ?? []
    const ccs = inboundCcs
      .map(a => extractEmail(a))
      .filter(a => a && !a.endsWith('@trade-risksol.com') && !a.includes('noreply') && !a.includes('no-reply') && !a.includes('mailer-daemon'))
    if (ccs.length > 0) setCcList(Array.from(new Set(ccs)))
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // load it into Reply and open the dock's Reply tab.
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
      setDockSignal({ tab: 'reply', stamp: Date.now() })
    } catch { /* ignore */ }
  }, [threadId])

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
        />

        {/* Only offer "Add to Nexus case" when the thread isn't already in one —
            an insurer RFQ thread already belongs to its case (shown by the banner
            below), so the two would otherwise contradict each other. */}
        {!rfqContext?.case_id && <AddToCaseControl threadId={threadId} />}

        {/* ── Messages scroll region ── */}
        <EaMessageArea>

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

          <div className="flex flex-col gap-4 p-5">
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
              <div className="flex flex-col gap-4 py-8">
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
              />
            ))}
          </div>
        </EaMessageArea>

        {/* ── Bottom dock: Reply · AI Analysis · RFQ ── */}
        <EngagementDock
          reply={
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
              storedDraft={summaries[0]?.draft_reply ?? null}
              storedRagDraft={ragDraft?.content ?? null}
              storedRagSources={ragDraft?.sources ?? []}
              onThreadRefresh={onThreadRefresh}
              onAnalyze={runAnalysis}
              pendingRestore={pendingRestore}
            />
          }
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
          openSignal={dockSignal}
        />
      </EaWorkspaceColumn>

      {/* ── Right context panel (collapsible) ── */}
      {contextOpen ? (
        <EngagementContextPanel
          lead={lead}
          messages={messages}
          threadId={threadId}
          onStatus={onStatus}
          onTransfer={onTransfer}
          onRestoreDraft={(body, generatedBy) => setPendingRestore({ body, generatedBy, stamp: Date.now() })}
          onCollapse={() => setContextOpen(false)}
        />
      ) : (
        <button
          onClick={() => setContextOpen(true)}
          title="Show details"
          className="flex-shrink-0 w-7 border-l border-[--border-subtle] bg-card flex items-start justify-center pt-3 text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
      )}
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
                  <span className="text-[9.5px] bg-[--warning] text-white px-1.5 py-0.5 rounded-full">
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
