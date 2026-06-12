'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Search, RefreshCw, ChevronDown, Copy, Check, X, Calendar, ArrowUpDown, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useAuditLog } from '@/hooks/useAuditLog'
import { RichEditor, plainToHtml, htmlToPlain } from '@/components/RichEditor'
import { Tip } from '@/components/Tip'

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
  campaign_context?: {
    campaign_id: string
    campaign_name: string
    product_type: string
    step_replied_to: number | null
  } | null
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

type RagSource = {
  file_id:     string
  file_name:   string
  chunk_index: number
  similarity:  number
  content:     string
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
  const newConversations = conversations.filter(c =>
    !c.email || !leadEmails.has(c.email.toLowerCase())
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

function EmailCard({ msg, index, defaultOpen }: { msg: RealMsg; index: number; defaultOpen: boolean }) {
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
  const senderLabel = isOut ? 'Trade Risk Solutions' : (msg.from_address ?? '—')
  const senderInitial = isOut ? 'T' : (msg.from_address?.[0] ?? '?').toUpperCase()
  const bodyLines   = stripped.split('\n')
  const previewLine = msg.subject || bodyLines.find(l => l.trim()) || ''

  // Direction accent colours
  const accent     = isOut ? '#22c55e' : '#818cf8'
  const avatarBg   = isOut ? '#f0fdf4'  : '#eef2ff'
  const avatarColor = isOut ? '#15803d' : '#4338ca'

  return (
    <div
      className={!open ? 'glass-thin' : ''}
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        ...(open ? {
          background: '#fff',
          border: '1px solid #e8eaed',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        } : {}),
      }}
    >
      {/* ── Header row ── */}
      <div
        style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(v => !v)}
      >
        {!open ? (
          /* Collapsed: dot + sender/subject two-line + chevron */
          <>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {senderLabel}
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDateTime(msg.sent_at)}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {msg.subject || previewLine || '—'}
              </p>
            </div>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: '#d1d5db' }}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        ) : (
          /* Expanded: avatar + sender + badge + time + chevron */
          <>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, background: avatarBg, color: avatarColor,
              letterSpacing: '-0.02em',
            }}>
              {senderInitial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#111', letterSpacing: '-0.01em' }}>{senderLabel}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
                  background: isOut ? 'rgba(34,197,94,0.10)' : 'rgba(129,140,248,0.10)',
                  color: isOut ? '#15803d' : '#4338ca',
                }}>
                  {isOut ? 'Sent' : 'Received'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(msg.sent_at)}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: '#d1d5db' }}>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)', transformOrigin: '6px 6px' }}/>
              </svg>
            </div>
          </>
        )}
      </div>

      {/* ── Expanded content ── */}
      {open && (
        <div style={{ borderTop: `1px solid #f0f0f0` }}>
          {/* Meta row */}
          <div style={{ padding: '8px 14px', background: '#fafbfc', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 36, flexShrink: 0 }}>From</span>
              <span style={{ fontSize: 11.5, color: '#374151' }}>{msg.from_address ?? '—'}</span>
              <button onClick={() => copy(msg.from_address ?? '')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}>
                {copied === msg.from_address ? <Check size={10} style={{ color: '#22c55e' }} /> : <Copy size={10} style={{ color: '#d1d5db' }} />}
              </button>
            </div>
            {msg.to.length > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 36, flexShrink: 0 }}>To</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {msg.to.map(a => <span key={a} style={{ fontSize: 11, background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: 20 }}>{a}</span>)}
                </div>
              </div>
            )}
            {msg.cc.length > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 36, flexShrink: 0 }}>CC</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {msg.cc.map(a => (
                    <span key={a} style={{ fontSize: 11, background: 'rgba(129,140,248,0.08)', color: '#4338ca', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(129,140,248,0.18)' }}>{a}</span>
                  ))}
                </div>
              </div>
            )}
            {msg.subject && (
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 36, flexShrink: 0 }}>Subj</span>
                <span style={{ fontSize: 11.5, color: '#374151', fontWeight: 500 }}>{msg.subject}</span>
              </div>
            )}
          </div>
          {/* Body */}
          <div style={{ padding: '14px 16px 16px', maxHeight: 500, overflowY: 'auto' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#1f2937', whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
              {showFull ? fullBody : stripped}
            </p>
            {hasMore && (
              <button
                onClick={() => setShowFull(v => !v)}
                style={{ marginTop: 12, fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', padding: '3px 10px' }}
              >
                {showFull ? '↑ Hide quoted content' : '↓ Show full email'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Campaign context panel ────────────────────────────────────────────────────

type CampaignCtx = NonNullable<Lead['campaign_context']>

function CampaignContextPanel({ ctx }: { ctx: CampaignCtx }) {
  const [open,        setOpen]        = useState(false)
  const [seqs,        setSeqs]        = useState<{ step_number: number; subject: string; body: string }[]>([])
  const [seqsLoaded,  setSeqsLoaded]  = useState(false)
  const [seqsLoading, setSeqsLoading] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !seqsLoaded) {
      setSeqsLoading(true)
      try {
        const res  = await fetch(`/api/outbound/campaigns/${ctx.campaign_id}`)
        const data = await res.json()
        setSeqs(Array.isArray(data.sequences) ? data.sequences : [])
        setSeqsLoaded(true)
      } catch { /* non-fatal */ }
      finally { setSeqsLoading(false) }
    }
  }

  return (
    <div style={{ borderBottom: '1px solid #fde68a', background: '#fffbeb', flexShrink: 0 }}>
      <button onClick={toggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: '#f59e0b', color: '#fff', flexShrink: 0 }}>
          CAMPAIGN
        </span>
        <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ctx.campaign_name}
          {ctx.product_type !== 'General' ? ` · ${ctx.product_type}` : ''}
          {ctx.step_replied_to ? ` · step ${ctx.step_replied_to} replied` : ''}
        </span>
        <span style={{ fontSize: 10, color: '#b45309', flexShrink: 0 }}>
          {open ? '▲ hide' : '▽ emails sent'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {seqsLoading && <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>Loading…</p>}
          {!seqsLoading && seqsLoaded && seqs.length === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>No sequence steps found.</p>
          )}
          {!seqsLoading && seqs.map(seq => (
            <div key={seq.step_number} style={{ padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #fde68a' }}>
              <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                Step {seq.step_number}{seq.subject ? `: ${seq.subject}` : ''}
                {ctx.step_replied_to === seq.step_number && (
                  <span style={{ fontSize: 10, background: '#f59e0b', color: '#fff', padding: '1px 6px', borderRadius: 8 }}>replied here</span>
                )}
              </p>
              <p style={{
                margin: 0, fontSize: 11, color: '#666', lineHeight: 1.55,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              }}>
                {seq.body || '(empty)'}
              </p>
            </div>
          ))}
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
          <Tip text="Generated automatically each time the contact sends a new email — no action needed. Summarises the thread and suggests a next step so you can reply without re-reading everything." />
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
                  <Tip text="AI-suggested next step based on the conversation so far — a prompt to help you decide what to do before replying. You are always in control; treat this as a starting point." />
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

// ── Email chip input (CC / BCC) ───────────────────────────────────────────────

function EmailChipInput({ label, chips, onChange }: {
  label:    string
  chips:    string[]
  onChange: (chips: string[]) => void
}) {
  const [input, setInput] = useState('')

  function tryAdd(raw: string) {
    const val = raw.trim().toLowerCase().replace(/,$/, '')
    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return
    if (!chips.includes(val)) onChange([...chips, val])
    setInput('')
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
      padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6,
      background: '#fff', minHeight: 32, cursor: 'text',
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', flexShrink: 0, width: 28 }}>{label}</span>
      {chips.map(email => (
        <span key={email} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 11, background: '#eff6ff', color: '#1d4ed8',
          padding: '2px 6px 2px 7px', borderRadius: 4, border: '1px solid #bfdbfe',
        }}>
          {email}
          <button
            type="button"
            onClick={() => onChange(chips.filter(c => c !== email))}
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: '0 1px', cursor: 'pointer', color: '#60a5fa', fontSize: 13, lineHeight: 1 }}
          >×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); tryAdd(input) }
          if (e.key === 'Backspace' && !input && chips.length) onChange(chips.slice(0, -1))
        }}
        onBlur={() => tryAdd(input)}
        placeholder={chips.length === 0 ? 'Type email, press Enter' : ''}
        style={{ flex: 1, minWidth: 140, fontSize: 12, border: 'none', outline: 'none', padding: '2px 0', background: 'transparent', color: '#111' }}
      />
    </div>
  )
}

// ── AI Draft panel ────────────────────────────────────────────────────────────

function AIDraftPanel({
  lead, thread, messages, storedDraft, storedRagDraft, storedRagSources, onRagRefresh, onThreadRefresh, pendingRestore,
}: {
  lead:               Lead
  thread:             ThreadState['thread']
  messages:           RealMsg[]
  storedDraft?:       string | null
  storedRagDraft?:    string | null
  storedRagSources?:  RagSource[]
  onRagRefresh?:      () => void
  onThreadRefresh?:   () => void
  pendingRestore?:    { body: string; generatedBy: string; stamp: number } | null
}) {
  type ActiveTab = 'gdrive' | 'rag' | 'compose'
  const lastMsg    = messages.at(-1)
  const needsReply = lastMsg?.direction === 'inbound'

  const [activeTab,       setActiveTab]       = useState<ActiveTab>('gdrive')
  const [draftId,         setDraftId]         = useState<string | null>(null)
  const [draftHtml,       setDraftHtml]       = useState('')
  const [composeHtml,     setComposeHtml]     = useState('')
  const [draftLoaded,     setDraftLoaded]     = useState(false)
  const [draftEditorKey,  setDraftEditorKey]  = useState(0)
  const [loading,         setLoading]         = useState<'gen' | 'send' | null>(null)
  const [sent,            setSent]            = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [aiDraftChecked,  setAiDraftChecked]  = useState(false)

  // RAG tab state
  const [ragHtml,       setRagHtml]       = useState('')
  const [ragLoaded,     setRagLoaded]     = useState(false)
  const [ragEditorKey,  setRagEditorKey]  = useState(0)
  const [ragSources,    setRagSources]    = useState<RagSource[]>(storedRagSources ?? [])
  const [ragGenerating, setRagGenerating] = useState(false)

  // Signature state
  type SigOption = {
    id: string; name: string; title: string | null; phone: string | null
    email: string | null; company_tagline: string | null
  }
  const [signatures,    setSignatures]    = useState<SigOption[]>([])
  const [selectedSigId, setSelectedSigId] = useState<string>('')
  const [sigsLoaded,    setSigsLoaded]    = useState(false)

  function buildClientSigHtml(sig: SigOption): string {
    return [
      '<br>',
      '<hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">',
      `<p style="margin:0;font-size:13px;color:#1e3a5f;font-weight:600">${sig.name}</p>`,
      sig.title           ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.title}</p>` : '',
      sig.phone           ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.phone}</p>` : '',
      sig.email           ? `<p style="margin:4px 0 0;font-size:12px;color:#666"><a href="mailto:${sig.email}" style="color:#1d4ed8;text-decoration:none">${sig.email}</a></p>` : '',
      sig.company_tagline ? `<p style="margin:4px 0 0;font-size:12px;color:#999">${sig.company_tagline}</p>` : '<p style="margin:4px 0 0;font-size:12px;color:#999">Trade Risk Solutions</p>',
    ].filter(Boolean).join('\n')
  }

  const selectedSig = signatures.find(s => s.id === selectedSigId) ?? null
  const sigHtml     = selectedSig ? buildClientSigHtml(selectedSig) : ''

  // CC / BCC / Subject / Reply-To state
  const [ccList,        setCcList]        = useState<string[]>([])
  const [bccList,       setBccList]       = useState<string[]>([])
  const [customSubject, setCustomSubject] = useState('')
  const [replyTo,       setReplyTo]       = useState('operations@trade-risksol.com')

  const log = useAuditLog()

  // Load signatures once
  useEffect(() => {
    if (sigsLoaded) return
    setSigsLoaded(true)
    fetch('/api/signatures').then(r => r.ok ? r.json() : []).then((rows: SigOption[]) => {
      const active = (Array.isArray(rows) ? rows : []).filter(s => (s as unknown as { is_active: boolean }).is_active !== false)
      setSignatures(active)
    }).catch(() => {})
  }, [sigsLoaded])

  // Pre-fill CC, subject from thread; reset BCC and reply-to on thread change
  useEffect(() => {
    setBccList([])
    setReplyTo('operations@trade-risksol.com')
    // Subject
    const s = thread?.subject ?? ''
    setCustomSubject(s ? (s.startsWith('Re:') ? s : `Re: ${s}`) : 'Re: Your enquiry — Trade Risk Solutions')
    // CC from thread messages
    const seen = new Set<string>()
    const ccs: string[] = []
    for (const m of messages) {
      for (const addr of m.cc) {
        const a = addr.toLowerCase()
        if (!seen.has(a) && !a.endsWith('@trade-risksol.com') &&
            !a.includes('noreply') && !a.includes('no-reply') && !a.includes('mailer-daemon')) {
          seen.add(a); ccs.push(a)
        }
      }
    }
    setCcList(ccs)
  }, [lead.id, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when switching threads
  useEffect(() => {
    setActiveTab('gdrive'); setDraftId(null); setDraftHtml(''); setComposeHtml('')
    setDraftLoaded(false); setDraftEditorKey(0); setSent(false); setError(null)
    setRagHtml(''); setRagLoaded(false); setRagEditorKey(0); setRagSources([])
    setAiDraftChecked(false)
  }, [lead.id])

  // Restore a draft selected from Draft History panel
  useEffect(() => {
    if (!pendingRestore) return
    const { body, generatedBy } = pendingRestore
    if (generatedBy === 'rag') {
      setRagHtml(body); setRagLoaded(true); setRagEditorKey(k => k + 1); setActiveTab('rag')
    } else {
      setDraftHtml(body); setDraftLoaded(true); setDraftEditorKey(k => k + 1); setActiveTab('gdrive')
    }
  }, [pendingRestore?.stamp]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect A — check ai_drafts immediately on thread open (no messages dependency).
  // ai_drafts is always the authoritative source — newest manually-generated draft wins.
  // Uses an isCurrent flag to discard results from a previous thread if switching quickly.
  useEffect(() => {
    const tid = thread?.id
    if (!tid || sent) return
    let current = true
    setAiDraftChecked(false)
    fetch(`/api/engagement/draft?thread_id=${encodeURIComponent(tid)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((rows: { id: string; body: string }[]) => {
        if (!current) return
        const latest = Array.isArray(rows) ? rows[0] : null
        if (latest?.body) {
          setDraftId(latest.id)
          setDraftHtml(plainToHtml(latest.body))
          setDraftLoaded(true)
          setDraftEditorKey(k => k + 1)
        }
      })
      .catch(() => {})
      .finally(() => { if (current) setAiDraftChecked(true) })
    return () => { current = false }
  }, [thread?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect B — fallback: if ai_drafts check completed with nothing, load thread_summaries draft.
  // This covers threads that have a summary draft but no ai_drafts row yet.
  useEffect(() => {
    if (!aiDraftChecked || draftLoaded || sent) return
    if (storedDraft) {
      setDraftHtml(plainToHtml(storedDraft))
      setDraftLoaded(true)
      setDraftEditorKey(k => k + 1)
    }
  }, [aiDraftChecked, draftLoaded, sent, storedDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect C — auto-generate if both checks returned nothing and messages are ready.
  useEffect(() => {
    if (!thread?.id || !aiDraftChecked || draftLoaded || messages.length === 0 || sent) return
    generate()
  }, [thread?.id, aiDraftChecked, draftLoaded, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill RAG draft tab from stored RAG draft
  useEffect(() => {
    if (storedRagDraft && !ragLoaded && !sent) {
      setRagHtml(plainToHtml(storedRagDraft))
      setRagLoaded(true)
      setRagEditorKey(k => k + 1)
      setRagSources(storedRagSources ?? [])
    }
  }, [storedRagDraft, ragLoaded, sent]) // eslint-disable-line react-hooks/exhaustive-deps

  async function generateRag() {
    if (!thread?.id) { setError('No thread found'); return }
    setRagGenerating(true); setError(null)
    try {
      const res  = await fetch('/api/engagement/draft-rag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: thread.id, message_id: lastMsg?.id ?? null, contactName: fullName(lead) || null }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setRagHtml(plainToHtml(data.content))
      setRagEditorKey(k => k + 1)
      setRagSources(data.sources ?? [])
      setRagLoaded(true)
      onRagRefresh?.()
    } catch { setError('Failed to generate RAG draft') }
    finally { setRagGenerating(false) }
  }

  async function generate() {
    setLoading('gen'); setError(null)
    try {
      const res  = await fetch('/api/engagement/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id, contactName: fullName(lead), contactEmail: lead.email,
          company: lead.company, topic: lead.topic, leadStatus: lead.status,
          threadId: thread?.id ?? null,
          messages: messages.map(m => ({ direction: m.direction, from_address: m.from_address, body_text: m.body_text, sent_at: m.sent_at })),
        }),
      })
      const data = await res.json()
      if (res.status === 422 && data.error === 'not_an_enquiry') {
        setError('Not an insurance enquiry — this looks like a newsletter, spam, or accidental forward. No draft generated.')
        return
      }
      if (data.error) { setError(data.error); return }
      setDraftId(data.draftId)
      setDraftHtml(plainToHtml(data.content))
      setDraftEditorKey(k => k + 1)
      setActiveTab('gdrive')
      log({ action: 'draft.generated', resource_type: 'thread', resource_id: thread?.id ?? lead.id, metadata: { contact: lead.email } })
    } catch { setError('Failed to generate draft') }
    finally { setLoading(null) }
  }

  async function handleSend() {
    const activeHtml = activeTab === 'gdrive' ? draftHtml : activeTab === 'rag' ? ragHtml : composeHtml
    const plainText  = htmlToPlain(activeHtml)
    if (!plainText.trim()) { setError('Cannot send an empty message'); return }

    setLoading('send'); setError(null)
    try {
      let activeDraftId = activeTab === 'gdrive' ? draftId : null

      if (!activeDraftId) {
        const createRes  = await fetch('/api/engagement/draft', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead.id, contactName: fullName(lead), contactEmail: lead.email,
            company: lead.company, topic: lead.topic, leadStatus: lead.status,
            threadId: thread?.id ?? null, messages: [],
            manualContent: plainText,
          }),
        })
        const createData = await createRes.json()
        if (createData.error) { setError(createData.error); return }
        activeDraftId = createData.draftId
        if (activeTab === 'gdrive') setDraftId(activeDraftId)
      }

      await fetch('/api/engagement/draft', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: activeDraftId, status: 'approved', content: plainText }),
      })
      const sendRes = await fetch('/api/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId:       activeDraftId,
          htmlBody:      sigHtml ? activeHtml + sigHtml : activeHtml,
          cc:            ccList.length  ? ccList  : undefined,
          bcc:           bccList.length ? bccList : undefined,
          customSubject: customSubject || undefined,
          replyTo:       replyTo !== 'operations@trade-risksol.com' ? replyTo : undefined,
        }),
      })
      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}))
        setError(err.error ?? 'Send failed')
        return
      }
      setSent(true)
      log({ action: 'draft.approved', resource_type: 'thread', resource_id: thread?.id ?? lead.id, metadata: { contact: lead.email, chars: plainText.length } })
      onThreadRefresh?.()
    } finally { setLoading(null) }
  }

  const base: React.CSSProperties = { borderTop: '2px solid #93c5fd', background: '#eff6ff', flexShrink: 0 }

  if (sent) return (
    <div style={{ ...base, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: '#15803d' }}>✓ Reply sent</span>
      <button onClick={() => { setSent(false); setDraftHtml(''); setRagHtml(''); setComposeHtml(''); setDraftId(null) }}
        style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>
        New reply
      </button>
    </div>
  )

  const hasDraftContent    = draftHtml.replace(/<[^>]+>/g, '').trim().length > 0
  const hasRagDraftContent = ragHtml.replace(/<[^>]+>/g, '').trim().length > 0
  const activeHtml         = activeTab === 'gdrive' ? draftHtml : activeTab === 'rag' ? ragHtml : composeHtml
  const canSend            = htmlToPlain(activeHtml).trim().length > 0

  function tabBtn(tab: ActiveTab): React.CSSProperties {
    const active = activeTab === tab
    return {
      padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      background: 'none', border: 'none', borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
      color: active ? '#2563eb' : '#9ca3af', transition: 'color 0.15s', whiteSpace: 'nowrap',
    }
  }

  return (
    <div style={base}>
      {/* ── Tab navigation ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #dbeafe', padding: '0 12px' }}>
        <div style={{ display: 'flex' }}>
          <button onClick={() => setActiveTab('gdrive')} style={tabBtn('gdrive')}>Draft (GDrive)</button>
          <button onClick={() => setActiveTab('rag')}    style={tabBtn('rag')}>Draft (RAG)</button>
          <button onClick={() => setActiveTab('compose')} style={tabBtn('compose')}>Compose</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {error && <span style={{ fontSize: 11, color: '#ef4444' }}>{error}</span>}
          {activeTab === 'gdrive' && (
            <>
              <Tip text="Reads the full email thread and your knowledge documents to draft a contextual reply. Always review the draft before clicking Approve & Send — you have final say." />
              <button onClick={generate} disabled={!!loading}
                style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <RefreshCw size={11} style={{ animation: loading === 'gen' ? 'spin 1s linear infinite' : undefined }} />
                {loading === 'gen' ? 'Generating…' : hasDraftContent ? 'Regenerate' : 'Generate AI reply'}
              </button>
            </>
          )}
          {activeTab === 'rag' && (
            <button onClick={generateRag} disabled={ragGenerating}
              style={{ fontSize: 11, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              <RefreshCw size={11} style={{ animation: ragGenerating ? 'spin 1s linear infinite' : undefined }} />
              {ragGenerating ? 'Generating…' : hasRagDraftContent ? 'Regenerate (RAG)' : 'Generate RAG reply'}
            </button>
          )}
        </div>
      </div>

      {/* ── Replying-to context strip ── */}
      {needsReply && lastMsg && (
        <div style={{ margin: '8px 12px 0', padding: '6px 10px', background: 'rgba(219,234,254,0.5)', borderRadius: 6, borderLeft: '3px solid #93c5fd' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
            <strong style={{ color: '#3b82f6' }}>Replying to</strong> {lastMsg.from_address} · {timeAgo(lastMsg.sent_at)}
          </p>
        </div>
      )}

      {/* ── Subject / Reply-To / CC / BCC ── */}
      <div style={{ padding: '6px 12px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Subject */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', flexShrink: 0, width: 52 }}>Subject</span>
          <input
            value={customSubject}
            onChange={e => setCustomSubject(e.target.value)}
            style={{ flex: 1, fontSize: 12, border: 'none', outline: 'none', padding: '2px 0', background: 'transparent', color: '#111' }}
          />
        </div>
        {/* Reply-To */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', flexShrink: 0, width: 52 }}>Reply-To</span>
          <input
            value={replyTo}
            onChange={e => setReplyTo(e.target.value)}
            placeholder="operations@trade-risksol.com"
            style={{ flex: 1, fontSize: 12, border: 'none', outline: 'none', padding: '2px 0', background: 'transparent', color: '#111' }}
          />
        </div>
        <EmailChipInput label="CC"  chips={ccList}  onChange={setCcList} />
        <EmailChipInput label="BCC" chips={bccList} onChange={setBccList} />
      </div>

      {/* ── Editor ── */}
      <div style={{ padding: '8px 12px' }}>
        {activeTab === 'gdrive' && (
          <RichEditor key={draftEditorKey} initialHtml={draftHtml} onChange={setDraftHtml} sigHtml={sigHtml}
            placeholder={loading === 'gen' ? 'Generating GDrive draft…' : 'Click "Generate AI reply" to draft using knowledge documents.'}
            minHeight={140} />
        )}
        {activeTab === 'rag' && (
          <RichEditor key={`rag-${ragEditorKey}`} initialHtml={ragHtml} onChange={setRagHtml} sigHtml={sigHtml}
            placeholder={ragGenerating ? 'Generating RAG draft…' : 'Click "Generate RAG reply" to draft using retrieved knowledge chunks.'}
            minHeight={140} />
        )}
        {activeTab === 'compose' && (
          <RichEditor key="compose" initialHtml={composeHtml} onChange={setComposeHtml} sigHtml={sigHtml}
            placeholder={`Write your reply to ${lead.email ?? 'the client'}…`}
            minHeight={140} />
        )}
      </div>

      {/* ── RAG sources ── */}
      {activeTab === 'rag' && ragSources.length > 0 && (
        <div style={{ margin: '0 12px 8px', padding: '10px 12px', background: '#f5f3ff', borderRadius: 8, border: '1px solid #ede9fe' }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7c3aed' }}>
            Sources retrieved from knowledge base
          </p>
          {ragSources.map((s, i) => (
            <div key={i} style={{ marginBottom: i < ragSources.length - 1 ? 6 : 0, padding: '7px 10px', background: '#fff', borderRadius: 6, border: '1px solid #ede9fe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>📄 {s.file_name}</span>
                <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>{Math.round(s.similarity * 100)}% match</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {s.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Signature selector + Actions ── */}
      <div style={{ padding: '4px 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {signatures.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>Sign as</span>
            <select
              value={selectedSigId}
              onChange={e => setSelectedSigId(e.target.value)}
              style={{ flex: 1, fontSize: 12, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', color: '#374151', cursor: 'pointer' }}
            >
              <option value="">— No signature —</option>
              {signatures.map(s => (
                <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleSend} disabled={!!loading || !canSend}
            style={{ flex: 1, padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#1d4ed8', color: '#fff', cursor: 'pointer', opacity: (loading || !canSend) ? 0.5 : 1 }}>
            {loading === 'send' ? 'Sending…' : 'Approve & Send Reply'}
          </button>
          <Tip placement="left" text="Edit the draft then click Approve & Send. Every sent reply is automatically evaluated to improve future AI drafts." />
        </div>
      </div>
    </div>
  )
}

// ── Draft history panel ───────────────────────────────────────────────────────

type DraftHistoryItem = {
  id:           string
  body:         string
  status:       string
  generated_by: string
  email_type:   string | null
  created_at:   string
}

function DraftHistoryPanel({ threadId, onRestore }: { threadId: string | null; onRestore: (body: string, generatedBy: string) => void }) {
  const [items,   setItems]   = useState<DraftHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    setItems([]); setLoaded(false); setPreview(null)
  }, [threadId])

  useEffect(() => {
    if (loaded || !threadId) return
    setLoading(true)
    fetch(`/api/engagement/draft?thread_id=${encodeURIComponent(threadId)}&history=true`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: DraftHistoryItem[]) => setItems(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => { setLoading(false); setLoaded(true) })
  }, [threadId, loaded])

  if (!threadId) return (
    <div style={{ padding: '24px 16px', fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>
      No thread — drafts appear once a thread is active.
    </div>
  )

  if (loading) return <div style={{ padding: '20px 16px', fontSize: 12, color: '#bbb' }}>Loading…</div>

  if (loaded && items.length === 0) return (
    <div style={{ padding: '20px 16px', fontSize: 12, color: '#bbb', fontStyle: 'italic', lineHeight: 1.6 }}>
      No AI drafts yet — click "Regenerate" to generate one and it will appear here.
    </div>
  )

  const total = items.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((item, idx) => {
        const vNum       = total - idx
        const isCurrent  = idx === 0 && (item.status === 'pending' || item.status === 'approved')
        const isSent     = item.status === 'sent'
        const isRAG      = item.generated_by === 'rag'
        const expanded   = preview === item.id

        const srcColor   = isRAG ? '#7c3aed' : '#1d4ed8'
        const srcBg      = isRAG ? 'rgba(124,58,237,0.08)' : 'rgba(29,78,216,0.08)'
        const srcLabel   = isRAG ? 'RAG' : 'GDrive'

        const statusLabel = isCurrent ? 'current' : isSent ? 'sent' : 'older'
        const statusColor = isCurrent ? '#059669' : isSent ? '#1d4ed8' : '#9ca3af'

        const bodyPreview = item.body.replace(/\s+/g, ' ').slice(0, 100)

        return (
          <div key={item.id} style={{
            borderBottom: '1px solid #f0f0f0',
            background: isCurrent ? '#f9fffe' : '#fff',
          }}>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#bbb' }}>v{vNum}</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: srcBg, color: srcColor }}>
                  {srcLabel}
                </span>
                <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>· {statusLabel}</span>
                <span style={{ fontSize: 10, color: '#ccc', marginLeft: 'auto' }}>{timeAgo(item.created_at)}</span>
              </div>

              <p style={{ margin: '0 0 7px', fontSize: 11, color: '#555', lineHeight: 1.55 }}>
                {bodyPreview}{item.body.length > 100 ? '…' : ''}
              </p>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setPreview(expanded ? null : item.id)}
                  style={{ fontSize: 10, color: '#6b7280', background: '#f4f4f5', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                >
                  {expanded ? 'Hide' : 'Preview'}
                </button>
                <button
                  onClick={() => onRestore(item.body, item.generated_by)}
                  style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: isCurrent ? '#059669' : '#1d4ed8', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                >
                  {isCurrent ? 'Reload' : 'Load'}
                </button>
              </div>

              {expanded && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8f9fa', borderRadius: 6, border: '1px solid #e5e7eb', maxHeight: 200, overflowY: 'auto' }}>
                  <pre style={{ margin: 0, fontSize: 11, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'inherit' }}>
                    {item.body}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Contact panel ─────────────────────────────────────────────────────────────

function ContactPanel({
  lead, messages, onStatus, threadId, onRestoreDraft,
}: {
  lead:            Lead
  messages:        RealMsg[]
  onStatus:        (id: string, s: string) => void
  threadId:        string | null
  onRestoreDraft:  (body: string, generatedBy: string) => void
}) {
  const [panelTab, setPanelTab] = useState<'contact' | 'drafts'>('contact')
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

      {/* Tab switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
        {(['contact', 'drafts'] as const).map(t => (
          <button key={t} onClick={() => setPanelTab(t)} style={{
            flex: 1, padding: '8px 0', fontSize: 11, fontWeight: panelTab === t ? 600 : 400,
            color: panelTab === t ? '#1677FF' : '#9ca3af', background: 'none', border: 'none',
            borderBottom: panelTab === t ? '2px solid #1677FF' : '2px solid transparent',
            cursor: 'pointer', textTransform: 'capitalize', letterSpacing: '0.01em',
          }}>
            {t === 'drafts' ? 'Draft History' : 'Contact'}
          </button>
        ))}
      </div>

      {/* Draft History tab */}
      {panelTab === 'drafts' && (
        <DraftHistoryPanel threadId={threadId} onRestore={onRestoreDraft} />
      )}

      {/* Contact tab */}
      {panelTab === 'contact' && <>
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
          <p style={lbl}>CC Participants <Tip placement="left" text="People who were copied on one or more emails in this thread. They can see the full conversation — keep this in mind when drafting replies." /></p>
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
      </>}
    </div>
  )
}

// ── Thread view ───────────────────────────────────────────────────────────────

function ThreadView({
  lead, threadState, onStatus, onDelete, onThreadRefresh,
}: {
  lead:             Lead
  threadState:      ThreadState
  onStatus:         (id: string, s: string) => void
  onDelete:         (id: string) => void
  onThreadRefresh:  () => void
}) {
  const { thread, messages, loading, error } = threadState
  const st         = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted
  const needsReply = messages.at(-1)?.direction === 'inbound'
  const initialMsg = lead.details || lead.message

  const [summaries,        setSummaries]        = useState<StoredSummary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(false)
  const [deleting,         setDeleting]         = useState(false)
  const [confirmDelete,    setConfirmDelete]     = useState(false)
  const [ragDraft,         setRagDraft]         = useState<{ content: string; sources: RagSource[] } | null>(null)
  const [pendingRestore,   setPendingRestore]   = useState<{ body: string; generatedBy: string; stamp: number } | null>(null)
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

  function refreshRagDraft() {
    if (!threadId) return
    fetch(`/api/engagement/draft-rag?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { if (data && data.content) setRagDraft({ content: data.content, sources: data.sources ?? [] }) })
      .catch(() => {})
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
    setRagDraft(null)
    if (!threadId) return
    setSummariesLoading(true)
    fetch(`/api/engagement/thread-summaries?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setSummaries(Array.isArray(data) ? data : []))
      .catch(() => setSummaries([]))
      .finally(() => setSummariesLoading(false))
    // Load latest RAG draft in parallel (non-fatal)
    fetch(`/api/engagement/draft-rag?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { if (data?.content) setRagDraft({ content: data.content, sources: data.sources ?? [] }) })
      .catch(() => {})
    log({ action: 'thread.viewed', resource_type: 'thread', resource_id: threadId, metadata: { contact: lead.email, subject: lead.subject } })
  }, [threadId, lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid #e8eaed', background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
                  {thread?.subject ?? lead.subject ?? lead.topic ?? fullName(lead)}
                </span>
                {needsReply && (
                  <>
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: 'rgba(245,158,11,0.10)', color: '#b45309', border: '1px solid rgba(245,158,11,0.20)' }}>⚡ Needs reply</span>
                    <Tip text="The last email in this thread was from the contact — they are waiting on your response. Use the reply panel below to draft and send a reply." />
                  </>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: '#6b7280' }}>
                  {fullName(lead)}{lead.email ? ` · ${lead.email}` : ''}{lead.company ? ` · ${lead.company}` : ''}
                </span>
                {messages.length > 0 && (
                  <span style={{ fontSize: 10.5, color: '#9ca3af', background: '#f3f4f6', padding: '1px 7px', borderRadius: 20 }}>
                    {messages.length} email{messages.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
              {confirmDelete ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#ef4444' }}>Delete?</span>
                  <button onClick={handleDelete} disabled={deleting} style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', opacity: deleting ? 0.5 : 1 }}>
                    {deleting ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={handleDelete} title="Delete thread" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#d1d5db', display: 'flex', alignItems: 'center', borderRadius: 6 }}>
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

        {lead.campaign_context && (
          <CampaignContextPanel ctx={lead.campaign_context} />
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 28px', display: 'flex', flexDirection: 'column', gap: 10, background: '#f8fafc' }}>
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
          {!loading && (() => {
            // kExpandAuto: always expand the last message + the last inbound message.
            // Outbound messages that aren't the last collapse — you already know what you wrote.
            const lastInboundIdx = messages.reduce((found, m, i) => m.direction === 'inbound' ? i : found, -1)
            return messages.map((msg, i) => (
              <EmailCard
                key={msg.id} msg={msg} index={i + 1}
                defaultOpen={i === messages.length - 1 || i === lastInboundIdx}
              />
            ))
          })()}
        </div>

        <AIDraftPanel lead={lead} thread={thread} messages={messages} storedDraft={latestSummary?.draft_reply} storedRagDraft={ragDraft?.content ?? null} storedRagSources={ragDraft?.sources ?? []} onRagRefresh={refreshRagDraft} onThreadRefresh={onThreadRefresh} pendingRestore={pendingRestore} />
      </div>

      <ContactPanel lead={lead} messages={messages} onStatus={onStatus} threadId={threadId} onRestoreDraft={(body, generatedBy) => setPendingRestore({ body, generatedBy, stamp: Date.now() })} />
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
  const msgs        = threadState?.messages ?? []
  const lastMsg     = msgs.at(-1)
  const needsReply  = lastMsg?.direction === 'inbound'

  const previewText = lastMsg
    ? `${lastMsg.direction === 'outbound' ? 'You: ' : ''}${(lastMsg.body_text ?? '').split('\n').find(l => l.trim()) ?? ''}`
    : (lead.details || lead.message || lead.topic || '—')

  const name    = fullName(lead)
  const initial = (name[0] ?? lead.email?.[0] ?? '?').toUpperCase()

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '10px 14px',
        borderBottom: '1px solid #f0f0f0',
        background: isActive ? '#f0f6ff' : '#fff',
        border: 'none', borderLeft: 'none', cursor: 'pointer', display: 'block',
        borderLeftWidth: 3, borderLeftStyle: 'solid',
        borderLeftColor: isActive ? '#1677FF' : needsReply ? '#f59e0b' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Avatar */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0, marginTop: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700,
          background: isActive ? 'rgba(22,119,255,0.12)' : '#f3f4f6',
          color: isActive ? '#1677FF' : '#6b7280',
        }}>
          {initial}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
              {name || (lead.email?.split('@')[0] ?? '—')}
            </p>
            <span style={{ fontSize: 10.5, color: '#9ca3af', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{timeAgo(lastMsg?.sent_at ?? lead.created_at)}</span>
          </div>
          <p style={{ margin: '0 0 3px', fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.subject ?? lead.topic ?? lead.company ?? lead.email ?? '—'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <p style={{ margin: 0, flex: 1, fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {previewText}
            </p>
            {needsReply && (
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            )}
            {lead.campaign_context && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, background: '#fef3c7', color: '#b45309', flexShrink: 0 }}>C</span>
            )}
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

  function refreshSelectedThread() {
    if (!selectedId) return
    const lead = leads.find(l => l.id === selectedId)
    if (!lead?.thread_id && !lead?.email) return
    setThreadMap(prev => ({ ...prev, [selectedId]: { ...(prev[selectedId] ?? { thread: null, error: null }), loading: true, messages: prev[selectedId]?.messages ?? [] } }))
    fetchThread(lead.thread_id ?? null, lead.email).then(({ thread, messages }) => {
      setThreadMap(prev => ({ ...prev, [selectedId]: { loading: false, thread, messages, error: null } }))
    }).catch(() => {
      setThreadMap(prev => ({ ...prev, [selectedId]: { ...(prev[selectedId] ?? { thread: null, messages: [] }), loading: false, error: null } }))
    })
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
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #e8eaed', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>
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
            threadState={selectedThread ?? { loading: true, thread: null, messages: [], error: null }}
            onStatus={handleStatus}
            onDelete={handleDelete}
            onThreadRefresh={refreshSelectedThread}
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
