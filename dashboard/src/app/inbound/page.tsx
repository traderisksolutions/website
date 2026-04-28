'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { MessageCircle, Mail, Phone, Copy, Check, RefreshCw, ChevronDown } from 'lucide-react'

// ── API calls — Supabase key stays server-side in /api/leads ──────────────────
async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

async function patchStatus(id: string, status: string) {
  await fetch('/api/leads', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  })
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Lead = {
  id:           string
  created_at:   string
  source:       string
  first_name:   string | null
  last_name:    string | null
  email:        string | null
  phone:        string | null
  company:      string | null
  department:   string | null
  contact_type: string | null
  topic:        string | null
  details:      string | null
  message:      string | null
  page_url:     string | null
  status:       string
}

// ── Constants ──────────────────────────────────────────────────────────────────
const DEPT: Record<string, string> = {
  'Sales':            '#3b82f6',
  'Customer Support': '#f59e0b',
  'Claims':           '#ef4444',
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#1d4ed8', bg: 'rgba(59,130,246,0.10)'  },
  contacted: { label: 'Contacted', color: '#b45309', bg: 'rgba(245,158,11,0.10)'  },
  qualified: { label: 'Qualified', color: '#15803d', bg: 'rgba(34,197,94,0.10)'   },
  converted: { label: 'Converted', color: '#7e22ce', bg: 'rgba(168,85,247,0.10)'  },
  dropped:   { label: 'Dropped',   color: '#4b5563', bg: 'rgba(107,114,128,0.10)' },
}
const ALL_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'dropped']

const SOURCE_LABEL: Record<string, string> = {
  whatsapp_click: 'WhatsApp',
  website_form:   'Email form',
  claims_form:    'Claims form',
  manual:         'Manual',
  email:          'Email',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || '—'
}

function bodyText(l: Lead) {
  return l.details || l.message || ''
}

// ── Card ───────────────────────────────────────────────────────────────────────
function LeadCard({ lead, onStatus }: { lead: Lead; onStatus: (id: string, s: string) => void }) {
  const [open,       setOpen]       = useState(false)
  const [statusMenu, setStatusMenu] = useState(false)
  const [copied,     setCopied]     = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const deptColor = DEPT[lead.department ?? ''] ?? '#9ca3af'
  const st        = STATUS[lead.status] ?? STATUS.new
  const body      = bodyText(lead)
  const waPhone   = lead.phone ? lead.phone.replace(/\D/g, '') : null

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1800)
  }

  // close status menu on outside click
  useEffect(() => {
    if (!statusMenu) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setStatusMenu(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [statusMenu])

  return (
    <div
      className="glass rounded-xl overflow-visible"
      style={{ borderLeft: `3px solid ${deptColor}` }}
    >
      {/* ── Collapsed row ── */}
      <div
        className="px-4 py-3.5 flex items-start gap-4 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        {/* Left: name + preview */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            {lead.department && (
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                style={{ background: `${deptColor}18`, color: deptColor }}
              >
                {lead.department}
              </span>
            )}
            <span className="text-[13px] font-semibold text-gray-900">{fullName(lead)}</span>
            {lead.company && <span className="text-xs text-gray-400">· {lead.company}</span>}
            {lead.topic   && <span className="text-xs text-gray-500">— {lead.topic}</span>}
          </div>
          {body && (
            <p className="text-xs text-gray-400 truncate leading-relaxed">{body}</p>
          )}
        </div>

        {/* Right: time + source + status */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <span>{timeAgo(lead.created_at)}</span>
            {lead.source === 'whatsapp_click'
              ? <MessageCircle size={11} className="text-green-500" strokeWidth={2} />
              : lead.source === 'claims_form'
              ? <span style={{ color: '#ef4444', fontSize: 10, fontWeight: 700 }}>CLM</span>
              : <Mail size={11} className="text-gray-400" strokeWidth={2} />
            }
          </div>

          {/* Status pill + dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setStatusMenu(m => !m) }}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
              style={{ background: st.bg, color: st.color }}
            >
              {st.label}
              <ChevronDown size={9} strokeWidth={3} />
            </button>

            {statusMenu && (
              <div
                className="absolute right-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden py-1"
                style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.09)', minWidth: 136 }}
              >
                {ALL_STATUSES.map(s => {
                  const sc = STATUS[s]
                  return (
                    <button
                      key={s}
                      onClick={e => { e.stopPropagation(); onStatus(lead.id, s); setStatusMenu(false) }}
                      className="w-full text-left px-3 py-2 text-[12px] font-medium flex items-center gap-2.5 hover:bg-gray-50 transition-colors"
                      style={{ color: lead.status === s ? sc.color : '#555' }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sc.color }} />
                      {sc.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {open && (
        <div
          className="px-4 pb-4 space-y-4"
          style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Full text */}
          {body && (
            <div className="pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                {lead.source === 'whatsapp_click' ? 'WhatsApp message' : 'Details'}
              </p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{body}</p>
            </div>
          )}

          {/* Contact grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            {lead.email && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Email</p>
                <button
                  onClick={() => copy(lead.email!, 'email')}
                  className="flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <span className="truncate max-w-[140px]">{lead.email}</span>
                  {copied === 'email'
                    ? <Check size={11} className="shrink-0 text-green-500" />
                    : <Copy size={10} className="shrink-0 text-gray-300 hover:text-gray-500" />}
                </button>
              </div>
            )}
            {lead.phone && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Phone</p>
                <button
                  onClick={() => copy(lead.phone!, 'phone')}
                  className="flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900 transition-colors"
                >
                  {lead.phone}
                  {copied === 'phone'
                    ? <Check size={11} className="shrink-0 text-green-500" />
                    : <Copy size={10} className="shrink-0 text-gray-300 hover:text-gray-500" />}
                </button>
              </div>
            )}
            {lead.contact_type && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Type</p>
                <p className="text-xs text-gray-700">{lead.contact_type}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Source</p>
              <p className="text-xs text-gray-700">{SOURCE_LABEL[lead.source] ?? lead.source}</p>
            </div>
          </div>

          {/* Actions */}
          <div
            className="flex items-center gap-2 flex-wrap pt-3"
            style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
          >
            {waPhone && (
              <a
                href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                  `Hi ${lead.first_name || 'there'}, this is TRS. Thanks for reaching out — happy to help with ${lead.topic || 'your enquiry'}.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: '#22c55e', color: '#fff' }}
              >
                <MessageCircle size={12} strokeWidth={2} />
                WhatsApp
              </a>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}?subject=Your ${lead.topic || 'enquiry'} with TRS&body=Hi ${lead.first_name || ''},`}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
                style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#555' }}
              >
                <Mail size={12} strokeWidth={2} />
                Email
              </a>
            )}
            {lead.phone && (
              <a
                href={`tel:${waPhone}`}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
                style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#555' }}
              >
                <Phone size={12} strokeWidth={2} />
                Call
              </a>
            )}

            {/* Quick status advance — right-aligned */}
            {lead.status === 'new' && (
              <button
                onClick={() => onStatus(lead.id, 'contacted')}
                className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
                style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#555' }}
              >
                Mark contacted →
              </button>
            )}
            {lead.status === 'contacted' && (
              <button
                onClick={() => onStatus(lead.id, 'qualified')}
                className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
                style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#555' }}
              >
                Mark qualified →
              </button>
            )}
            {lead.status === 'qualified' && (
              <button
                onClick={() => onStatus(lead.id, 'converted')}
                className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: '#18181b', color: '#fff' }}
              >
                Mark converted →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
type Filter = 'all' | 'new' | 'Sales' | 'Customer Support' | 'Claims'

export default function InboundPage() {
  const [leads,      setLeads]      = useState<Lead[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [filter,     setFilter]     = useState<Filter>('all')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const data = await fetchLeads()
      setLeads(data)
      setError(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg.includes('42501') || msg.includes('permission')
        ? 'Read access denied. Uncomment the dev read policy in inbound_leads.sql or use a service role key.'
        : msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 30000)
    return () => clearInterval(t)
  }, [load])

  function handleStatus(id: string, status: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    patchStatus(id, status)
  }

  const newCount  = leads.filter(l => l.status === 'new').length
  const counts = {
    all:               leads.length,
    new:               newCount,
    Sales:             leads.filter(l => l.department === 'Sales').length,
    'Customer Support':leads.filter(l => l.department === 'Customer Support').length,
    Claims:            leads.filter(l => l.department === 'Claims').length,
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',               label: 'All'     },
    { key: 'new',               label: 'New'     },
    { key: 'Sales',             label: 'Sales'   },
    { key: 'Customer Support',  label: 'Support' },
    { key: 'Claims',            label: 'Claims'  },
  ]

  const filtered = leads.filter(l => {
    if (filter === 'all')  return true
    if (filter === 'new')  return l.status === 'new'
    return l.department === filter
  })

  return (
    <div className="flex flex-col flex-1">

      {/* Top bar */}
      <div
        className="px-6 flex items-center justify-between shrink-0"
        style={{
          height:           52,
          background:       'rgba(255,255,255,0.72)',
          backdropFilter:   'blur(28px) saturate(200%)',
          WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          borderBottom:     '1px solid rgba(200,200,204,0.45)',
          boxShadow:        '0 1px 0 rgba(255,255,255,0.6), 0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold text-gray-800">Inbound Leads</h1>
          {!loading && newCount > 0 && (
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(59,130,246,0.12)', color: '#1d4ed8' }}
            >
              {newCount} new
            </span>
          )}
        </div>
        <button
          onClick={() => load(true)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          <RefreshCw
            size={13}
            strokeWidth={2}
            className={refreshing ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      <main className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Filter tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(f => {
            const active = filter === f.key
            const c = counts[f.key as keyof typeof counts]
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  background: active ? '#18181b' : 'rgba(0,0,0,0.05)',
                  color:      active ? '#fff'     : '#555',
                }}
              >
                {f.label}
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: active ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
                    color:      active ? '#fff' : '#888',
                  }}
                >
                  {c}
                </span>
              </button>
            )
          })}
        </div>

        {/* States */}
        {loading ? (
          <div className="flex items-center justify-center py-32 text-sm text-gray-400">
            Loading…
          </div>
        ) : error ? (
          <div className="glass rounded-xl p-8 text-center max-w-lg mx-auto">
            <p className="text-sm font-semibold text-red-500 mb-2">Could not load leads</p>
            <p className="text-xs text-gray-400 leading-relaxed">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-32 text-sm text-gray-400">
            No leads
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(lead => (
              <LeadCard key={lead.id} lead={lead} onStatus={handleStatus} />
            ))}
          </div>
        )}

      </main>
    </div>
  )
}
