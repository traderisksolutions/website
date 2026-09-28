'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Copy, Check, RefreshCw, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn, Chip, Segmented } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  const all: Lead[] = await res.json()
  return all.filter(l => l.source === 'claims_form' || l.department === 'Claims')
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

const STATUS_LABEL: Record<string, string> = {
  new: 'New', contacted: 'Contacted', qualified: 'Qualified', converted: 'Converted', dropped: 'Dropped',
}
const ALL_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'dropped']

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

function fullName(l: Lead) { return [l.first_name, l.last_name].filter(Boolean).join(' ') || '—' }
function bodyText(l: Lead) { return l.details || l.message || '' }

function LeadCard({ lead, onStatus }: { lead: Lead; onStatus: (id: string, s: string) => void }) {
  const [open,       setOpen]       = useState(false)
  const [statusMenu, setStatusMenu] = useState(false)
  const [copied,     setCopied]     = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const body    = bodyText(lead)
  const waPhone = lead.phone ? lead.phone.replace(/\D/g, '') : null

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

  const secondaryLink = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] border bg-white text-[13.5px] font-medium no-underline hover:bg-[#f8f9fa]'

  return (
    <div className="rounded-[16px] border border-[#e8eaed] bg-white">
      <div
        className="px-5 py-4 flex items-start gap-4 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-medium" style={{ color: INK }}>{fullName(lead)}</span>
            {lead.company && <span className="text-[13.5px]" style={{ color: MUTED }}>· {lead.company}</span>}
            {lead.topic   && <span className="text-[13.5px]" style={{ color: MUTED }}>— {lead.topic}</span>}
          </div>
          {body && (
            <p className="m-0 mt-1 text-[13.5px] truncate" style={{ color: MUTED }}>
              {body}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="text-[12.5px] tabular-nums" style={{ color: '#80868b' }}>{timeAgo(lead.created_at)}</span>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setStatusMenu(m => !m) }}
              aria-haspopup="menu"
              aria-expanded={statusMenu}
              className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium border-0 cursor-pointer"
              style={{ background: '#f1f3f4', color: '#3c4043' }}
            >
              {STATUS_LABEL[lead.status] ?? STATUS_LABEL.new} <ChevronDown size={11} />
            </button>
            {statusMenu && (
              <div role="menu" className="absolute right-0 top-[calc(100%+4px)] bg-white rounded-[12px] min-w-[150px] z-50 py-1" style={{ border: '1px solid #e8eaed', boxShadow: '0 16px 48px rgba(32,33,36,0.14)' }}>
                {ALL_STATUSES.map(s => (
                  <button key={s} type="button" role="menuitem" onClick={e => { e.stopPropagation(); onStatus(lead.id, s); setStatusMenu(false) }}
                    className={cn('w-full text-left px-3 py-2 text-[13.5px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]', lead.status === s && 'font-medium')}
                    style={{ color: INK }}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="px-5 py-4 border-t border-[#e8eaed]" onClick={e => e.stopPropagation()}>
          {body && (
            <div className="mb-4">
              <p className="m-0 mb-1.5 text-[12.5px]" style={{ color: MUTED }}>Claim details</p>
              <p className="m-0 text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: INK }}>{body}</p>
            </div>
          )}
          <div className="grid gap-x-6 gap-y-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {lead.email && (
              <div>
                <p className="m-0 mb-1 text-[12.5px]" style={{ color: MUTED }}>Email</p>
                <button type="button" onClick={() => copy(lead.email!, 'email')} className="bg-transparent border-0 p-0 cursor-pointer inline-flex items-center gap-1.5 text-[14px]" style={{ color: INK }}>
                  <span className="max-w-[180px] truncate">{lead.email}</span>
                  {copied === 'email' ? <Check size={12} style={{ color: MUTED }} /> : <Copy size={12} style={{ color: '#9aa0a6' }} />}
                </button>
              </div>
            )}
            {lead.phone && (
              <div>
                <p className="m-0 mb-1 text-[12.5px]" style={{ color: MUTED }}>Phone</p>
                <button type="button" onClick={() => copy(lead.phone!, 'phone')} className="bg-transparent border-0 p-0 cursor-pointer inline-flex items-center gap-1.5 text-[14px] tabular-nums" style={{ color: INK }}>
                  {lead.phone}
                  {copied === 'phone' ? <Check size={12} style={{ color: MUTED }} /> : <Copy size={12} style={{ color: '#9aa0a6' }} />}
                </button>
              </div>
            )}
            {lead.contact_type && (
              <div>
                <p className="m-0 mb-1 text-[12.5px]" style={{ color: MUTED }}>Type</p>
                <p className="m-0 text-[14px]" style={{ color: INK }}>{lead.contact_type}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-4 border-t border-[#e8eaed]">
            {waPhone && (
              <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer" className={secondaryLink} style={{ borderColor: '#dadce0', color: INK }}>
                WhatsApp
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className={secondaryLink} style={{ borderColor: '#dadce0', color: INK }}>
                Email
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${waPhone}`} className={secondaryLink} style={{ borderColor: '#dadce0', color: INK }}>
                Call
              </a>
            )}
            {lead.status === 'new' && (
              <Btn level="tertiary" className="ml-auto" onClick={() => onStatus(lead.id, 'contacted')}>
                Mark contacted
              </Btn>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ClaimsPage() {
  const [leads,      setLeads]      = useState<Lead[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [filter,     setFilter]     = useState<'all' | 'new'>('all')
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
  const filtered = filter === 'new' ? leads.filter(l => l.status === 'new') : leads
  const countLine = loading
    ? 'Loading…'
    : `${leads.length} claim${leads.length === 1 ? '' : 's'}${newCount > 0 ? ` · ${newCount} new` : ''}`

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Claims</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>{countLine}</p>
          </div>
          <Btn level="secondary" className="h-12 px-5 rounded-[12px] text-[15px]" onClick={() => load(true)} loading={refreshing}>
            {!refreshing && <RefreshCw size={14} />} Refresh
          </Btn>
        </div>

        <div className="mt-8">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: leads.length },
              { value: 'new', label: 'New', count: newCount },
            ]}
          />
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[72px] rounded-[16px] animate-pulse" style={{ background: '#f1f3f4' }} />)}
            </div>
          ) : error ? (
            <p className="py-16 text-center text-[16px] m-0" style={{ color: '#c5221f' }}>{error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>{filter === 'new' ? 'No new claims.' : 'No claims yet.'}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map(lead => <LeadCard key={lead.id} lead={lead} onStatus={handleStatus} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
