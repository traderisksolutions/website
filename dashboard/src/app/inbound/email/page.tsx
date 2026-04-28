'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Mail, Phone, Copy, Check, RefreshCw, ChevronDown, MessageCircle } from 'lucide-react'

const EMAIL_SOURCES = new Set(['website_form', 'email', 'manual'])

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  const all: Lead[] = await res.json()
  return all.filter(l => EMAIL_SOURCES.has(l.source))
}

async function patchStatus(id: string, status: string) {
  await fetch('/api/leads', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  })
}

type Lead = {
  id: string; created_at: string; source: string
  first_name: string | null; last_name: string | null
  email: string | null; phone: string | null; company: string | null
  department: string | null; contact_type: string | null
  topic: string | null; details: string | null; message: string | null
  page_url: string | null; status: string
}

const DEPT: Record<string, string> = {
  'Sales':            '#3b82f6',
  'Customer Support': '#f59e0b',
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
  website_form: 'Website form',
  manual:       'Manual',
  email:        'Email',
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || '—'
}

function bodyText(l: Lead) { return l.details || l.message || '' }

// ── Lead card ─────────────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (!statusMenu) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setStatusMenu(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [statusMenu])

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e8e8e8',
      borderLeft: `3px solid ${deptColor}`,
      borderRadius: 10,
      overflow: 'visible',
    }}>
      {/* Collapsed row */}
      <div
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 16, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {lead.department && (
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '2px 6px', borderRadius: 5,
                background: `${deptColor}18`, color: deptColor,
              }}>
                {lead.department}
              </span>
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{fullName(lead)}</span>
            {lead.company && <span style={{ fontSize: 12, color: '#aaa' }}>· {lead.company}</span>}
            {lead.topic   && <span style={{ fontSize: 12, color: '#666' }}>— {lead.topic}</span>}
          </div>
          {body && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {body}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#bbb' }}>{timeAgo(lead.created_at)}</span>
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setStatusMenu(m => !m) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                background: st.bg, color: st.color, border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {st.label}
              <ChevronDown size={9} strokeWidth={3} />
            </button>
            {statusMenu && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10,
                boxShadow: '0 4px 24px rgba(0,0,0,0.10)', minWidth: 140, zIndex: 50, padding: '4px 0',
              }}>
                {ALL_STATUSES.map(s => {
                  const sc = STATUS[s]
                  return (
                    <button
                      key={s}
                      onClick={e => { e.stopPropagation(); onStatus(lead.id, s); setStatusMenu(false) }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '8px 12px',
                        fontSize: 12, fontWeight: 500, background: 'none', border: 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        color: lead.status === s ? sc.color : '#555',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: sc.color, flexShrink: 0 }} />
                      {sc.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded panel */}
      {open && (
        <div style={{ borderTop: '1px solid #f0f0f0', padding: '16px 16px 16px' }} onClick={e => e.stopPropagation()}>
          {body && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb' }}>Details</p>
              <p style={{ margin: 0, fontSize: 13, color: '#444', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{body}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px 24px', marginBottom: 16 }}>
            {lead.email && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb' }}>Email</p>
                <button onClick={() => copy(lead.email!, 'email')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#333' }}>
                  <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</span>
                  {copied === 'email' ? <Check size={11} style={{ color: '#22c55e' }} /> : <Copy size={10} style={{ color: '#ccc' }} />}
                </button>
              </div>
            )}
            {lead.phone && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb' }}>Phone</p>
                <button onClick={() => copy(lead.phone!, 'phone')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#333' }}>
                  {lead.phone}
                  {copied === 'phone' ? <Check size={11} style={{ color: '#22c55e' }} /> : <Copy size={10} style={{ color: '#ccc' }} />}
                </button>
              </div>
            )}
            {lead.contact_type && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb' }}>Type</p>
                <p style={{ margin: 0, fontSize: 12, color: '#333' }}>{lead.contact_type}</p>
              </div>
            )}
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb' }}>Source</p>
              <p style={{ margin: 0, fontSize: 12, color: '#333' }}>{SOURCE_LABEL[lead.source] ?? lead.source}</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
            {waPhone && (
              <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Hi ${lead.first_name || 'there'}, this is TRS. Happy to help with ${lead.topic || 'your enquiry'}.`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, background: '#22c55e', color: '#fff', textDecoration: 'none' }}>
                <MessageCircle size={12} strokeWidth={2} /> WhatsApp
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}?subject=Your ${lead.topic || 'enquiry'} with TRS&body=Hi ${lead.first_name || ''},`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8, border: '1px solid #e8e8e8', color: '#555', textDecoration: 'none', background: '#fff' }}>
                <Mail size={12} strokeWidth={2} /> Email
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${waPhone}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8, border: '1px solid #e8e8e8', color: '#555', textDecoration: 'none', background: '#fff' }}>
                <Phone size={12} strokeWidth={2} /> Call
              </a>
            )}
            {lead.status === 'new' && (
              <button onClick={() => onStatus(lead.id, 'contacted')}
                style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8, border: '1px solid #e8e8e8', color: '#555', background: '#fff', cursor: 'pointer' }}>
                Mark contacted →
              </button>
            )}
            {lead.status === 'contacted' && (
              <button onClick={() => onStatus(lead.id, 'qualified')}
                style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8, border: '1px solid #e8e8e8', color: '#555', background: '#fff', cursor: 'pointer' }}>
                Mark qualified →
              </button>
            )}
            {lead.status === 'qualified' && (
              <button onClick={() => onStatus(lead.id, 'converted')}
                style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, background: '#111', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Mark converted →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Filter = 'all' | 'new' | 'Sales' | 'Customer Support'

export default function EmailLeadsPage() {
  const [leads,      setLeads]      = useState<Lead[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [filter,     setFilter]     = useState<Filter>('all')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      setLeads(await fetchLeads())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
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

  const newCount = leads.filter(l => l.status === 'new').length
  const counts = {
    all:               leads.length,
    new:               newCount,
    Sales:             leads.filter(l => l.department === 'Sales').length,
    'Customer Support':leads.filter(l => l.department === 'Customer Support').length,
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',              label: 'All'     },
    { key: 'new',              label: 'New'     },
    { key: 'Sales',            label: 'Sales'   },
    { key: 'Customer Support', label: 'Support' },
  ]

  const filtered = leads.filter(l => {
    if (filter === 'all') return true
    if (filter === 'new') return l.status === 'new'
    return l.department === filter
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

      {/* Top bar */}
      <div style={{
        height: 52, padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111' }}>Email Leads</h1>
          {!loading && newCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(59,130,246,0.10)', color: '#1d4ed8' }}>
              {newCount} new
            </span>
          )}
        </div>
        <button
          onClick={() => load(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <RefreshCw size={13} strokeWidth={2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* Filter tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {FILTERS.map(f => {
            const isActive = filter === f.key
            const c = counts[f.key as keyof typeof counts]
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 8,
                  background: isActive ? '#111' : '#fff',
                  color: isActive ? '#fff' : '#666',
                  border: isActive ? '1px solid #111' : '1px solid #e8e8e8',
                  cursor: 'pointer',
                }}
              >
                {f.label}
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5,
                  background: isActive ? 'rgba(255,255,255,0.18)' : '#f4f4f5',
                  color: isActive ? '#fff' : '#888',
                }}>
                  {c}
                </span>
              </button>
            )
          })}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0', fontSize: 13, color: '#bbb' }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#ef4444' }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0', fontSize: 13, color: '#bbb' }}>No leads</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(lead => (
              <LeadCard key={lead.id} lead={lead} onStatus={handleStatus} />
            ))}
          </div>
        )}
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
