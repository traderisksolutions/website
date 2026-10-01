'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ArrowDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, ThreadState, StoredSummary, RagSource } from './types'
import { fullName, extractEmail, parseAddress } from './helpers'
import { EaWorkspaceColumn, EaMessageArea } from './EaLayout'
import { ThreadHeader } from './ThreadHeader'
import { MessageBlock } from './MessageBlock'
import { ContextRail, loadBoard } from './ContextRail'
import { cleanEmailBody } from '@/lib/clean-email-body'
import { EngagementComposePanel } from '@/components/engagement-agent/engagement-compose-panel'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ThreadAgentBar } from '@/components/engagement/ThreadAgentBar'
import { plainToHtml } from '@/components/RichEditor'
import type { BoardPayload } from '@/lib/crm/board'

/**
 * The message workspace. Header (subject, who, state), the thread in order with the newest
 * message open, a composer that stays folded to one line until asked, and a context rail
 * beside it. The data machinery — party switching, compose addressing, summaries, RFQ
 * detection, Nexus hand-offs — is unchanged from before; only the shape around it is new.
 */

interface ThreadViewProps {
  lead:            Lead
  threadState:     ThreadState
  onStatus:        (id: string, s: string) => void
  onTransfer:      (id: string, note: string) => Promise<void>
  onDelete:        (id: string) => void
  onThreadRefresh: () => void
  onBack?:         () => void
}

const KEY_CONTEXT = 'engagement_context_open'
const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIR = '#e8eaed'

// Reply-All recipients = the To+CC of the message being replied to (the latest one). We KEEP
// internal @trade-risksol.com colleagues and only drop: whoever's already in the To field,
// automated addresses, and the shared operations@ mailbox (the send route auto-adds that itself).
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

export function ThreadView({ lead, threadState, onStatus, onTransfer, onDelete, onThreadRefresh, onBack }: ThreadViewProps) {
  const initialMsg = lead.details || lead.message

  const [summaries,        setSummaries]        = useState<StoredSummary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(false)
  const [analyzing,        setAnalyzing]        = useState(false)
  const [ragDraft]                              = useState<{ content: string; sources: RagSource[] } | null>(null)
  const [rfqContext, setRfqContext] = useState<{ is_insurer_rfq: boolean; case_id?: string | null; insurer_name?: string | null; insured?: string | null } | null>(null)

  // Context rail: a 340px column from 1024px up, a sheet below that. Closed by default and
  // remembered per browser, so the message keeps its measure until someone asks for context.
  const [wide, setWide] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => {
      setWide(mq.matches)
      try { const v = localStorage.getItem(KEY_CONTEXT); setContextOpen(v === '1' && mq.matches) } catch { setContextOpen(false) }
    }
    on(); mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const toggleContext = () => setContextOpen(v => { try { localStorage.setItem(KEY_CONTEXT, v ? '0' : '1') } catch {}; return !v })

  // Composer: one line until asked
  const [composerOpen, setComposerOpen] = useState(false)

  // ── Thread scroll region ─────────────────────────────────────────────────────────────────
  const messageAreaRef = useRef<HTMLDivElement>(null)
  const [showScrollToLatest, setShowScrollToLatest] = useState(false)
  const [headerElevated, setHeaderElevated] = useState(false)
  const scrolledInitRef = useRef<string | null>(null)
  const pendingSendScrollRef = useRef(false)

  const latestRef = useRef<HTMLDivElement>(null)
  // The composer is the last block inside the same scroll region as the messages, so reading
  // back up carries it off the bottom of the pane and returns the full width to the thread.
  const composerRef = useRef<HTMLDivElement>(null)
  const [composerOffscreen, setComposerOffscreen] = useState(false)
  // True while the view should keep the foot of the composer in sight: set when the composer is
  // opened or jumped back to, cleared the moment the reader scrolls up to read the thread.
  const stickBottomRef = useRef(false)

  // "Latest" means the top of the newest message, so its sender and time are in view even when
  // the message is long.
  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = messageAreaRef.current
    if (!el) return
    const top = latestRef.current ? Math.max(0, latestRef.current.offsetTop - 12) : el.scrollHeight
    el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
  }, [])
  // The end of the scroll region is the foot of the composer.
  const scrollToComposer = useCallback((smooth: boolean) => {
    const el = messageAreaRef.current
    if (!el) return
    stickBottomRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])
  const syncScrollAffordances = useCallback(() => {
    const el = messageAreaRef.current
    if (!el) return
    const latestTop = latestRef.current ? latestRef.current.offsetTop - 12 : el.scrollHeight - el.clientHeight
    setShowScrollToLatest(Math.abs(el.scrollTop - latestTop) > 160 && el.scrollHeight > el.clientHeight + 160)
    // Distance from the true bottom. Once most of the composer has gone past the fold the reader
    // needs a way back to it; while it is still largely in view the pill would be noise.
    const fromBottom = el.scrollHeight - el.clientHeight - el.scrollTop
    const composerH = composerRef.current?.offsetHeight ?? 0
    setComposerOffscreen(composerH > 0 && fromBottom > Math.max(120, composerH * 0.6))
    setHeaderElevated(el.scrollTop > 4)
  }, [])
  function handleMessageAreaScroll() { syncScrollAffordances() }

  // ── Party switcher ───────────────────────────────────────────────────────────────────────
  const propThreadId = threadState.thread?.id ?? null
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [overrideState,  setOverrideState]  = useState<ThreadState | null>(null)
  const [refreshNonce,   setRefreshNonce]   = useState(0)
  const isOverriding  = !!activeThreadId && activeThreadId !== propThreadId
  const effectiveState = isOverriding && overrideState ? overrideState : threadState
  const { thread, messages, loading, error } = effectiveState
  const lastDirection = messages.at(-1)?.direction ?? lead.lastDirection ?? null
  const needsReply = lastDirection === 'inbound'

  // Compose headers
  const [toAddress,     setToAddress]     = useState('')
  const [ccList,        setCcList]        = useState<string[]>([])
  const [bccList,       setBccList]       = useState<string[]>([])
  const [customSubject, setCustomSubject] = useState('')
  const [replyAll,      setReplyAll]      = useState(true)
  const initedThreadRef = useRef<string | null>(null)
  const [pendingRestore, setPendingRestore] = useState<{ body: string; generatedBy: string; stamp: number } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const threadId        = thread?.id ?? null
  const latestMessageId = messages.at(-1)?.id ?? null
  const log             = useAuditLog()

  // Owner name for the header, from the same board the context rail reads.
  const [board, setBoard] = useState<BoardPayload | null>(null)
  const [taskRefresh, setTaskRefresh] = useState(0)
  useEffect(() => { loadBoard().then(setBoard).catch(() => {}) }, [taskRefresh])
  const ownerName = useMemo(() => {
    const c = board?.companies.find(x => x.id === lead.companyId)
    if (!c?.owner_email) return null
    return board?.staff.find(s => s.email === c.owner_email)?.name ?? c.owner_email.split('@')[0]
  }, [board, lead.companyId])

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

  // Reset per-lead state when switching leads
  useEffect(() => {
    initedThreadRef.current = null
    setActiveThreadId(null); setOverrideState(null); setAnalyzing(false); setReplyAll(true); setComposerOpen(false); setTaskDone(null)
    const s = threadState.thread?.subject ?? ''
    setCustomSubject(s ? (s.startsWith('Re:') ? s : `Re: ${s}`) : 'Re: Your enquiry | Trade Risk Solutions')
    setToAddress(lead.email ?? ''); setCcList([]); setBccList([]); setSummaries([])
  }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise TO/CC/subject from the active thread's messages
  useEffect(() => {
    if (messages.length === 0) return
    if (initedThreadRef.current === threadId) return
    initedThreadRef.current = threadId
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
    let toGuess = lastInbound?.from_address ? extractEmail(lastInbound.from_address) : ''
    if (!toGuess) { const lastOutbound = [...messages].reverse().find(m => m.direction === 'outbound'); if (lastOutbound?.to?.[0]) toGuess = extractEmail(lastOutbound.to[0]) }
    if (toGuess) setToAddress(toGuess)
    if (thread?.subject) { const s = thread.subject; setCustomSubject(s.startsWith('Re:') ? s : `Re: ${s}`) }
    setCcList(replyAll ? computeReplyAllCcs(messages, toGuess || toAddress) : [])
  }, [threadId, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function setReplyMode(all: boolean) { setReplyAll(all); setCcList(all ? computeReplyAllCcs(messages, toAddress) : []) }
  function toggleReplyAll() { setReplyMode(!replyAll) }
  function openComposer(all?: boolean) { if (all !== undefined) setReplyMode(all); stickBottomRef.current = true; setComposerOpen(true); window.setTimeout(() => scrollToComposer(true), 50) }

  // "r" opens the reply field (the kbd hint on it); ignored while typing or while a dialog is open.
  useEffect(() => {
    if (composerOpen || loading) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'r' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return
      e.preventDefault(); openComposer()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [composerOpen, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only the reader's own scrolling releases the anchor. A scroll event alone is not enough:
  // the composer keeps growing as it settles, which moves the bottom without anyone touching it.
  useEffect(() => {
    const el = messageAreaRef.current
    if (!el) return
    const release = () => { stickBottomRef.current = false }
    const onKey = (e: KeyboardEvent) => { if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) release() }
    el.addEventListener('wheel', release, { passive: true })
    el.addEventListener('touchmove', release, { passive: true })
    el.addEventListener('keydown', onKey)
    return () => { el.removeEventListener('wheel', release); el.removeEventListener('touchmove', release); el.removeEventListener('keydown', onKey) }
  }, [])

  // The composer mounts and settles asynchronously (Quill, the draft fetch, toolbar wrapping), so
  // a single scroll-to-bottom on open lands short. Follow its height until the reader scrolls up.
  useEffect(() => {
    const node = composerRef.current, el = messageAreaRef.current
    if (!node || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (stickBottomRef.current) el.scrollTo({ top: el.scrollHeight })
      syncScrollAffordances()
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [composerOpen, loading, syncScrollAffordances])

  function handleThreadRefresh() { pendingSendScrollRef.current = true; onThreadRefresh(); if (isOverriding) setRefreshNonce(n => n + 1) }

  // Auto-scroll: to the newest message once a thread first loads, and after a send.
  useEffect(() => {
    if (loading || !threadId) return
    if (pendingSendScrollRef.current) { pendingSendScrollRef.current = false; scrollToBottom(true); return }
    if (scrolledInitRef.current !== threadId) { scrolledInitRef.current = threadId; scrollToBottom(false) }
  }, [threadId, loading, messages.length, scrollToBottom])

  // Existing summary on thread change (display only — never generates).
  useEffect(() => {
    setSummaries([])
    if (!threadId) return
    setSummariesLoading(true)
    fetch(`/api/engagement/thread-summaries?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => r.json()).then(data => setSummaries(Array.isArray(data) ? data : [])).catch(() => setSummaries([])).finally(() => setSummariesLoading(false))
    log({ action: 'thread.viewed', resource_type: 'thread', resource_id: threadId, metadata: { contact: lead.email, subject: lead.subject } })
  }, [threadId, lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setRfqContext(null)
    if (!threadId) return
    fetch(`/api/nexus/rfq/thread-context?thread_id=${threadId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => setRfqContext(d)).catch(() => {})
  }, [threadId])

  // Pending reply handed over from a Nexus roadmap step
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
      setComposerOpen(true)
    } catch { /* ignore */ }
  }, [threadId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete() {
    setDeleting(true)
    try { if (threadId) await fetch(`/api/engagement/thread?thread_id=${encodeURIComponent(threadId)}`, { method: 'DELETE' }); onDelete(lead.id) }
    finally { setDeleting(false) }
  }

  async function runAnalysis(): Promise<void> {
    if (!threadId) return
    setAnalyzing(true)
    try { await fetch('/api/engagement/refresh-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: threadId, message_id: latestMessageId }) }) } catch { /* ignore */ }
    try { const data = await fetch(`/api/engagement/thread-summaries?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' }).then(r => r.json()); setSummaries(Array.isArray(data) ? data : []) } catch { setSummaries([]) }
    finally { setAnalyzing(false) }
  }

  // ── Task from email ──────────────────────────────────────────────────────────────────────
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskDone, setTaskDone] = useState<{ id: string; text: string } | null>(null)
  async function undoTask() { if (!taskDone) return; await fetch(`/api/board/tasks/${taskDone.id}`, { method: 'DELETE' }).catch(() => {}); setTaskDone(null); setTaskRefresh(n => n + 1) }

  // A sender who appears only once in this thread and is not the contact on file.
  const senderCounts = useMemo(() => { const m = new Map<string, number>(); for (const x of messages) if (x.direction === 'inbound') { const e = parseAddress(x.from_address).email; if (e) m.set(e, (m.get(e) ?? 0) + 1) } return m }, [messages])
  const isNewSender = (m: RealMsg) => m.direction === 'inbound' && (() => { const e = parseAddress(m.from_address).email; return !!e && e !== (lead.email ?? '').toLowerCase() && (senderCounts.get(e) ?? 0) === 1 && messages.length > 1 })()

  const contactName = fullName(lead)
  // The raw From header often carries only the address; the thread knows the person's name.
  const nameFor = (m: RealMsg) => { const e = parseAddress(m.from_address).email?.toLowerCase(); return e && lead.email && e === lead.email.toLowerCase() ? (contactName || null) : null }
  const replyLabel = `Reply to ${contactName || lead.email || 'the client'}…`

  const rail = (
    <ContextRail lead={lead} messages={messages} threadId={threadId} conversationThreadId={propThreadId} activeThreadId={threadId}
      onSelectThread={setActiveThreadId} onStatus={onStatus} onTransfer={onTransfer}
      onRestoreDraft={(body, generatedBy) => { setPendingRestore({ body, generatedBy, stamp: Date.now() }); setComposerOpen(true) }}
      summaries={summaries} summariesLoading={summariesLoading || analyzing} latestMessageId={latestMessageId} ragSources={ragDraft?.sources ?? []}
      onRefreshSummaries={() => void runAnalysis()} taskRefresh={taskRefresh} onClose={toggleContext} onAddTask={() => setTaskOpen(true)} />
  )
  const measure = 'max-w-[min(1040px,100%)] mx-auto'
  const latestMsg = messages.at(-1) ?? null
  const earlier = messages.slice(0, -1).reverse()

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden bg-white" style={{ color: INK }}>
      <EaWorkspaceColumn className="relative">
        <ThreadHeader subject={thread?.subject ?? lead.subject ?? lead.topic ?? null} lead={lead} needsReply={needsReply} lastDirection={lastDirection} ownerName={ownerName}
          elevated={headerElevated} onBack={onBack} onReply={() => openComposer(false)} onReplyAll={() => openComposer(true)} onAddTask={() => setTaskOpen(true)}
          onDelete={handleDelete} deleting={deleting} contextOpen={contextOpen} onToggleContext={toggleContext} />

        {taskDone && (
          <div className="flex-shrink-0 px-5 sm:px-10 py-2.5 text-[13px]" style={{ background: '#f1f3f4', borderBottom: `1px solid ${HAIR}`, color: BODY }} role="status">
            <div className={cn(measure, 'flex items-center justify-between gap-3')}>
              <span>{taskDone.text}</span>
              <span className="flex items-center gap-3"><button type="button" onClick={() => void undoTask()} className="underline underline-offset-[3px] decoration-[#9aa0a6] bg-transparent border-0 p-0 cursor-pointer" style={{ color: INK }}>Undo</button><button type="button" onClick={() => setTaskDone(null)} aria-label="Dismiss" title="Dismiss" className="w-7 h-7 inline-flex items-center justify-center rounded-[8px] bg-transparent border-0 cursor-pointer hover:bg-white" style={{ color: MUTED }}><X size={13} /></button></span>
            </div>
          </div>
        )}

        {(lead.campaign_context || rfqContext?.is_insurer_rfq) && (
          <div className="flex-shrink-0 px-5 sm:px-10 py-2 text-[12.5px]" style={{ borderBottom: `1px solid ${HAIR}`, color: MUTED }}>
            <div className={cn(measure, 'flex flex-col gap-1')}>
              {lead.campaign_context && (
                <p className="m-0">Outreach campaign · {lead.campaign_context.campaign_name} · {lead.campaign_context.product_type}{lead.campaign_context.step_replied_to ? ` · replied at step ${lead.campaign_context.step_replied_to}` : ''}</p>
              )}
              {rfqContext?.is_insurer_rfq && (
                <p className="m-0 flex items-center justify-between gap-3">
                  <span>Insurer quotation · {rfqContext.insurer_name ?? 'Insurer'}{rfqContext.insured ? ` · ${rfqContext.insured}` : ''}</span>
                  {rfqContext.case_id && <a href={`/nexus?case=${rfqContext.case_id}`} className="flex-shrink-0 no-underline hover:underline underline-offset-[3px] decoration-[#9aa0a6]" style={{ color: INK }}>Open the case</a>}
                </p>
              )}
            </div>
          </div>
        )}

        {/* One scroll region. Messages, then the composer as the last block in the same flow —
            so it rests at the foot of the pane and scrolls away when you read back up. */}
        <div className="relative flex-1 min-h-0 flex flex-col">
          <EaMessageArea ref={messageAreaRef} onScroll={handleMessageAreaScroll} data-thread-scroll>
            <div className="min-h-full flex flex-col">
              {/* flex-1 pushes the composer to the foot of the pane on short threads */}
              <div className="flex-1 px-5 sm:px-10 pt-2 pb-8">
                <div className={measure}>
                  {loading && <p className="py-16 text-center text-[15px] m-0" style={{ color: MUTED }}>Loading the thread…</p>}
                  {!loading && error && <p className="py-16 text-center text-[15px] m-0" style={{ color: BODY }}>{error}</p>}
                  {!loading && !error && messages.length === 0 && (
                    <div className="py-10">
                      <p className="m-0 text-center text-[15px]" style={{ color: MUTED }}>No email thread on file for {lead.email ?? 'this contact'}.</p>
                      {initialMsg && (
                        <div className="mt-6 rounded-[14px] px-5 py-4" style={{ background: '#f1f3f4' }}>
                          <p className="m-0 mb-1.5 text-[12px]" style={{ color: MUTED }}>Enquiry form message</p>
                          <p className="m-0 text-[15px] whitespace-pre-wrap leading-[1.6]" style={{ color: INK }}>{cleanEmailBody(initialMsg)}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {!loading && latestMsg && (
                    <div ref={latestRef}>
                      <MessageBlock key={latestMsg.id} msg={latestMsg} defaultOpen isLatest newSender={isNewSender(latestMsg)} senderName={nameFor(latestMsg)} />
                    </div>
                  )}
                  {!loading && earlier.length > 0 && (
                    <section className="mt-7" style={{ borderTop: `1px solid ${HAIR}` }} aria-label="Earlier messages">
                      {earlier.map(msg => <MessageBlock key={msg.id} msg={msg} defaultOpen={false} newSender={isNewSender(msg)} senderName={nameFor(msg)} />)}
                    </section>
                  )}
                </div>
              </div>

              {/* The agent's read of the thread, above the composer and separate from it: the
                  composer owns the editor and the send path, and must not gain a second writer. */}
              {!loading && thread?.id && (
                <ThreadAgentBar
                  threadId={thread.id}
                  onDraft={body => {
                    // Same path a restored draft takes, so the editor, the saved draft row and
                    // the send flow are untouched by this.
                    setPendingRestore({ body: plainToHtml(body), generatedBy: 'crm_agent', stamp: Date.now() })
                    setComposerOpen(true)
                  }}
                />
              )}

              {/* Composer: one line until asked, the full panel once open. Same layer as the thread. */}
              {!loading && (
                <div ref={composerRef} data-composer className="flex-shrink-0 bg-white" style={{ borderTop: `1px solid ${HAIR}` }}>
                  {composerOpen ? (
                    <EngagementComposePanel lead={lead} thread={thread} messages={messages} toAddress={toAddress} ccList={ccList} bccList={bccList} customSubject={customSubject}
                      setToAddress={setToAddress} setCcList={setCcList} setBccList={setBccList} setCustomSubject={setCustomSubject} replyAll={replyAll} onToggleReplyAll={toggleReplyAll}
                      storedDraft={summaries[0]?.draft_reply ?? null} storedRagDraft={ragDraft?.content ?? null} storedRagSources={ragDraft?.sources ?? []}
                      onThreadRefresh={handleThreadRefresh} onAnalyze={runAnalysis} pendingRestore={pendingRestore} onMinimise={() => setComposerOpen(false)}
                      onHeightChange={syncScrollAffordances} />
                  ) : (
                    <div className="px-5 sm:px-10 py-3.5">
                      <button type="button" onClick={() => openComposer()} aria-label={replyLabel} className={cn(measure, 'w-full h-12 px-4 rounded-[12px] flex items-center text-left text-[15px] bg-white cursor-text hover:border-[#9aa0a6] focus-visible:outline-none focus-visible:border-[#202124]')} style={{ border: '1px solid #dadce0', color: FAINT }}>
                        <span className="truncate">{replyLabel}</span>
                        <kbd className="ml-auto flex-shrink-0 text-[11px] font-[inherit] rounded-[6px] px-1.5 py-px" style={{ border: '1px solid #dadce0', color: '#9aa0a6' }} aria-hidden>r</kbd>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </EaMessageArea>

          {/* One affordance back down: the draft while it is open, the newest message otherwise. */}
          {!loading && composerOpen && composerOffscreen ? (
            <button type="button" onClick={() => scrollToComposer(true)} className="absolute bottom-4 right-6 z-10 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white text-[12.5px] font-medium cursor-pointer" style={{ border: '1px solid #dadce0', color: INK }}>
              <ArrowDown size={13} /> Draft
            </button>
          ) : !composerOpen && showScrollToLatest ? (
            <button type="button" onClick={() => scrollToBottom(true)} className="absolute bottom-4 right-6 z-10 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white text-[12.5px] font-medium cursor-pointer" style={{ border: '1px solid #dadce0', color: INK }}>
              <ArrowDown size={13} /> Latest message
            </button>
          ) : null}
        </div>

      </EaWorkspaceColumn>

      {/* Context rail: a column from 1024px up, a sheet below */}
      {wide ? (contextOpen && <div className="flex-shrink-0 h-full" style={{ width: 340 }}>{rail}</div>) : (
        <Sheet open={contextOpen} onOpenChange={o => { if (!o) toggleContext() }}>
          <SheetContent side="right" className="w-full sm:max-w-[380px] p-0 flex flex-col" showCloseButton={false}>
            <SheetHeader className="sr-only"><SheetTitle>Context</SheetTitle></SheetHeader>
            <div className="flex-1 min-h-0">{rail}</div>
          </SheetContent>
        </Sheet>
      )}

      {taskOpen && (
        <TaskFromEmail lead={lead} board={board} subject={thread?.subject ?? lead.subject ?? null} onClose={() => setTaskOpen(false)}
          onCreated={(id, text) => { setTaskOpen(false); setTaskDone({ id, text }); setTaskRefresh(n => n + 1) }} />
      )}
    </div>
  )
}

/** To-do from email: title prefilled from the subject, owner, due date, note. */
function TaskFromEmail({ lead, board, subject, onClose, onCreated }: { lead: Lead; board: BoardPayload | null; subject: string | null; onClose: () => void; onCreated: (id: string, text: string) => void }) {
  const [title, setTitle] = useState(subject ? `Follow up: ${subject.replace(/^(re|fwd?):\s*/i, '')}` : '')
  const [who, setWho] = useState(board?.me ?? '')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const inp = 'h-10 w-full rounded-[10px] bg-white px-3.5 text-[14px] outline-none focus:border-[#202124]'
  const lbl = 'flex flex-col gap-1 text-[12.5px]'
  async function go() {
    if (!lead.companyId) { setErr('Link this thread to a company first.'); return }
    if (!title.trim()) { setErr('Give the to-do a title.'); return }
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/board/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: lead.companyId, title: title.trim(), note: note || null, dueOn: due || null, primaryAssignee: who || null, status: 'open', priority: 'medium' }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not save')
      const whoName = board?.staff.find(s => s.email === who)?.name ?? null
      onCreated(d.task.id, ['To-do created', due ? `Due ${new Date(due).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}` : null, whoName ? `Assigned to ${whoName}` : null].filter(Boolean).join(' · '))
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" style={{ background: 'rgba(32,33,36,0.4)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="task-from-email" className="w-full max-w-[520px] rounded-[16px] bg-white p-6" style={{ border: `1px solid ${HAIR}`, boxShadow: '0 16px 40px rgba(32,33,36,0.14)', color: INK }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div><h2 id="task-from-email" className="m-0 text-[18px] font-medium tracking-[-0.01em]">New to-do</h2><p className="m-0 mt-0.5 text-[13px]" style={{ color: MUTED }}>{lead.companyName ? `For ${lead.companyName}` : 'This thread is not linked to a company yet'}</p></div>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-[10px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <label className={lbl} style={{ color: MUTED }}>Title<input autoFocus value={title} onChange={e => setTitle(e.target.value)} className={inp} style={{ border: '1px solid #dadce0', color: INK }} onKeyDown={e => { if (e.key === 'Enter') void go() }} /></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={lbl} style={{ color: MUTED }}>Owner<select value={who} onChange={e => setWho(e.target.value)} className={inp} style={{ border: '1px solid #dadce0', color: INK }}><option value="">No one yet</option>{(board?.staff ?? []).map(s => <option key={s.email} value={s.email}>{s.name}</option>)}</select></label>
            <label className={lbl} style={{ color: MUTED }}>Due date<input type="date" value={due} onChange={e => setDue(e.target.value)} className={inp} style={{ border: '1px solid #dadce0', color: INK }} /></label>
          </div>
          <label className={lbl} style={{ color: MUTED }}>Internal note<textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="rounded-[10px] bg-white px-3.5 py-2 text-[14px] outline-none focus:border-[#202124] resize-y" style={{ border: '1px solid #dadce0', color: INK }} /></label>
        </div>
        {err && <p className="m-0 mt-3 text-[13px]" style={{ color: BODY }} role="alert">{err}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-[10px] text-[14px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: INK }}>Cancel</button>
          <button type="button" onClick={() => void go()} disabled={busy} className="h-10 px-4 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer hover:opacity-90 disabled:opacity-50" style={{ background: INK }}>{busy ? 'Saving…' : 'Create to-do'}</button>
        </div>
      </div>
    </div>
  )
}
