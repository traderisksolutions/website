'use client'

import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Trash2, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/Tip'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, ThreadState, StoredSummary, RagSource } from './types'
import { STATUS_MAP } from './types'
import { fullName, timeAgo, extractEmail } from './helpers'
import { MessageCard } from './MessageCard'
import { ComposePanel } from './ComposePanel'
import { ContextPanel } from './ContextPanel'

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
  const st         = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted
  const needsReply = messages.at(-1)?.direction === 'inbound'
  const initialMsg = lead.details || lead.message

  // Summaries
  const [summaries,        setSummaries]        = useState<StoredSummary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(false)

  // RAG draft
  const [ragDraft,         setRagDraft]         = useState<{ content: string; sources: RagSource[] } | null>(null)

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
    toInitialised.current = false
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

  // Load summaries + RAG draft when thread changes
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

    fetch(`/api/engagement/draft-rag?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { if (data?.content) setRagDraft({ content: data.content, sources: data.sources ?? [] }) })
      .catch(() => {})

    log({
      action: 'thread.viewed', resource_type: 'thread', resource_id: threadId,
      metadata: { contact: lead.email, subject: lead.subject },
    })
  }, [threadId, lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function refreshSummaries() {
    if (!threadId) return
    setSummariesLoading(true)
    fetch(`/api/engagement/thread-summaries?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setSummaries(Array.isArray(data) ? data : []))
      .catch(() => setSummaries([]))
      .finally(() => setSummariesLoading(false))
  }

  // Auto-expand: last message + last inbound message
  const lastInboundIdx = messages.reduce((found, m, i) => m.direction === 'inbound' ? i : found, -1)

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden">

      {/* ── Center pane ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">

        {/* Thread header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-[--border-subtle] bg-card">
          {onBack && (
            <button
              onClick={onBack}
              className="lg:hidden flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2.5"
            >
              <ArrowLeft size={12} strokeWidth={2} />
              All conversations
            </button>
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-[14.5px] font-bold text-foreground tracking-tight leading-snug m-0">
                  {thread?.subject ?? lead.subject ?? lead.topic ?? fullName(lead)}
                </h1>
                {needsReply && (
                  <>
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-[--warning-bg] text-[--warning] border border-[--warning-border]">
                      Needs reply
                    </span>
                    <Tip text="The last email was from the contact — they are waiting for your response." />
                  </>
                )}
              </div>
              <p className="text-[11.5px] text-muted-foreground m-0">
                {fullName(lead)}
                {lead.email && ` · ${lead.email}`}
                {lead.company && ` · ${lead.company}`}
                {messages.length > 0 && (
                  <span className="ml-1.5 text-[10.5px] bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
                    {messages.length} email{messages.length !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: st.bg, color: st.color }}
              >
                {st.label}
              </span>
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[--error]">Delete?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-[11px] font-semibold text-white bg-[--error] rounded-md px-2.5 py-1 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[11px] text-muted-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDelete}
                  title="Delete thread"
                  className="p-1.5 text-muted-foreground/40 hover:text-[--error] rounded-md transition-colors"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Messages scroll region ── */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-background">

          {/* Campaign banner */}
          {lead.campaign_context && (
            <CampaignBanner ctx={lead.campaign_context} />
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
                      {initialMsg}
                    </p>
                  </div>
                )}
              </div>
            )}
            {!loading && messages.map((msg, i) => (
              <MessageCard
                key={msg.id}
                msg={msg}
                defaultOpen={i === messages.length - 1 || i === lastInboundIdx}
              />
            ))}
          </div>
        </div>

        {/* ── Compose panel (fixed at bottom) ── */}
        <ComposePanel
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
          pendingRestore={pendingRestore}
        />
      </div>

      {/* ── Right context panel ── */}
      <ContextPanel
        lead={lead}
        messages={messages}
        threadId={threadId}
        summaries={summaries}
        summariesLoading={summariesLoading}
        latestMessageId={latestMessageId}
        onStatus={onStatus}
        onTransfer={onTransfer}
        onRefreshSummary={refreshSummaries}
        onRestoreDraft={(body, generatedBy) => setPendingRestore({ body, generatedBy, stamp: Date.now() })}
      />
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
