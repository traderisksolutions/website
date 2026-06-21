'use client'

import { useEffect, useState, useCallback, useRef, Suspense, Fragment } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { RefreshCw, ChevronDown, ChevronUp, Copy, Check, X, Search, MessageCircle, Mail, Globe, Pencil, Sparkles, Send } from 'lucide-react'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Tip } from '@/components/Tip'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type Lead = {
  id: string; created_at: string; source: string
  first_name: string | null; last_name: string | null
  email: string | null; phone: string | null; company: string | null
  department: string | null; contact_type: string | null
  topic: string | null; details: string | null; message: string | null
  page_url: string | null; status: string; notes?: string | null
  ai_draft_id: string | null; ai_draft_at: string | null
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
  return n !== '—' ? n : l.email ?? l.phone ?? '—'
}
function channelOf(l: Lead): 'whatsapp' | 'email' | 'manual' {
  if (WA_SOURCES.has(l.source)) return 'whatsapp'
  if (l.source === 'manual') return 'manual'
  return 'email'
}
function messagePreview(l: Lead) { return l.details || l.message || '' }
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ── Channel badge ─────────────────────────────────────────────────────────────

function ChannelBadge({ source }: { source: string }) {
  if (WA_SOURCES.has(source)) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 whitespace-nowrap">
        <MessageCircle size={10} />WhatsApp
      </span>
    )
  }
  if (source === 'website_form') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 whitespace-nowrap">
        <Globe size={10} />Website
      </span>
    )
  }
  if (source === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap">
        <Pencil size={10} />Manual
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 whitespace-nowrap">
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
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer whitespace-nowrap"
        style={{ background: st.bg, color: st.color }}
      >
        {st.label} <ChevronDown size={10} strokeWidth={2.5} />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 bg-card border border-border rounded-[10px] shadow-lg z-[100] py-1 min-w-[140px]">
          {ALL_STATUSES.map(s => {
            const sc = STATUS_MAP[s]
            return (
              <button key={s} onClick={e => { e.stopPropagation(); onChange(lead.id, s); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-[12px] bg-transparent border-0 cursor-pointer flex items-center gap-2 hover:bg-muted/50"
                style={{ fontWeight: lead.status === s ? 600 : 400, color: lead.status === s ? sc.color : 'hsl(var(--muted-foreground))' }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sc.color }} />
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

function DetailPanel({ lead, onStatus, onClose, onNotesSave }: { lead: Lead; onStatus: (id: string, s: string) => void; onClose: () => void; onNotesSave: (id: string, notes: string) => void }) {
  const [copied,    setCopied]    = useState<string | null>(null)
  const [notesText, setNotesText] = useState(lead.notes ?? '')

  useEffect(() => { setNotesText(lead.notes ?? '') }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const ch  = channelOf(lead)
  const msg = messagePreview(lead)
  const st  = STATUS_MAP[lead.status] ?? STATUS_MAP.new

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key); setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-2 flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <ChannelBadge source={lead.source} />
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
          </div>
          <p className="text-[14px] font-semibold text-foreground m-0">{displayName(lead)}</p>
          {lead.company && <p className="text-[12px] text-muted-foreground mt-0.5 mb-0">{lead.company}</p>}
        </div>
        <button onClick={onClose} className="bg-transparent border-0 cursor-pointer text-muted-foreground/50 flex-shrink-0 p-0.5 hover:text-muted-foreground">
          <X size={14} />
        </button>
      </div>

      {/* Status */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 mb-1.5">
          Status <Tip placement="right" text="Update this as the conversation progresses — from New to Contacted once you've replied, through to Converted when a policy is placed." />
        </p>
        <StatusDropdown lead={lead} onChange={onStatus} />
      </div>

      {/* Contact info */}
      <div className="px-4 py-3 border-b border-border flex flex-col gap-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 mb-1">Contact</p>
        {(lead.first_name || lead.last_name) && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 mb-0.5">Name</p>
            <p className="text-[12px] text-foreground/80 m-0">{fullName(lead)}</p>
          </div>
        )}
        {lead.email && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 mb-0.5">Email</p>
            <button onClick={() => copy(lead.email!, 'email')} className="bg-transparent border-0 p-0 cursor-pointer flex items-center gap-1.5 max-w-full">
              <span className="text-[12px] text-foreground/80 flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{lead.email}</span>
              {copied === 'email' ? <Check size={11} className="text-emerald-500 flex-shrink-0" /> : <Copy size={10} className="text-muted-foreground/30 flex-shrink-0" />}
            </button>
          </div>
        )}
        {lead.phone && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 mb-0.5">Phone / WhatsApp</p>
            <button onClick={() => copy(lead.phone!, 'phone')} className="bg-transparent border-0 p-0 cursor-pointer flex items-center gap-1.5">
              <span className="text-[12px] text-foreground/80">{lead.phone}</span>
              {copied === 'phone' ? <Check size={11} className="text-emerald-500 flex-shrink-0" /> : <Copy size={10} className="text-muted-foreground/30 flex-shrink-0" />}
            </button>
          </div>
        )}
        {ch === 'whatsapp' && lead.phone && (
          <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 no-underline w-fit">
            <MessageCircle size={12} /> Open in WhatsApp
          </a>
        )}
      </div>

      {/* Lead info */}
      <div className="px-4 py-3 border-b border-border flex flex-col gap-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 mb-1">Lead Info</p>
        {lead.topic        && <Field label="Topic"      value={lead.topic} />}
        {lead.department   && <Field label="Department" value={lead.department} />}
        {lead.contact_type && <Field label="Type"       value={lead.contact_type} />}
        <Field label="Source"   value={lead.source.replace(/_/g, ' ')} />
        <Field label="Received" value={fmtDate(lead.created_at)} />
        {lead.page_url && <Field label="Page" value={lead.page_url} small />}
      </div>

      {/* Message */}
      {msg && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 mb-1.5">Original Message</p>
          <p className="text-[12px] text-foreground/80 whitespace-pre-wrap leading-[1.65] bg-muted/40 border border-border rounded-lg px-3 py-2.5 m-0">
            {msg}
          </p>
        </div>
      )}

      {/* Notes */}
      <div className="px-4 py-3 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 mb-1.5">
          Internal Notes <Tip placement="right" text="Only visible to your TRS team — the contact never sees these. Use this to record context like which insurer to quote, a follow-up date, or notes from a call." />
        </p>
        <textarea
          value={notesText}
          onChange={e => setNotesText(e.target.value)}
          onBlur={() => onNotesSave(lead.id, notesText)}
          placeholder="Add notes…" rows={4}
          className="w-full box-border text-[12px] text-foreground leading-[1.6] border border-border rounded-lg px-2.5 py-2 resize-none bg-muted/30 outline-none font-sans focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  )
}

// ── Inline AI Reply row ───────────────────────────────────────────────────────

function InlineReplyRow({ lead, onStatus, onCollapse }: {
  lead:       Lead
  onStatus:   (id: string, s: string) => void
  onCollapse: () => void
}) {
  const router = useRouter()
  const log    = useAuditLog()
  const msg    = messagePreview(lead)

  // Any status beyond 'new' means a reply was already sent
  const alreadySent = lead.status !== 'new' && lead.status !== 'dropped'
  const [draftText,  setDraftText]  = useState('')
  const [draftId,    setDraftId]    = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [sending,    setSending]    = useState(false)
  const [sendError,  setSendError]  = useState<string | null>(null)
  const [sent,       setSent]       = useState(alreadySent)
  const hasLoadedRef = useRef(false)

  // Auto-load existing draft once on mount
  useEffect(() => {
    if (hasLoadedRef.current || sent) return
    if (!lead.ai_draft_id || !lead.email) return
    hasLoadedRef.current = true
    setGenerating(true)
    fetch(`/api/inbound/auto-draft?leadId=${lead.id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { content: string | null; draftId: string | null } | null) => {
        if (d?.content) { setDraftText(d.content); setDraftId(d.draftId) }
      })
      .catch(() => {})
      .finally(() => setGenerating(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function generateDraft() {
    setGenerating(true); setSendError(null)
    try {
      const res  = await fetch('/api/inbound/auto-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, force: true }),
      })
      const data = await res.json()
      if (data.content) {
        setDraftText(data.content); setDraftId(data.draftId ?? null)
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id, name: displayName(lead), email: lead.email,
          company: lead.company, topic: lead.topic,
          originalMessage: msg, draft: draftText.trim(),
          draftId: draftId ?? null,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setSent(true)
        onStatus(lead.id, 'contacted')
        log({ action: 'draft.approved', resource_type: 'inbound_lead', resource_id: lead.id, metadata: { contact: displayName(lead), chars: draftText.length } })
        // Navigate immediately to engagement, pre-selecting this lead
        router.push(`/engagement?lead=${lead.id}`)
      } else {
        setSendError(data.error ?? 'Send failed')
      }
    } catch { setSendError('Network error') }
    finally { setSending(false) }
  }

  if (sent) {
    return (
      <tr>
        <td colSpan={9} className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Check size={14} className="text-emerald-600 flex-shrink-0" />
              <span className="text-[12px] text-emerald-700 font-medium">Reply sent to {lead.email}</span>
              <a href={`/engagement?lead=${lead.id}`}
                className="text-[11px] font-semibold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-1 no-underline hover:bg-emerald-500/15">
                View in Engagement Agent →
              </a>
            </div>
            <button onClick={onCollapse} className="bg-transparent border-0 p-0 cursor-pointer text-emerald-400 hover:text-emerald-600">
              <ChevronUp size={14} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={9} className="px-4 py-4 bg-blue-50/60 border-b border-blue-100">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue-600 flex items-center gap-1.5">
              <Sparkles size={11} /> AI Reply Draft
              <Tip text="Draft generated from TRS FAQ docs only — no pricing included. Review and edit before sending." />
            </span>
            <div className="flex items-center gap-2">
              {draftText && (
                <button onClick={generateDraft} disabled={generating}
                  className="bg-transparent border-0 cursor-pointer text-[11px] text-blue-400 p-0 hover:text-blue-600">
                  {generating ? 'Regenerating…' : 'Regenerate'}
                </button>
              )}
              <button onClick={onCollapse} className="bg-transparent border-0 p-0 cursor-pointer text-blue-300 hover:text-blue-500">
                <ChevronUp size={14} />
              </button>
            </div>
          </div>

          {!draftText ? (
            <div className="flex items-center gap-3">
              <button onClick={generateDraft} disabled={generating}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md border-0 cursor-pointer"
                style={{ background: generating ? '#dbeafe' : '#1d4ed8', color: generating ? '#93c5fd' : '#fff' }}
              >
                <Sparkles size={12} /> {generating ? 'Generating…' : 'Generate Reply'}
              </button>
              {sendError && <span className="text-[11px] text-destructive">{sendError}</span>}
            </div>
          ) : (
            <>
              <textarea
                value={draftText}
                onChange={e => setDraftText(e.target.value)}
                rows={7}
                className="w-full box-border text-[12px] text-blue-900 leading-[1.7] border border-blue-200 rounded-lg px-3 py-2.5 resize-y bg-white outline-none font-sans focus:ring-1 focus:ring-blue-300"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-blue-400 flex items-center gap-1">
                  To: {lead.email}
                  <Tip text="Sent from TRS operations email. The lead sees a normal email — no AI mention." />
                </span>
                <div className="flex items-center gap-2">
                  {sendError && <span className="text-[11px] text-destructive">{sendError}</span>}
                  <button onClick={sendReply} disabled={sending || !draftText.trim()}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md border-0 cursor-pointer disabled:opacity-50"
                    style={{ background: sending ? '#dbeafe' : '#1d4ed8', color: sending ? '#93c5fd' : '#fff' }}
                  >
                    <Send size={12} /> {sending ? 'Sending…' : 'Send Reply'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Field helper ──────────────────────────────────────────────────────────────

function Field({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 mb-0.5">{label}</p>
      <p className={cn('text-foreground/80 break-all leading-relaxed m-0', small ? 'text-[11px]' : 'text-[12px]')}>{value}</p>
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

async function patchNotes(id: string, notes: string) {
  await fetch('/api/leads', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, notes }),
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
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const data = await fetchLeads(); setLeads(data); setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false); setRefreshing(false) }
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

  const totalNew = leads.filter(l => l.status === 'new').length
  const waCount  = leads.filter(l => WA_SOURCES.has(l.source)).length
  const emCount  = leads.filter(l => EMAIL_SOURCES.has(l.source)).length
  const waNew    = leads.filter(l => WA_SOURCES.has(l.source) && l.status === 'new').length
  const emNew    = leads.filter(l => EMAIL_SOURCES.has(l.source) && l.status === 'new').length

  const FILTERS: { key: Filter; label: string; count: number; newCount: number }[] = [
    { key: 'all',      label: 'All Leads',   count: leads.length, newCount: totalNew },
    { key: 'new',      label: 'New',         count: totalNew,     newCount: 0 },
    { key: 'email',    label: 'Email / Form', count: emCount,      newCount: emNew },
    { key: 'whatsapp', label: 'WhatsApp',    count: waCount,      newCount: waNew },
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
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Top bar */}
      <div className="px-4 sm:px-6 pt-5 pb-0 bg-background flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-foreground m-0">Inbound Leads</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5 mb-0">Enquiries from website forms and email</p>
          </div>
          <button onClick={() => load(true)} className="bg-card border border-border rounded-md cursor-pointer text-muted-foreground flex items-center gap-1.5 px-3 py-1.5 text-[12px] hover:bg-muted/50">
            <RefreshCw size={13} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Stat cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard label="Total Leads"  value={leads.length} color="#2563eb" />
            <StatCard label="New"          value={totalNew}     color="#2563eb" highlight />
            <StatCard label="Email / Form" value={emCount}      sub={emNew > 0 ? `${emNew} new` : undefined} color="#7c3aed" />
            <StatCard label="WhatsApp"     value={waCount}      sub={waNew > 0 ? `${waNew} new` : undefined} color="#0891b2" />
          </div>
        )}
      </div>

      {/* Filter + search bar */}
      <div className="px-4 sm:px-6 pb-3 flex items-center gap-2.5 bg-background flex-shrink-0 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn(
                'flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md cursor-pointer border transition-all',
                filter === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted/50'
              )}
            >
              {f.label}
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', filter === f.key ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground/70')}>
                {f.count}
              </span>
              {f.newCount > 0 && (
                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', filter === f.key ? 'bg-white' : 'bg-primary')} />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 bg-card border border-border rounded-md px-2.5 h-[34px] flex-1 max-w-[320px]">
          <Search size={12} className="text-muted-foreground/50 flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone, topic…"
            className="flex-1 bg-transparent border-0 outline-none text-[12px] text-foreground font-sans" />
          {search && (
            <button onClick={() => setSearch('')} className="bg-transparent border-0 p-0 cursor-pointer">
              <X size={11} className="text-muted-foreground/50" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden px-4 sm:px-6 pb-6 gap-4 bg-background">

        {/* Table / card list — hidden on mobile when detail panel is open */}
        <div className={cn(
          'flex-1 overflow-y-auto bg-card border border-border rounded-lg shadow-sm',
          selectedId ? 'hidden sm:flex sm:flex-col overflow-x-auto' : 'overflow-x-auto'
        )}>
          {loading ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground/50">Loading…</div>
          ) : error ? (
            <div className="py-16 text-center text-[13px] text-destructive">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground/50">
              {search ? `No leads matching "${search}"` : 'No leads yet.'}
            </div>
          ) : (
            <>
              {/* ── Desktop table (≥640px) ── */}
              <table className="hidden sm:table w-full border-collapse text-[13px] min-w-[760px]">
                <thead>
                  <tr className="border-b border-border sticky top-0 z-[1] bg-card">
                    <Th w={110}>Channel <Tip text="Shows where this lead came from — Website = contact form, Email = direct email, WhatsApp = click-to-chat button. Manual means a team member added them." /></Th>
                    <Th w={120}>First Name</Th>
                    <Th w={120}>Last Name</Th>
                    <Th w={150}>Company</Th>
                    <Th w={160}>Topic</Th>
                    <Th>Message</Th>
                    <Th w={130}>Status <Tip text="Tracks where this lead sits in your pipeline, from New (not yet replied) to Converted (policy placed). Update this as conversations progress." /></Th>
                    <Th w={90} right>Time</Th>
                    <Th w={40} right><Tip text="Click to expand and draft a reply email inline." /></Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lead => {
                    const isActive   = lead.id === selectedId
                    const isExpanded = lead.id === expandedId
                    const isEmail    = channelOf(lead) === 'email' && !!lead.email
                    const msg        = messagePreview(lead)
                    return (
                      <Fragment key={lead.id}>
                        <tr
                          onClick={() => setSelectedId(lead.id === selectedId ? null : lead.id)}
                          className={cn('border-b transition-colors cursor-pointer', isActive ? 'bg-primary/5' : isExpanded ? 'bg-blue-50/40' : 'hover:bg-muted/50')}
                          style={{ borderLeft: `3px solid ${isActive ? 'hsl(var(--primary))' : isExpanded ? '#93c5fd' : 'transparent'}` }}
                        >
                          <td className="px-3.5 py-2.5 align-middle">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {lead.status === 'new' && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                              <ChannelBadge source={lead.source} />
                              {lead.ai_draft_id && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 whitespace-nowrap">
                                  <Sparkles size={8} />AI
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <span className={cn('text-foreground', lead.status === 'new' ? 'font-semibold' : 'font-normal')}>{lead.first_name || '—'}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <span className={cn('text-foreground', lead.status === 'new' ? 'font-semibold' : 'font-normal')}>{lead.last_name || '—'}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle text-muted-foreground max-w-0">
                            <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{lead.company || '—'}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle text-muted-foreground max-w-0">
                            <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{lead.topic || lead.department || '—'}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle text-muted-foreground/60 max-w-0 text-[12px]">
                            <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{msg || '—'}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle"><StatusDropdown lead={lead} onChange={handleStatus} /></td>
                          <td className="px-3.5 py-2.5 align-middle text-right text-muted-foreground/50 text-[11px] whitespace-nowrap">{timeAgo(lead.created_at)}</td>
                          <td className="px-2 py-2.5 align-middle text-right">
                            {isEmail && (
                              <button
                                onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : lead.id) }}
                                className={cn('bg-transparent border-0 cursor-pointer p-1 rounded hover:bg-muted/60', isExpanded ? 'text-blue-500' : 'text-muted-foreground/40 hover:text-muted-foreground')}
                                title={isExpanded ? 'Collapse' : 'Draft & send reply'}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && isEmail && (
                          <InlineReplyRow
                            lead={lead}
                            onStatus={handleStatus}
                            onCollapse={() => setExpandedId(null)}
                          />
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>

              {/* ── Mobile card list (<640px) ── */}
              <div className="sm:hidden divide-y divide-border">
                {filtered.map(lead => {
                  const isActive = lead.id === selectedId
                  const msg      = messagePreview(lead)
                  return (
                    <div key={lead.id}
                      onClick={() => setSelectedId(lead.id === selectedId ? null : lead.id)}
                      className={cn('px-4 py-3 cursor-pointer', isActive ? 'bg-primary/5' : '')}
                      style={{ borderLeft: `3px solid ${isActive ? 'hsl(var(--primary))' : 'transparent'}` }}
                    >
                      {/* Top row: channel + name + time */}
                      <div className="flex items-center gap-2 mb-1">
                        {lead.status === 'new' && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                        <ChannelBadge source={lead.source} />
                        <span className={cn('flex-1 text-[13px] truncate', lead.status === 'new' ? 'font-semibold text-foreground' : 'text-foreground')}>
                          {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}
                        </span>
                        <span className="text-[11px] text-muted-foreground/50 flex-shrink-0">{timeAgo(lead.created_at)}</span>
                      </div>
                      {/* Company + topic */}
                      {(lead.company || lead.topic || lead.department) && (
                        <p className="text-[12px] text-muted-foreground truncate mb-1">
                          {[lead.company, lead.topic ?? lead.department].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {/* Message preview */}
                      {msg && <p className="text-[12px] text-muted-foreground/60 truncate mb-1.5">{msg}</p>}
                      {/* Status */}
                      <div onClick={e => e.stopPropagation()}>
                        <StatusDropdown lead={lead} onChange={handleStatus} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {!loading && filtered.length > 0 && (
            <p className="px-5 py-3 text-[11px] text-muted-foreground/40 m-0">
              {filtered.length} lead{filtered.length !== 1 ? 's' : ''} · {totalNew} new
            </p>
          )}
        </div>

        {/* Detail panel — full-width on mobile, w-80 sidebar on desktop */}
        {selectedLead && (
          <div className="w-full sm:w-80 sm:flex-shrink-0 bg-card border border-border rounded-lg shadow-sm overflow-y-auto">
            <button
              onClick={() => setSelectedId(null)}
              className="sm:hidden flex items-center gap-1.5 px-4 pt-3 pb-1 text-[12px] text-muted-foreground bg-transparent border-0 cursor-pointer"
            >
              ← Back to list
            </button>
            <DetailPanel lead={selectedLead} onStatus={handleStatus} onClose={() => setSelectedId(null)} onNotesSave={patchNotes} />
          </div>
        )}
      </div>
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
    <th className={cn('h-10 px-3 align-middle text-[12px] font-medium text-muted-foreground whitespace-nowrap', right ? 'text-right' : 'text-left')}
      style={{ width: w }}>
      {children}
    </th>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, highlight }: {
  label: string; value: number; sub?: string; color: string; highlight?: boolean
}) {
  return (
    <div className="rounded-lg px-5 py-4 border shadow-sm"
      style={{ background: highlight ? color : 'hsl(var(--card))', border: `1px solid ${highlight ? color : 'hsl(var(--border))'}` }}>
      <p className="text-[12px] font-medium mb-1.5 m-0" style={{ color: highlight ? 'rgba(255,255,255,0.85)' : 'hsl(var(--muted-foreground))' }}>{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-bold leading-none tracking-tight" style={{ color: highlight ? '#fff' : 'hsl(var(--foreground))' }}>{value}</span>
        {sub && (
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
            style={{ color: highlight ? 'rgba(255,255,255,0.75)' : color, background: highlight ? 'rgba(255,255,255,0.2)' : `${color}18` }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  )
}
