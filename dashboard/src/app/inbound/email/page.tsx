'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { RefreshCw, ChevronDown, Copy, Check, X, Search, MessageCircle, Mail, Globe, Pencil, Sparkles, Send } from 'lucide-react'
import { useAuditLog } from '@/hooks/useAuditLog'

// ── Types ─────────────────────────────────────────────────────────────────────

type Lead = {
  id: string; created_at: string; source: string
  first_name: string | null; last_name: string | null
  email: string | null; phone: string | null; company: string | null
  department: string | null; contact_type: string | null
  topic: string | null; details: string | null; message: string | null
  page_url: string | null; status: string
}

type Filter = 'all' | 'new' | 'email' | 'whatsapp'

// ── Constants ─────────────────────────────────────────────────────────────────

const WA_SOURCES    = new Set(['whatsapp_click'])
const EMAIL_SOURCES = new Set(['website_form', 'email', 'manual'])
const ALL_SOURCES   = new Set([...Array.from(WA_SOURCES), ...Array.from(EMAIL_SOURCES)])

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#1d4ed8', bg: 'rgba(59,130,246,0.10)'  },
  contacted: { label: 'Contacted', color: '#b45309', bg: 'rgba(245,158,11,0.10)'  },
  engaged:   { label: 'Engaged',   color: '#2563eb', bg: 'rgba(37,99,235,0.10)'   },
  qualified: { label: 'Qualified', color: '#15803d', bg: 'rgba(34,197,94,0.10)'   },
  proposal:  { label: 'Proposal',  color: '#d97706', bg: 'rgba(217,119,6,0.10)'   },
  converted: { label: 'Converted', color: '#7e22ce', bg: 'rgba(168,85,247,0.10)'  },
  dropped:   { label: 'Dropped',   color: '#4b5563', bg: 'rgba(107,114,128,0.10)' },
}
const ALL_STATUSES = ['new', 'contacted', 'engaged', 'qualified', 'proposal', 'converted', 'dropped']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || '—'
}

function displayName(l: Lead) {
  const n = fullName(l)
  if (n !== '—') return n
  return l.email ?? l.phone ?? '—'
}

function channelOf(l: Lead): 'whatsapp' | 'email' | 'manual' {
  if (WA_SOURCES.has(l.source)) return 'whatsapp'
  if (l.source === 'manual') return 'manual'
  return 'email'
}

function messagePreview(l: Lead) {
  return l.details || l.message || ''
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Channel badge ─────────────────────────────────────────────────────────────

function ChannelBadge({ source }: { source: string }) {
  if (WA_SOURCES.has(source)) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(34,197,94,0.10)', color: '#15803d', whiteSpace: 'nowrap' }}>
        <MessageCircle size={10} />WhatsApp
      </span>
    )
  }
  if (source === 'website_form') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(59,130,246,0.10)', color: '#1d4ed8', whiteSpace: 'nowrap' }}>
        <Globe size={10} />Website
      </span>
    )
  }
  if (source === 'manual') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#f4f4f5', color: '#888', whiteSpace: 'nowrap' }}>
        <Pencil size={10} />Manual
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(59,130,246,0.10)', color: '#1d4ed8', whiteSpace: 'nowrap' }}>
      <Mail size={10} />Email
    </span>
  )
}

// ── Status dropdown ───────────────────────────────────────────────────────────

function StatusDropdown({ lead, onChange }: { lead: Lead; onChange: (id: string, s: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const st  = STATUS_MAP[lead.status] ?? STATUS_MAP.new

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: st.bg, color: st.color, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        {st.label} <ChevronDown size={10} strokeWidth={2.5} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 100, padding: '4px 0', minWidth: 140 }}>
          {ALL_STATUSES.map(s => {
            const sc = STATUS_MAP[s]
            return (
              <button key={s} onClick={e => { e.stopPropagation(); onChange(lead.id, s); setOpen(false) }}
                style={{ width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 12, fontWeight: lead.status === s ? 600 : 400, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: lead.status === s ? sc.color : '#555' }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: sc.color, flexShrink: 0 }} />
                {sc.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ lead, onStatus, onClose }: { lead: Lead; onStatus: (id: string, s: string) => void; onClose: () => void }) {
  const [copied,       setCopied]       = useState<string | null>(null)
  const [draftText,    setDraftText]    = useState('')
  const [generating,   setGenerating]   = useState(false)
  const [sending,      setSending]      = useState(false)
  const [sendError,    setSendError]    = useState<string | null>(null)
  const [sent,         setSent]         = useState(false)
  const log = useAuditLog()

  const ch  = channelOf(lead)
  const msg = messagePreview(lead)
  const st  = STATUS_MAP[lead.status] ?? STATUS_MAP.new

  // Reset draft state when lead changes
  useEffect(() => {
    setDraftText(''); setGenerating(false); setSending(false); setSendError(null); setSent(false)
  }, [lead.id])

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key); setTimeout(() => setCopied(null), 1500)
  }

  async function generateDraft() {
    setGenerating(true); setSendError(null)
    try {
      const res  = await fetch('/api/inbound/draft', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: displayName(lead), topic: lead.topic, message: msg }),
      })
      const data = await res.json()
      if (data.content) {
        setDraftText(data.content)
        log({ action: 'draft.generated', resource_type: 'inbound_lead', resource_id: lead.id, metadata: { contact: displayName(lead) } })
      } else {
        setSendError(data.error ?? 'Failed to generate draft')
      }
    } catch { setSendError('Network error') }
    finally { setGenerating(false) }
  }

  async function sendReply() {
    if (!lead.email || !draftText.trim()) return
    setSending(true); setSendError(null)
    try {
      const res  = await fetch('/api/inbound/reply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          leadId:          lead.id,
          name:            displayName(lead),
          email:           lead.email,
          company:         lead.company,
          topic:           lead.topic,
          originalMessage: msg,
          draft:           draftText.trim(),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setSent(true)
        onStatus(lead.id, 'contacted')
        log({ action: 'draft.approved', resource_type: 'inbound_lead', resource_id: lead.id, metadata: { contact: displayName(lead), chars: draftText.length } })
      } else {
        setSendError(data.error ?? 'Send failed')
      }
    } catch { setSendError('Network error') }
    finally { setSending(false) }
  }

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', margin: '0 0 3px' }
  const val: React.CSSProperties = { fontSize: 12, color: '#333', margin: 0, wordBreak: 'break-all', lineHeight: 1.5 }

  return (
    <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid #e8e8e8', background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <ChannelBadge source={lead.source} />
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111' }}>{displayName(lead)}</p>
          {lead.company && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>{lead.company}</p>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', flexShrink: 0, padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      {/* Status changer */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <p style={lbl}>Status</p>
        <StatusDropdown lead={lead} onChange={onStatus} />
      </div>

      {/* Contact info */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ ...lbl, marginBottom: 6 }}>Contact</p>
        {(lead.first_name || lead.last_name) && (
          <div><p style={lbl}>Name</p><p style={val}>{fullName(lead)}</p></div>
        )}
        {lead.email && (
          <div>
            <p style={lbl}>Email</p>
            <button onClick={() => copy(lead.email!, 'email')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
              <span style={{ ...val, flex: 1, minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{lead.email}</span>
              {copied === 'email' ? <Check size={11} style={{ color: '#22c55e', flexShrink: 0 }} /> : <Copy size={10} style={{ color: '#ccc', flexShrink: 0 }} />}
            </button>
          </div>
        )}
        {lead.phone && (
          <div>
            <p style={lbl}>Phone / WhatsApp</p>
            <button onClick={() => copy(lead.phone!, 'phone')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={val}>{lead.phone}</span>
              {copied === 'phone' ? <Check size={11} style={{ color: '#22c55e', flexShrink: 0 }} /> : <Copy size={10} style={{ color: '#ccc', flexShrink: 0 }} />}
            </button>
          </div>
        )}
        {ch === 'whatsapp' && lead.phone && (
          <a
            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#15803d', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)', borderRadius: 7, padding: '5px 10px', textDecoration: 'none', width: 'fit-content' }}
          >
            <MessageCircle size={12} /> Open in WhatsApp
          </a>
        )}
      </div>

      {/* Lead info */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ ...lbl, marginBottom: 6 }}>Lead Info</p>
        {lead.topic       && <div><p style={lbl}>Topic</p><p style={val}>{lead.topic}</p></div>}
        {lead.department  && <div><p style={lbl}>Department</p><p style={val}>{lead.department}</p></div>}
        {lead.contact_type && <div><p style={lbl}>Type</p><p style={val}>{lead.contact_type}</p></div>}
        <div><p style={lbl}>Source</p><p style={val}>{lead.source.replace(/_/g, ' ')}</p></div>
        <div><p style={lbl}>Received</p><p style={val}>{fmtDate(lead.created_at)}</p></div>
        {lead.page_url && <div><p style={lbl}>Page</p><p style={{ ...val, fontSize: 11 }}>{lead.page_url}</p></div>}
      </div>

      {/* Message */}
      {msg && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <p style={{ ...lbl, marginBottom: 6 }}>Original Message</p>
          <p style={{ margin: 0, fontSize: 12, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.65, background: '#f9f9f9', borderRadius: 8, padding: '10px 12px', border: '1px solid #f0f0f0' }}>
            {msg}
          </p>
        </div>
      )}

      {/* AI Reply — only show for email leads with an email address */}
      {lead.email && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: sent ? '#f0fdf4' : '#eff6ff', borderTop: `2px solid ${sent ? '#86efac' : '#93c5fd'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ ...lbl, color: sent ? '#15803d' : '#1d4ed8', margin: 0 }}>
              {sent ? 'Reply Sent' : 'AI Reply'}
            </p>
            {!sent && !draftText && (
              <button
                onClick={generateDraft}
                disabled={generating}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  background: generating ? '#dbeafe' : '#1d4ed8',
                  color: generating ? '#93c5fd' : '#fff',
                  border: 'none', cursor: generating ? 'default' : 'pointer',
                }}
              >
                <Sparkles size={11} />
                {generating ? 'Generating…' : 'Generate Reply'}
              </button>
            )}
            {!sent && draftText && (
              <button
                onClick={generateDraft}
                disabled={generating}
                style={{ background: 'none', border: 'none', cursor: generating ? 'default' : 'pointer', fontSize: 11, color: '#93c5fd', padding: 0 }}
              >
                {generating ? 'Regenerating…' : 'Regenerate'}
              </button>
            )}
          </div>

          {sent ? (
            <p style={{ margin: 0, fontSize: 12, color: '#15803d', fontWeight: 500 }}>
              Reply sent to {lead.email}. Lead routed to Engagement Agent.
            </p>
          ) : draftText ? (
            <>
              <textarea
                value={draftText}
                onChange={e => setDraftText(e.target.value)}
                rows={8}
                style={{
                  width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#1e3a5f',
                  lineHeight: 1.65, border: '1px solid #bfdbfe', borderRadius: 8,
                  padding: '8px 10px', resize: 'vertical', background: '#fff',
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#93c5fd' }}>To: {lead.email}</span>
                <button
                  onClick={sendReply}
                  disabled={sending || !draftText.trim()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                    background: sending ? '#dbeafe' : '#1d4ed8',
                    color: sending ? '#93c5fd' : '#fff',
                    border: 'none', cursor: sending ? 'default' : 'pointer',
                  }}
                >
                  <Send size={11} />
                  {sending ? 'Sending…' : 'Send Reply'}
                </button>
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: '#93c5fd' }}>
              Click Generate Reply to draft a first-contact email.
            </p>
          )}

          {sendError && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#ef4444' }}>{sendError}</p>
          )}
        </div>
      )}

      {/* Notes */}
      <div style={{ padding: '12px 16px', flex: 1 }}>
        <p style={{ ...lbl, marginBottom: 6 }}>Internal Notes</p>
        <textarea
          placeholder="Add notes…"
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#333', lineHeight: 1.6, border: '1px solid #e8e8e8', borderRadius: 8, padding: '8px 10px', resize: 'none', background: '#fafafa', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>
    </div>
  )
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()
  const all: Lead[] = Array.isArray(raw) ? raw : []
  return all.filter(l => ALL_SOURCES.has(l.source))
}

async function patchStatus(id: string, status: string) {
  await fetch('/api/leads', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

function InboundLeadsPage() {
  const searchParams = useSearchParams()
  const initFilter   = (searchParams.get('filter') as Filter | null) ?? 'all'

  const [leads,      setLeads]      = useState<Lead[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [filter,     setFilter]     = useState<Filter>(initFilter)
  const [search,     setSearch]     = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const data = await fetchLeads()
      setLeads(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  function handleStatus(id: string, status: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    patchStatus(id, status)
  }

  // Counts
  const totalNew  = leads.filter(l => l.status === 'new').length
  const waCount   = leads.filter(l => WA_SOURCES.has(l.source)).length
  const emCount   = leads.filter(l => EMAIL_SOURCES.has(l.source)).length
  const waNew     = leads.filter(l => WA_SOURCES.has(l.source) && l.status === 'new').length
  const emNew     = leads.filter(l => EMAIL_SOURCES.has(l.source) && l.status === 'new').length

  const FILTERS: { key: Filter; label: string; count: number; newCount: number }[] = [
    { key: 'all',      label: 'All Leads',  count: leads.length, newCount: totalNew },
    { key: 'new',      label: 'New',        count: totalNew,     newCount: 0 },
    { key: 'email',    label: 'Email / Form', count: emCount,    newCount: emNew },
    { key: 'whatsapp', label: 'WhatsApp',   count: waCount,      newCount: waNew },
  ]

  const filtered = leads.filter(l => {
    if (filter === 'new')      return l.status === 'new'
    if (filter === 'email')    return EMAIL_SOURCES.has(l.source)
    if (filter === 'whatsapp') return WA_SOURCES.has(l.source)
    return true
  }).filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return [l.first_name, l.last_name, l.email, l.phone, l.company, l.topic, l.message, l.details]
      .some(v => v?.toLowerCase().includes(q))
  })

  const selectedLead = leads.find(l => l.id === selectedId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ height: 52, padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e8e8e8', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>Inbound Leads</span>
          {!loading && totalNew > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(59,130,246,0.10)', color: '#1d4ed8' }}>
              {totalNew} new
            </span>
          )}
        </div>
        <button onClick={() => load(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', display: 'flex', alignItems: 'center' }}>
          <RefreshCw size={13} strokeWidth={2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Filter + search bar */}
      <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f0f0f0', background: '#fff', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 500, padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
                background: filter === f.key ? '#111' : '#fff',
                color:      filter === f.key ? '#fff' : '#666',
                border:     filter === f.key ? '1px solid #111' : '1px solid #e8e8e8',
              }}
            >
              {f.label}
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: filter === f.key ? 'rgba(255,255,255,0.2)' : '#f4f4f5', color: filter === f.key ? '#fff' : '#888' }}>
                {f.count}
              </span>
              {f.newCount > 0 && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f4f5', borderRadius: 8, padding: '0 10px', height: 32, flex: 1, maxWidth: 320 }}>
          <Search size={12} style={{ color: '#aaa', flexShrink: 0 }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone, topic…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: '#333', fontFamily: 'inherit' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <X size={11} style={{ color: '#aaa' }} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '64px 0', textAlign: 'center', fontSize: 13, color: '#bbb' }}>Loading…</div>
          ) : error ? (
            <div style={{ padding: '64px 0', textAlign: 'center', fontSize: 13, color: '#ef4444' }}>{error}</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '64px 0', textAlign: 'center', fontSize: 13, color: '#bbb' }}>
              {search ? `No leads matching "${search}"` : 'No leads yet.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #e8e8e8', position: 'sticky', top: 0, zIndex: 1 }}>
                  <Th w={110}>Channel</Th>
                  <Th w={120}>First Name</Th>
                  <Th w={120}>Last Name</Th>
                  <Th w={150}>Company</Th>
                  <Th w={160}>Topic</Th>
                  <Th>Message</Th>
                  <Th w={130}>Status</Th>
                  <Th w={90} right>Time</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => {
                  const isActive = lead.id === selectedId
                  const msg      = messagePreview(lead)
                  const st       = STATUS_MAP[lead.status] ?? STATUS_MAP.new
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedId(lead.id === selectedId ? null : lead.id)}
                      style={{
                        borderBottom: '1px solid #f0f0f0',
                        background: isActive ? '#f5f8ff' : lead.status === 'new' ? '#fff' : '#fff',
                        cursor: 'pointer',
                        borderLeft: `3px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#fff' }}
                    >
                      <td style={{ padding: '11px 12px 11px 14px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {lead.status === 'new' && (
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                          )}
                          <ChannelBadge source={lead.source} />
                        </div>
                      </td>
                      <td style={{ padding: '11px 12px', verticalAlign: 'middle' }}>
                        <span style={{ fontWeight: lead.status === 'new' ? 600 : 400, color: '#111' }}>{lead.first_name || '—'}</span>
                      </td>
                      <td style={{ padding: '11px 12px', verticalAlign: 'middle' }}>
                        <span style={{ fontWeight: lead.status === 'new' ? 600 : 400, color: '#111' }}>{lead.last_name || '—'}</span>
                      </td>
                      <td style={{ padding: '11px 12px', verticalAlign: 'middle', color: '#666', maxWidth: 0 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lead.company || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px', verticalAlign: 'middle', color: '#555', maxWidth: 0 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lead.topic || lead.department || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px', verticalAlign: 'middle', color: '#aaa', maxWidth: 0 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {msg || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px', verticalAlign: 'middle' }}>
                        <StatusDropdown lead={lead} onChange={handleStatus} />
                      </td>
                      <td style={{ padding: '11px 14px 11px 12px', verticalAlign: 'middle', textAlign: 'right', color: '#bbb', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {timeAgo(lead.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {!loading && filtered.length > 0 && (
            <p style={{ padding: '12px 20px', fontSize: 11, color: '#ccc', margin: 0 }}>
              {filtered.length} lead{filtered.length !== 1 ? 's' : ''} · {totalNew} new
            </p>
          )}
        </div>

        {/* Detail panel */}
        {selectedLead && (
          <DetailPanel
            lead={selectedLead}
            onStatus={handleStatus}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Root export (Suspense wrapper for useSearchParams) ────────────────────────

export default function InboundLeadsPageWrapper() {
  return (
    <Suspense>
      <InboundLeadsPage />
    </Suspense>
  )
}

// ── Table header cell ─────────────────────────────────────────────────────────

function Th({ children, w, right }: { children?: React.ReactNode; w?: number | string; right?: boolean }) {
  return (
    <th style={{
      padding: '9px 12px', textAlign: right ? 'right' : 'left',
      fontWeight: 600, color: '#888', fontSize: 11,
      textTransform: 'uppercase', letterSpacing: '0.04em',
      width: w, whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}
