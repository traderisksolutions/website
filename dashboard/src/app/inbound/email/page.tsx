'use client'

import { useEffect, useState, useCallback, useRef, Suspense, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { RefreshCw, Search, X, Sparkles } from 'lucide-react'
import { Tip } from '@/components/Tip'
import { cn } from '@/lib/utils'
import { AppPageHeader } from '@/components/app-shell'
import { ChannelBadge }     from '@/components/inbound/channel-badge'
import { StatusDropdown }   from '@/components/inbound/status-dropdown'
import { LeadDetailPanel }  from '@/components/inbound/lead-detail-panel'
import { InlineReplyRow, ReplyExpandButton } from '@/components/inbound/inline-reply-row'
import type { Lead, Filter } from '@/components/inbound/types'
import { WA_SOURCES, EMAIL_SOURCES, ALL_SOURCES } from '@/components/inbound/constants'
import { channelOf, displayName, messagePreview, timeAgo } from '@/components/inbound/helpers'

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
      const data = await fetchLeads()
      setLeads(data); setError(null)
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

  const totalNew = leads.filter(l => l.status === 'new').length
  const waCount  = leads.filter(l => WA_SOURCES.has(l.source)).length
  const emCount  = leads.filter(l => EMAIL_SOURCES.has(l.source)).length
  const waNew    = leads.filter(l => WA_SOURCES.has(l.source) && l.status === 'new').length
  const emNew    = leads.filter(l => EMAIL_SOURCES.has(l.source) && l.status === 'new').length

  const FILTERS: { key: Filter; label: string; count: number; newCount: number }[] = [
    { key: 'all',      label: 'All Leads',    count: leads.length, newCount: totalNew },
    { key: 'new',      label: 'New',          count: totalNew,     newCount: 0 },
    { key: 'email',    label: 'Email / Form', count: emCount,      newCount: emNew },
    { key: 'whatsapp', label: 'WhatsApp',     count: waCount,      newCount: waNew },
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

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <AppPageHeader
        title="Inbound Leads"
        description="Enquiries from website forms and email"
        actions={
          <button
            onClick={() => load(true)}
            aria-label="Refresh leads"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-[12px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors cursor-pointer"
            style={{ outline: 'none' }}
          >
            <RefreshCw
              size={12}
              strokeWidth={2}
              className={refreshing ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        }
      />

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      {!loading && (
        <div className="px-4 sm:px-6 py-3 bg-background flex-shrink-0 border-b border-[--border-subtle]">
          <div className="kpi-grid grid-cols-2 sm:grid-cols-4">
            <InboundStatCard label="Total Leads"  value={leads.length} color="#2563eb" />
            <InboundStatCard label="New"          value={totalNew}     color="#2563eb" highlight />
            <InboundStatCard label="Email / Form" value={emCount}      sub={emNew > 0 ? `${emNew} new` : undefined} color="#7c3aed" />
            <InboundStatCard label="WhatsApp"     value={waCount}      sub={waNew > 0 ? `${waNew} new` : undefined} color="#0891b2" />
          </div>
        </div>
      )}

      {/* ── Filter + search bar ─────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-2 bg-background flex-shrink-0 border-b border-[--border-subtle] flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap" role="group" aria-label="Filter leads">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn('filter-pill', filter === f.key && 'active')}
            >
              {f.label}
              <span className="filter-pill-count">{f.count}</span>
              {f.newCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-primary opacity-70" />
              )}
            </button>
          ))}
        </div>

        <div className="filter-search flex-1 max-w-[300px]">
          <Search size={12} className="text-muted-foreground/50 flex-shrink-0" aria-hidden />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone, topic…"
            aria-label="Search leads"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="text-muted-foreground/50 hover:text-muted-foreground"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden px-4 sm:px-6 pb-6 gap-4 bg-background">

        {/* Table / card list */}
        <div
          className={cn(
            'flex-1 overflow-y-auto bg-card rounded-lg',
            selectedId ? 'hidden sm:flex sm:flex-col overflow-x-auto' : 'overflow-x-auto',
          )}
        >
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
                  <tr className="border-b border-[--border-subtle] sticky top-0 z-[1] bg-card">
                    <Th w={110}>
                      Channel{' '}
                      <Tip text="Shows where this lead came from — Website = contact form, Email = direct email, WhatsApp = click-to-chat button. Manual means a team member added them." />
                    </Th>
                    <Th w={120}>First Name</Th>
                    <Th w={120}>Last Name</Th>
                    <Th w={150}>Company</Th>
                    <Th w={160}>Topic</Th>
                    <Th>Message</Th>
                    <Th w={130}>
                      Status{' '}
                      <Tip text="Tracks where this lead sits in your pipeline, from New (not yet replied) to Converted (policy placed). Update this as conversations progress." />
                    </Th>
                    <Th w={90} right>Time</Th>
                    <Th w={40} right>
                      <Tip text="Click to expand and draft a reply email inline." />
                    </Th>
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
                          className={cn(
                            'border-b transition-colors cursor-pointer',
                            isActive ? 'bg-primary/5' : isExpanded ? '' : 'hover:bg-muted/50',
                          )}
                          style={{
                            background:  isExpanded && !isActive ? 'var(--primary-light-bg)' : undefined,
                            borderLeft: `3px solid ${isActive ? 'hsl(var(--primary))' : isExpanded ? 'var(--primary-hex)' : 'transparent'}`,
                          }}
                        >
                          <td className="px-3.5 py-2.5 align-middle">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {lead.status === 'new' && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" aria-label="New lead" />
                              )}
                              <ChannelBadge source={lead.source} />
                              {lead.ai_draft_id && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 whitespace-nowrap">
                                  <Sparkles size={8} aria-hidden />AI
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <span className={cn('text-foreground', lead.status === 'new' ? 'font-semibold' : 'font-normal')}>
                              {lead.first_name || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <span className={cn('text-foreground', lead.status === 'new' ? 'font-semibold' : 'font-normal')}>
                              {lead.last_name || '—'}
                            </span>
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
                          <td className="px-3 py-2.5 align-middle" onClick={e => e.stopPropagation()}>
                            <StatusDropdown lead={lead} onChange={handleStatus} />
                          </td>
                          <td className="px-3.5 py-2.5 align-middle text-right text-muted-foreground/50 text-[11px] whitespace-nowrap">
                            {timeAgo(lead.created_at)}
                          </td>
                          <td className="px-2 py-2.5 align-middle text-right" onClick={e => e.stopPropagation()}>
                            {isEmail && (
                              <ReplyExpandButton
                                isExpanded={isExpanded}
                                onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : lead.id) }}
                              />
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
                    <div
                      key={lead.id}
                      onClick={() => setSelectedId(lead.id === selectedId ? null : lead.id)}
                      className={cn('px-4 py-3 cursor-pointer', isActive ? 'bg-primary/5' : '')}
                      style={{ borderLeft: `3px solid ${isActive ? 'hsl(var(--primary))' : 'transparent'}` }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {lead.status === 'new' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" aria-label="New lead" />
                        )}
                        <ChannelBadge source={lead.source} />
                        <span className={cn(
                          'flex-1 text-[13px] truncate',
                          lead.status === 'new' ? 'font-semibold text-foreground' : 'text-foreground',
                        )}>
                          {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}
                        </span>
                        <span className="text-[11px] text-muted-foreground/50 flex-shrink-0">
                          {timeAgo(lead.created_at)}
                        </span>
                      </div>
                      {(lead.company || lead.topic || lead.department) && (
                        <p className="text-[12px] text-muted-foreground truncate mb-1">
                          {[lead.company, lead.topic ?? lead.department].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {msg && <p className="text-[12px] text-muted-foreground/60 truncate mb-1.5">{msg}</p>}
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

        {/* ── Detail panel ───────────────────────────────────────────────────── */}
        {selectedLead && (
          <div className="w-full sm:w-80 sm:flex-shrink-0 bg-card rounded-lg overflow-y-auto border border-[--border-subtle]">
            <button
              onClick={() => setSelectedId(null)}
              aria-label="Back to leads list"
              className="sm:hidden flex items-center gap-1.5 px-4 pt-3 pb-1 text-[12px] text-muted-foreground bg-transparent border-0 cursor-pointer"
            >
              ← Back to list
            </button>
            <LeadDetailPanel
              lead={selectedLead}
              onStatus={handleStatus}
              onClose={() => setSelectedId(null)}
              onNotesSave={patchNotes}
            />
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
    <th
      scope="col"
      className={cn(
        'h-9 px-3 align-middle text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground whitespace-nowrap',
        'bg-muted/30 border-b border-[--border-subtle]',
        right ? 'text-right' : 'text-left',
      )}
      style={{ width: w }}
    >
      {children}
    </th>
  )
}

// ── Inbound KPI card ──────────────────────────────────────────────────────────
// Uses the .kpi-* global classes from globals.css — intentional design system usage.
// The `highlight` variant creates a solid colour card for the "New" hero metric.

function InboundStatCard({
  label, value, sub, color, highlight,
}: {
  label: string; value: number; sub?: string; color: string; highlight?: boolean
}) {
  return (
    <div
      className="kpi-card"
      style={highlight ? { background: color, borderColor: color, boxShadow: `0 2px 8px ${color}30` } : undefined}
    >
      <p className="kpi-label" style={highlight ? { color: 'rgba(255,255,255,0.80)' } : undefined}>
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <span className="kpi-value" style={highlight ? { color: '#fff' } : undefined}>
          {value}
        </span>
        {sub && (
          <span
            className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
            style={{
              color:      highlight ? 'rgba(255,255,255,0.75)' : color,
              background: highlight ? 'rgba(255,255,255,0.20)' : `${color}18`,
            }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  )
}
