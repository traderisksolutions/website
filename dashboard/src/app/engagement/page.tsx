'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Search, RefreshCw, ChevronDown, Copy, Check, X, Calendar, ArrowUpDown, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useAuditLog } from '@/hooks/useAuditLog'

// ── Types ─────────────────────────────────────────────────────────────────────

type Lead = {
  id: string; created_at: string; source: string
  first_name: string | null; last_name: string | null
  email: string | null; phone: string | null; company: string | null
  department: string | null; contact_type: string | null
  topic: string | null; details: string | null; message: string | null
  page_url: string | null; status: string
  subject?: string | null
  thread_id?: string | null
}

type RealMsg = {
  id: string
  direction: 'inbound' | 'outbound'
  from_address: string | null
  subject: string | null
  body_text: string | null
  sent_at: string | null
  to: string[]
  cc: string[]
}

type ThreadState = {
  loading: boolean
  thread:  { id: string; subject: string | null; status: string; last_message_at: string | null; message_count: number } | null
  messages: RealMsg[]
  error:    string | null
}

type StoredSummary = {
  id:          string
  summary:     string | null
  next_action: string | null
  draft_reply: string | null
  created_at:  string
}

type SortKey = 'last_activity' | 'newest' | 'oldest'

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGAGED_STATUSES = new Set(['contacted', 'engaged', 'qualified', 'proposal', 'converted'])
const EMAIL_SOURCES    = new Set(['website_form', 'email', 'manual'])

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  contacted: { label: 'Contacted', color: '#b45309', bg: 'rgba(245,158,11,0.10)'  },
  engaged:   { label: 'Engaged',   color: '#2563eb', bg: 'rgba(37,99,235,0.10)'   },
  qualified: { label: 'Qualified', color: '#7c3aed', bg: 'rgba(124,58,237,0.10)'  },
  proposal:  { label: 'Proposal',  color: '#d97706', bg: 'rgba(217,119,6,0.10)'   },
  converted: { label: 'Converted', color: '#059669', bg: 'rgba(5,150,105,0.10)'   },
  dropped:   { label: 'Dropped',   color: '#4b5563', bg: 'rgba(107,114,128,0.10)' },
}
const ALL_STATUSES = ['contacted', 'engaged', 'qualified', 'proposal', 'converted', 'dropped']

const TRS_EMAIL = 'hello@trade-risksol.com'

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripQuotedContent(body: string): string {
  const lines = body.split('\n')
  const clean: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (/^-{3,}\s*(Forwarded message|Original Message)\s*-{3,}/i.test(t)) break
    if (/^On .{10,} wrote:\s*$/i.test(t)) break
    if (t.startsWith('>')) continue
    clean.push(line)
  }
  while (clean.length && !clean[clean.length - 1].trim()) clean.pop()
  return clean.some(l => l.trim()) ? clean.join('\n') : body
}

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || '—'
}

function timeAgo(iso: string | null) {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function matchesSearch(lead: Lead, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return [lead.first_name, lead.last_name, lead.email, lead.company, lead.topic, lead.department, lead.details, lead.message, lead.subject]
    .some(v => v?.toLowerCase().includes(lower))
}

function inDateRange(iso: string, from: string, to: string): boolean {
  if (!from && !to) return true
  const d  = new Date(iso).getTime()
  const lo = from ? new Date(from).getTime()           : -Infinity
  const hi = to   ? new Date(to).getTime() + 86399999 :  Infinity
  return d >= lo && d <= hi
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchLeads(): Promise<Lead[]> {
  const [leadsRes, convRes] = await Promise.all([
    fetch('/api/leads', { cache: 'no-store' }),
    fetch('/api/engagement/conversations', { cache: 'no-store' }),
  ])

  const raw: Lead[] = leadsRes.ok ? await leadsRes.json() : []
  const engagedLeads = (Array.isArray(raw) ? raw : [])
    .filter(l => EMAIL_SOURCES.has(l.source) && ENGAGED_STATUSES.has(l.status))

  const convRaw: Lead[] = convRes.ok ? await convRes.json() : []
  const conversations = Array.isArray(convRaw) ? convRaw : []

  const leadEmails = new Set(engagedLeads.map(l => l.email?.toLowerCase()).filter(Boolean))
  const newConversations = conversations.filter(
    c => c.email && !leadEmails.has(c.email.toLowerCase())
  )

  return [...engagedLeads, ...newConversations]
}

async function patchStatus(id: string, status: string) {
  await fetch('/api/leads', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id, status }),
  })
}

async function fetchThread(threadId: string | null, email: string | null): Promise<{ thread: ThreadState['thread']; messages: RealMsg[] }> {
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

// ── Email card ────────────────────────────────────────────────────────────────

function EmailCard({ msg, defaultOpen }: { msg: RealMsg; defaultOpen: boolean }) {
  const [open,     setOpen]     = useState(defaultOpen)
  const [showFull, setShowFull] = useState(false)
  const [copied,   setCopied]   = useState<string | null>(null)
  const isOut = msg.direction === 'outbound'

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 1500)
  }

  const fullBody    = msg.body_text ?? ''
  const stripped    = stripQuotedContent(fullBody)
  const hasMore     = stripped.length < fullBody.trim().length
  const senderLabel = isOut ? TRS_EMAIL : (msg.from_address ?? '—')
  const bodyLines   = stripped.split('\n')

  return (
    <div style={{
      border: isOut ? '1px solid #dbeafe' : '1px solid #eaeaea',
      borderRadius: 10, overflow: 'hidden', background: '#fff',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      marginLeft: isOut ? 40 : 0, marginRight: isOut ? 0 : 40,
    }}>
      <div
        style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(v => !v)}
      >
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          background: isOut ? 'rgba(59,130,246,0.10)' : '#f4f4f5',
          color: isOut ? '#1d4ed8' : '#555',
        }}>
          {isOut ? 'TRS' : (msg.from_address?.[0] ?? '?').toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{senderLabel}</span>
            {isOut && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: 'rgba(34,197,94,0.10)', color: '#15803d' }}>Sent</span>
            )}
            {msg.cc.length > 0 && !open && (
              <span style={{ fontSize: 10, color: '#bbb' }}>CC: {msg.cc.length}</span>
            )}
          </div>
          {!open && (
            <p style={{ margin: 0, fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {bodyLines.find(l => l.trim()) ?? ''}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#bbb' }}>{fmtDateTime(msg.sent_at)}</span>
          <span style={{ fontSize: 11, color: '#ccc' }}>{open ? '▲' : '▽'}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #f0f0f0' }}>
          <div style={{ padding: '10px 14px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[{ lbl: 'From', val: msg.from_address ?? '—' }].map(({ lbl, val }) => (
              <div key={lbl} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>{lbl}</span>
                <span style={{ fontSize: 11, color: '#333' }}>{val}</span>
                <button onClick={() => copy(val)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  {copied === val ? <Check size={10} style={{ color: '#22c55e' }} /> : <Copy size={10} style={{ color: '#ddd' }} />}
                </button>
              </div>
            ))}
            {msg.to.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>To</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {msg.to.map(a => <span key={a} style={{ fontSize: 11, background: '#f0f0f0', color: '#333', padding: '1px 7px', borderRadius: 12 }}>{a}</span>)}
                </div>
              </div>
            )}
            {msg.cc.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>CC</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {msg.cc.map(a => (
                    <span key={a} style={{ fontSize: 11, background: 'rgba(59,130,246,0.08)', color: '#1d4ed8', padding: '1px 7px', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>{a}</span>
                  ))}
                </div>
              </div>
            )}
            {msg.subject && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>Subj</span>
                <span style={{ fontSize: 11, color: '#555' }}>{msg.subject}</span>
              </div>
            )}
          </div>
          <div style={{ padding: '16px 18px 18px', maxHeight: 500, overflowY: 'auto' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
              {showFull ? fullBody : stripped}
            </p>
            {hasMore && (
              <button
                onClick={() => setShowFull(v => !v)}
                style={{ marginTop: 10, fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                {showFull ? 'Hide quoted content' : 'Show full email ↓'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── AI Summary strip ──────────────────────────────────────────────────────────

function StoredSummaryStrip({
  summaries, loading, threadId, latestMessageId, onRefresh,
}: {
  summaries:        StoredSummary[]
  loading:          boolean
  threadId:         string | null
  latestMessageId:  string | null
  onRefresh:        () => void
}) {
  const [open,         setOpen]         = useState(true)
  const [historyOpen,  setHistoryOpen]  = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenErr,     setRegenErr]     = useState<string | null>(null)

  const latest = summaries[0] ?? null
  const older  = summaries.slice(1)

  async function handleRegenerate() {
    if (!threadId || !latestMessageId) return
    setRegenerating(true); setRegenErr(null)
    try {
      const res = await fetch('/api/engagement/refresh-summary', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ thread_id: threadId, message_id: latestMessageId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onRefresh()
    } catch (e) {
      setRegenErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div style={{ borderBottom: '1px solid #e8e8e8', flexShrink: 0, background: '#fafafa' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6' }}>AI Analysis</span>
          {latest && <span style={{ fontSize: 10, color: '#bbb' }}>· {timeAgo(latest.created_at)}</span>}
          {summaries.length > 1 && <span style={{ fontSize: 10, color: '#bbb' }}>· {summaries.length} updates</span>}
          <span style={{ fontSize: 11, color: '#bbb' }}>{open ? '▲' : '▽'}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {regenErr && <span style={{ fontSize: 10, color: '#ef4444' }}>{regenErr}</span>}
          {threadId && latestMessageId && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating || loading}
              style={{ fontSize: 11, color: regenerating ? '#93c5fd' : '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, opacity: (regenerating || loading) ? 0.6 : 1 }}
            >
              <RefreshCw size={11} style={{ animation: regenerating ? 'spin 1s linear infinite' : undefined }} />
              {regenerating ? 'Generating…' : latest ? 'Regenerate' : 'Generate Now'}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 16px 12px' }}>
          {(loading || regenerating) && <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>Analysing thread…</p>}

          {!loading && !regenerating && !latest && (
            <p style={{ margin: 0, fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>
              Click &ldquo;Generate Now&rdquo; to analyse this thread, or it generates automatically on each new email.
            </p>
          )}

          {latest && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#444', lineHeight: 1.65 }}>{latest.summary}</p>

              {latest.next_action && (
                <div style={{ marginBottom: 8, padding: '7px 10px', background: 'rgba(59,130,246,0.06)', borderRadius: 7, borderLeft: '3px solid #3b82f6' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Next action · </span>
                  <span style={{ fontSize: 12, color: '#1d4ed8' }}>{latest.next_action}</span>
                </div>
              )}

              {older.length > 0 && (
                <button
                  onClick={() => setHistoryOpen(v => !v)}
                  style={{ fontSize: 11, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}
                >
                  {historyOpen ? '▲' : '▽'} {older.length} earlier {older.length === 1 ? 'summary' : 'summaries'}
                </button>
              )}

              {historyOpen && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {older.map(s => (
                    <div key={s.id} style={{ padding: '8px 10px', background: '#f0f0f0', borderRadius: 7 }}>
                      <p style={{ margin: '0 0 4px', fontSize: 10, color: '#aaa' }}>{fmtDateTime(s.created_at)}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#666', lineHeight: 1.55 }}>{s.summary}</p>
                      {s.next_action && (
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#888', fontStyle: 'italic' }}>→ {s.next_action}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── AI Draft panel ────────────────────────────────────────────────────────────

function AIDraftPanel({
  lead, thread, messages, storedDraft, summaryId,
}: {
  lead:        Lead
  thread:      ThreadState['thread']
  messages:    RealMsg[]
  storedDraft?: string | null
  summaryId?:  string | null
}) {
  const lastMsg    = messages.at(-1)
  const needsReply = lastMsg?.direction === 'inbound'

  const [draftId,          setDraftId]          = useState<string | null>(null)
  const [content,          setContent]          = useState('')
  const [contentFromStore, setContentFromStore] = useState(false)
  const [loading,          setLoading]          = useState<'gen' | 'send' | 'reject' | null>(null)
  const [sent,             setSent]             = useState(false)
  const [rejected,         setRejected]         = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [savedAt,          setSavedAt]          = useState<string | null>(null)
  const [manualMode,       setManualMode]       = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDraftId(null); setContent(''); setContentFromStore(false)
    setSent(false); setRejected(false); setError(null); setSavedAt(null); setManualMode(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [lead.id])

  useEffect(() => {
    if (storedDraft && !contentFromStore && !sent && !rejected) {
      setContent(storedDraft)
      setContentFromStore(true)
    }
  }, [storedDraft, contentFromStore, sent, rejected])

  const log = useAuditLog()

  function scheduleAutoSave(text: string) {
    setSavedAt(null)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!summaryId) return
      try {
        await fetch('/api/engagement/thread-summaries', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ id: summaryId, draft_reply: text }),
        })
        setSavedAt(new Date().toISOString())
      } catch { /* silent */ }
    }, 2000)
  }

  async function generate() {
    if (!lead.email) { setError('Lead has no email address — cannot generate draft'); return }
    setLoading('gen'); setError(null)
    try {
      const res = await fetch('/api/engagement/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id, contactName: fullName(lead), contactEmail: lead.email,
          company: lead.company, topic: lead.topic, leadStatus: lead.status,
          threadId: thread?.id ?? null,
          messages: messages.map(m => ({ direction: m.direction, from_address: m.from_address, body_text: m.body_text, sent_at: m.sent_at })),
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setDraftId(data.draftId); setContent(data.content)
      log({ action: 'draft.generated', resource_type: 'thread', resource_id: thread?.id ?? lead.id, metadata: { contact: lead.email } })
    } catch { setError('Failed to generate draft') }
    finally { setLoading(null) }
  }

  async function handleSend() {
    if (!lead.email) { setError('Lead has no email address — cannot send'); return }
    setLoading('send')
    try {
      let activeDraftId = draftId

      // Manual compose: create a draft record first so /api/email/send can load it
      if (!activeDraftId && content.trim()) {
        const createRes = await fetch('/api/engagement/draft', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead.id, contactName: fullName(lead), contactEmail: lead.email,
            company: lead.company, topic: lead.topic, leadStatus: lead.status,
            threadId: thread?.id ?? null, messages: [],
            manualContent: content,
          }),
        })
        const createData = await createRes.json()
        if (createData.error) { setError(createData.error); return }
        activeDraftId = createData.draftId
        setDraftId(activeDraftId)
      }

      if (activeDraftId) {
        await fetch('/api/engagement/draft', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId: activeDraftId, status: 'approved', content }),
        })
        const sendRes = await fetch('/api/email/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId: activeDraftId }),
        })
        if (!sendRes.ok) {
          const err = await sendRes.json().catch(() => ({}))
          setError(err.error ?? 'Failed to send email')
          return
        }
      }
      setSent(true)
      log({ action: 'draft.approved', resource_type: 'thread', resource_id: thread?.id ?? lead.id, metadata: { contact: lead.email, chars: content.length } })
    } finally { setLoading(null) }
  }

  async function handleReject() {
    setLoading('reject')
    try {
      if (draftId) {
        await fetch('/api/engagement/draft', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId, status: 'rejected', rejection_note: 'Rejected by user' }),
        })
      }
      setRejected(true); setContent(''); setDraftId(null)
      log({ action: 'draft.rejected', resource_type: 'thread', resource_id: thread?.id ?? lead.id, metadata: { contact: lead.email } })
    } finally { setLoading(null) }
  }

  const draftPanelBase: React.CSSProperties = {
    borderTop: '2px solid #93c5fd', background: '#eff6ff', flexShrink: 0,
  }

  if (sent) return (
    <div style={{ ...draftPanelBase, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: '#15803d' }}>✓ Reply approved</span>
      <button onClick={() => { setSent(false); setContent(''); setDraftId(null) }} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>New draft</button>
    </div>
  )

  if (!content && !rejected && !manualMode) return (
    <div style={{ ...draftPanelBase, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, color: needsReply ? '#b45309' : '#6b7280', fontStyle: needsReply ? 'normal' : 'italic', fontWeight: needsReply ? 500 : 400 }}>
        {needsReply ? '⚡ Client replied — generate a response' : 'No pending draft'}
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {error && <span style={{ fontSize: 11, color: '#ef4444' }}>{error}</span>}
        <button
          onClick={() => setManualMode(true)}
          style={{ fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Compose
        </button>
        <button onClick={generate} disabled={!!loading} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
          {loading === 'gen' ? 'Generating…' : 'Generate AI reply'}
        </button>
      </div>
    </div>
  )

  if (manualMode && !content) return (
    <div style={draftPanelBase}>
      <div style={{ padding: '8px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2563eb' }}>Compose Reply</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {error && <span style={{ fontSize: 11, color: '#ef4444' }}>{error}</span>}
          <button onClick={() => setManualMode(false)} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button onClick={generate} disabled={!!loading} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            {loading === 'gen' ? 'Generating…' : 'Use AI instead'}
          </button>
        </div>
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        <textarea
          autoFocus
          placeholder={`Write your reply to ${lead.email ?? 'the client'}…`}
          rows={5}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#1e3a5f', lineHeight: 1.65, border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', resize: 'none', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
          onChange={e => setContent(e.target.value)}
        />
      </div>
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        <button
          onClick={handleSend}
          disabled={!!loading}
          style={{ flex: 1, padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#1d4ed8', color: '#fff', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
        >
          {loading === 'send' ? 'Sending…' : 'Send Reply'}
        </button>
      </div>
    </div>
  )

  if (rejected) return (
    <div style={{ ...draftPanelBase, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>Draft rejected</span>
      <button onClick={() => { setRejected(false); generate() }} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>Regenerate</button>
    </div>
  )

  return (
    <div style={draftPanelBase}>
      <div style={{ padding: '8px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2563eb' }}>AI Draft</span>
          {lastMsg?.sent_at && (
            <span style={{ fontSize: 11, color: '#93c5fd' }}>— replying to {lastMsg.from_address} · {timeAgo(lastMsg.sent_at)}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {savedAt && <span style={{ fontSize: 10, color: '#60a5fa' }}>Autosaved {timeAgo(savedAt)}</span>}
          <button onClick={generate} disabled={!!loading} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>
            {loading === 'gen' ? 'Regenerating…' : '↺ Regenerate'}
          </button>
        </div>
      </div>

      {lastMsg && (
        <div style={{ margin: '0 16px 6px', padding: '8px 10px', background: 'rgba(219,234,254,0.5)', borderRadius: 7, borderLeft: '3px solid #93c5fd' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
            {(lastMsg.body_text ?? '').split('\n').find(l => l.trim())?.slice(0, 120)}…
          </p>
        </div>
      )}

      <div style={{ padding: '0 16px 8px' }}>
        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); scheduleAutoSave(e.target.value) }}
          rows={5}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#1e3a5f', lineHeight: 1.65, border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', resize: 'none', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        <button onClick={handleReject} disabled={!!loading} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 500, border: '1px solid #bfdbfe', borderRadius: 8, background: '#fff', color: '#6b7280', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
          {loading === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
        <button onClick={handleSend} disabled={!!loading || !content.trim()} style={{ flex: 1, padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#1d4ed8', color: '#fff', cursor: 'pointer', opacity: (loading || !content.trim()) ? 0.5 : 1 }}>
          {loading === 'send' ? 'Saving…' : 'Approve & Send Reply'}
        </button>
      </div>
    </div>
  )
}

// ── Contact panel ─────────────────────────────────────────────────────────────

function ContactPanel({
  lead, messages, onStatus,
}: {
  lead:      Lead
  messages:  RealMsg[]
  onStatus:  (id: string, s: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied,   setCopied]   = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const st = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted
  const lastInbound  = [...messages].reverse().find(m => m.direction === 'inbound')
  const needsReply   = messages.at(-1)?.direction === 'inbound'
  const allCcs = Array.from(new Set(messages.flatMap(m => m.cc)))

  function copy(text: string, k: string) {
    navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(null), 1500)
  }

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', margin: '0 0 4px' }
  const val: React.CSSProperties = { fontSize: 12, color: '#333', margin: 0, wordBreak: 'break-all' }

  return (
    <div style={{ width: 248, flexShrink: 0, borderLeft: '1px solid #e8e8e8', background: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: needsReply ? '#fffbeb' : '#fff' }}>
        {needsReply ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309' }}>Awaiting your reply</span>
          </div>
        ) : messages.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#15803d' }}>We replied last</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e5e7eb', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#aaa' }}>No emails yet</span>
          </div>
        )}
        {messages.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <div><p style={lbl}>Emails</p><p style={{ ...val, fontSize: 14, fontWeight: 700 }}>{messages.length}</p></div>
            <div><p style={lbl}>Days open</p><p style={{ ...val, fontSize: 14, fontWeight: 700 }}>{daysSince(lead.created_at)}</p></div>
            {lastInbound?.sent_at && <div><p style={lbl}>Last reply</p><p style={{ ...val, fontSize: 11 }}>{timeAgo(lastInbound.sent_at)}</p></div>}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <p style={lbl}>Lead Status</p>
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button onClick={() => setMenuOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, border: '1px solid #e8e8e8', background: st.bg, color: st.color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {st.label} <ChevronDown size={12} strokeWidth={2.5} />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', zIndex: 50, padding: '4px 0' }}>
              {ALL_STATUSES.map(s => {
                const sc = STATUS_MAP[s]
                return (
                  <button key={s} onClick={() => { onStatus(lead.id, s); setMenuOpen(false) }} style={{ width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 12, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: lead.status === s ? sc.color : '#555' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: sc.color, flexShrink: 0 }} />
                    {sc.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <p style={lbl}>Contact</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(lead.first_name || lead.last_name) && <div><p style={lbl}>Name</p><p style={val}>{fullName(lead)}</p></div>}
          {lead.email && (
            <div><p style={lbl}>Email</p>
              <button onClick={() => copy(lead.email!, 'email')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#333', wordBreak: 'break-all', textAlign: 'left' }}>{lead.email}</span>
                {copied === 'email' ? <Check size={10} style={{ color: '#22c55e', flexShrink: 0 }} /> : <Copy size={9} style={{ color: '#ccc', flexShrink: 0 }} />}
              </button>
            </div>
          )}
          {lead.phone && (
            <div><p style={lbl}>Phone</p>
              <button onClick={() => copy(lead.phone!, 'phone')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#333' }}>{lead.phone}</span>
                {copied === 'phone' ? <Check size={10} style={{ color: '#22c55e', flexShrink: 0 }} /> : <Copy size={9} style={{ color: '#ccc', flexShrink: 0 }} />}
              </button>
            </div>
          )}
          {lead.company && <div><p style={lbl}>Company</p><p style={val}>{lead.company}</p></div>}
        </div>
      </div>

      {allCcs.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <p style={lbl}>CC Participants</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {allCcs.map(addr => (
              <div key={addr} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(59,130,246,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#1d4ed8', flexShrink: 0 }}>
                  {addr[0].toUpperCase()}
                </span>
                <span style={{ fontSize: 11, color: '#555', wordBreak: 'break-all', flex: 1 }}>{addr}</span>
                <span style={{ fontSize: 9, color: '#bbb', background: '#f4f4f5', padding: '1px 5px', borderRadius: 4 }}>CC</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <p style={lbl}>Lead Info</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lead.department   && <div><p style={lbl}>Department</p><p style={val}>{lead.department}</p></div>}
          {lead.topic        && <div><p style={lbl}>Topic</p><p style={val}>{lead.topic}</p></div>}
          {lead.contact_type && <div><p style={lbl}>Type</p><p style={val}>{lead.contact_type}</p></div>}
          <div><p style={lbl}>Lead since</p><p style={val}>{new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
        </div>
      </div>

      <div style={{ padding: '12px 16px', flex: 1 }}>
        <p style={lbl}>Internal Notes</p>
        <textarea placeholder="Add notes…" rows={4} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#333', lineHeight: 1.6, border: '1px solid #e8e8e8', borderRadius: 8, padding: '8px 10px', resize: 'none', background: '#fafafa', outline: 'none', fontFamily: 'inherit' }} />
      </div>
    </div>
  )
}

// ── Thread view ───────────────────────────────────────────────────────────────

function ThreadView({
  lead, threadState, onStatus, onDelete,
}: {
  lead:        Lead
  threadState: ThreadState
  onStatus:    (id: string, s: string) => void
  onDelete:    (id: string) => void
}) {
  const { thread, messages, loading, error } = threadState
  const st         = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted
  const needsReply = messages.at(-1)?.direction === 'inbound'
  const initialMsg = lead.details || lead.message

  const [summaries,        setSummaries]        = useState<StoredSummary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(false)
  const [deleting,         setDeleting]         = useState(false)
  const [confirmDelete,    setConfirmDelete]     = useState(false)
  const threadId        = thread?.id ?? null
  const latestSummary   = summaries[0] ?? null
  const latestMessageId = messages.at(-1)?.id ?? null
  const log             = useAuditLog()

  function refreshSummaries() {
    if (!threadId) return
    setSummariesLoading(true)
    fetch(`/api/engagement/thread-summaries?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setSummaries(Array.isArray(data) ? data : []))
      .catch(() => setSummaries([]))
      .finally(() => setSummariesLoading(false))
  }

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

  useEffect(() => {
    setSummaries([])
    if (!threadId) return
    setSummariesLoading(true)
    fetch(`/api/engagement/thread-summaries?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setSummaries(Array.isArray(data) ? data : []))
      .catch(() => setSummaries([]))
      .finally(() => setSummariesLoading(false))
    log({ action: 'thread.viewed', resource_type: 'thread', resource_id: threadId, metadata: { contact: lead.email, subject: lead.subject } })
  }, [threadId, lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8e8e8', background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
                  {thread?.subject ?? lead.subject ?? lead.topic ?? fullName(lead)}
                </span>
                {needsReply && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.10)', color: '#b45309' }}>⚡ Needs reply</span>
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>
                {fullName(lead)}{lead.email ? ` · ${lead.email}` : ''}{lead.company ? ` · ${lead.company}` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
              {messages.length > 0 && (
                <span style={{ fontSize: 11, color: '#bbb' }}>{messages.length} email{messages.length !== 1 ? 's' : ''}</span>
              )}
              {confirmDelete ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#ef4444' }}>Delete thread?</span>
                  <button onClick={handleDelete} disabled={deleting} style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', opacity: deleting ? 0.5 : 1 }}>
                    {deleting ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={handleDelete} title="Delete thread" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ddd', display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>

        <StoredSummaryStrip
          summaries={summaries}
          loading={summariesLoading}
          threadId={threadId}
          latestMessageId={latestMessageId}
          onRefresh={refreshSummaries}
        />

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 12, color: '#bbb' }}>Loading email thread…</div>}
          {!loading && error && <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 12, color: '#ef4444' }}>{error}</div>}
          {!loading && !error && messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ textAlign: 'center', padding: '24px 0 8px', fontSize: 12, color: '#bbb' }}>
                No email thread found for {lead.email ?? 'this contact'}.
              </div>
              {initialMsg && (
                <div style={{ border: '1px solid #e8e8e8', borderRadius: 10, padding: 14, background: '#fff' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: '#aaa' }}>Original message from lead form</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{initialMsg}</p>
                </div>
              )}
            </div>
          )}
          {!loading && messages.map((msg, i) => (
            <EmailCard key={msg.id} msg={msg} defaultOpen={i === messages.length - 1} />
          ))}
        </div>

        <AIDraftPanel lead={lead} thread={thread} messages={messages} storedDraft={latestSummary?.draft_reply} summaryId={latestSummary?.id ?? null} />
      </div>

      <ContactPanel lead={lead} messages={messages} onStatus={onStatus} />
    </div>
  )
}

// ── Lead list item ─────────────────────────────────────────────────────────────

function LeadListItem({
  lead, isActive, threadState, onClick,
}: {
  lead:        Lead
  isActive:    boolean
  threadState: ThreadState | undefined
  onClick:     () => void
}) {
  const st          = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted
  const msgs        = threadState?.messages ?? []
  const lastMsg     = msgs.at(-1)
  const needsReply  = lastMsg?.direction === 'inbound'
  const msgCount    = msgs.length

  const previewText = lastMsg
    ? `${lastMsg.direction === 'outbound' ? 'You: ' : ''}${(lastMsg.body_text ?? '').split('\n').find(l => l.trim()) ?? ''}`
    : (lead.details || lead.message || lead.topic || '—')

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '11px 14px',
        borderBottom: '1px solid #f0f0f0', background: isActive ? '#f7f7f7' : '#fff',
        border: 'none', cursor: 'pointer', display: 'block',
        borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: isActive ? st.color : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.subject ?? lead.topic ?? fullName(lead)}
          </p>
          <p style={{ margin: '0 0 2px', fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fullName(lead)}{lead.company ? ` · ${lead.company}` : ''}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {previewText}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#bbb' }}>{timeAgo(lastMsg?.sent_at ?? lead.created_at)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {msgCount > 0 && <span style={{ fontSize: 10, color: '#bbb' }}>{msgCount} email{msgCount !== 1 ? 's' : ''}</span>}
            {needsReply && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EngagementPage() {
  const [leads,      setLeads]      = useState<Lead[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [sortKey,    setSortKey]    = useState<SortKey>('last_activity')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [threadMap,  setThreadMap]  = useState<Record<string, ThreadState>>({})

  const log = useAuditLog()

  const filterRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const data = await fetchLeads()
      setLeads(data)
      setSelectedId(prev => prev ?? (data[0]?.id ?? null))
    } finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!filterOpen) return
    const h = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [filterOpen])

  useEffect(() => {
    if (!selectedId) return
    const lead = leads.find(l => l.id === selectedId)
    if (!lead?.thread_id && !lead?.email) return
    if (threadMap[selectedId]) return

    setThreadMap(prev => ({ ...prev, [selectedId]: { loading: true, thread: null, messages: [], error: null } }))
    fetchThread(lead.thread_id ?? null, lead.email).then(({ thread, messages }) => {
      setThreadMap(prev => ({ ...prev, [selectedId]: { loading: false, thread, messages, error: null } }))
    }).catch(err => {
      setThreadMap(prev => ({ ...prev, [selectedId]: { loading: false, thread: null, messages: [], error: err?.message ?? 'Error loading thread' } }))
    })
  }, [selectedId, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleStatus(id: string, status: string) {
    const lead = leads.find(l => l.id === id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    patchStatus(id, status)
    log({ action: 'status.changed', resource_type: 'lead', resource_id: id, metadata: { contact: lead?.email, new_status: status } })
  }

  function handleDelete(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
    setThreadMap(prev => { const next = { ...prev }; delete next[id]; return next })
    setSelectedId(null)
  }

  function clearFilters() { setSearch(''); setDateFrom(''); setDateTo('') }
  const hasFilters = search || dateFrom || dateTo

  const visible = useMemo(() => {
    let list = leads.filter(l => matchesSearch(l, search) && inDateRange(l.created_at, dateFrom, dateTo))
    if (sortKey === 'newest') list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    else if (sortKey === 'oldest') list = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    else {
      list = [...list].sort((a, b) => {
        const ta = threadMap[a.id]?.messages.at(-1)?.sent_at ?? a.created_at
        const tb = threadMap[b.id]?.messages.at(-1)?.sent_at ?? b.created_at
        return new Date(tb).getTime() - new Date(ta).getTime()
      })
    }
    return list
  }, [leads, search, dateFrom, dateTo, sortKey, threadMap])

  const selectedLead   = leads.find(l => l.id === selectedId) ?? null
  const selectedThread = selectedId ? threadMap[selectedId] : undefined
  const needsReplyCount = Object.values(threadMap).filter(t => t.messages.at(-1)?.direction === 'inbound').length

  const SORT_LABELS: Record<SortKey, string> = {
    last_activity: 'Last activity',
    newest:        'Newest lead',
    oldest:        'Oldest lead',
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left panel ── */}
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #e8e8e8', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Engagement Agent</span>
                {!loading && needsReplyCount > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(245,158,11,0.12)', color: '#b45309' }}>
                    {needsReplyCount} need reply
                  </span>
                )}
              </div>
              <button onClick={() => load(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', display: 'flex' }}>
                <RefreshCw size={13} strokeWidth={2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f4f5', borderRadius: 8, padding: '0 10px', height: 34, marginBottom: 8 }}>
              <Search size={13} style={{ color: '#aaa', flexShrink: 0 }} strokeWidth={2} />
              <input
                type="text" placeholder="Search name, email, company, topic…" value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: '#333', fontFamily: 'inherit' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  <X size={12} style={{ color: '#aaa' }} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ position: 'relative' }} ref={filterRef}>
                <button
                  onClick={() => setFilterOpen(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: hasFilters ? '#3b82f6' : '#555', background: '#fff', border: `1px solid ${hasFilters ? '#93c5fd' : '#e8e8e8'}`, borderRadius: 7, padding: '5px 9px', cursor: 'pointer' }}
                >
                  <SlidersHorizontal size={11} strokeWidth={2} />
                  {SORT_LABELS[sortKey]}
                  <ChevronDown size={10} strokeWidth={2} style={{ color: '#bbb' }} />
                </button>
                {filterOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.10)', zIndex: 50, padding: '12px', minWidth: 220 }}>
                    <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort</p>
                    {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, lbl]) => (
                      <button key={k} onClick={() => setSortKey(k)} style={{ width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, background: sortKey === k ? 'rgba(59,130,246,0.06)' : 'none', border: 'none', borderRadius: 6, cursor: 'pointer', color: sortKey === k ? '#3b82f6' : '#333', fontWeight: sortKey === k ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowUpDown size={10} strokeWidth={2} style={{ color: sortKey === k ? '#3b82f6' : '#ccc' }} />
                        {lbl}
                      </button>
                    ))}
                    <p style={{ margin: '12px 0 6px', fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date range</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={10} style={{ color: '#bbb', flexShrink: 0 }} />
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        style={{ flex: 1, fontSize: 11, border: '1px solid #e8e8e8', borderRadius: 6, padding: '4px 6px', color: '#555', background: '#fff', outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
                      <span style={{ fontSize: 10, color: '#bbb' }}>–</span>
                      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        style={{ flex: 1, fontSize: 11, border: '1px solid #e8e8e8', borderRadius: 6, padding: '4px 6px', color: '#555', background: '#fff', outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
                    </div>
                    {hasFilters && (
                      <button onClick={() => { clearFilters(); setFilterOpen(false) }} style={{ marginTop: 10, width: '100%', fontSize: 11, color: '#ef4444', background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 0', cursor: 'pointer' }}>
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ padding: '6px 14px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, background: '#fafafa' }}>
            <span style={{ fontSize: 11, color: '#aaa' }}>
              {loading ? 'Loading…' : `${visible.length} conversation${visible.length !== 1 ? 's' : ''}${hasFilters ? ' matching' : ''}`}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: '#bbb' }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: '#bbb', marginBottom: 8 }}>
                  {hasFilters ? 'No conversations match your search.' : 'No engaged conversations yet.'}
                </p>
                {hasFilters && (
                  <button onClick={clearFilters} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>Clear filters</button>
                )}
              </div>
            ) : (
              visible.map(lead => (
                <LeadListItem
                  key={lead.id}
                  lead={lead}
                  isActive={lead.id === selectedId}
                  threadState={threadMap[lead.id]}
                  onClick={() => setSelectedId(lead.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right: thread detail ── */}
        {selectedLead ? (
          <ThreadView
            lead={selectedLead}
            threadState={selectedThread ?? { loading: !selectedLead.email, thread: null, messages: [], error: selectedLead.email ? null : 'No email address on this lead' }}
            onStatus={handleStatus}
            onDelete={handleDelete}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#bbb', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#888' }}>Select a conversation</p>
            <p style={{ margin: 0, fontSize: 12, color: '#bbb' }}>
              {loading ? 'Loading…' : leads.length === 0 ? 'No engaged leads yet. Change a lead status to Contacted or above.' : 'Choose from the list on the left.'}
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
