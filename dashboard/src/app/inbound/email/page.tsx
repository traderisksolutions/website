'use client'

import { useEffect, useState, useCallback, Suspense, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { RefreshCw, Search, X } from 'lucide-react'
import { Tip } from '@/components/Tip'
import { cn } from '@/lib/utils'
import { Chip } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { ChannelBadge }     from '@/components/inbound/channel-badge'
import { StatusDropdown }   from '@/components/inbound/status-dropdown'
import { LeadDetailPanel }  from '@/components/inbound/lead-detail-panel'
import { InlineReplyRow, ReplyExpandButton } from '@/components/inbound/inline-reply-row'
import type { Lead, Filter } from '@/components/inbound/types'
import { WA_SOURCES, EMAIL_SOURCES, ALL_SOURCES } from '@/components/inbound/constants'
import { channelOf, messagePreview, timeAgo } from '@/components/inbound/helpers'

const INK = '#202124'
const MUTED = '#5f6368'

/** The channel as a word, for the identity cell's second line when the lead has no company. */
function channelLabel(source: string): string {
  if (WA_SOURCES.has(source)) return 'WhatsApp'
  if (source === 'website_form') return 'Website form'
  if (source === 'manual') return 'Added manually'
  return 'Email'
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
  // Deep-link from Pipeline (?lead=<inbound_leads.id>) — pre-selects that lead on load.
  const initLead      = searchParams.get('lead')

  const [leads,      setLeads]      = useState<Lead[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [filter,     setFilter]     = useState<Filter>(initFilter)
  const [search,     setSearch]     = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initLead)
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
    { key: 'all',      label: 'All leads',    count: leads.length, newCount: totalNew },
    { key: 'new',      label: 'New',          count: totalNew,     newCount: 0 },
    { key: 'email',    label: 'Email / form', count: emCount,      newCount: emNew },
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
    <div className="flex flex-col h-[calc(100vh/var(--ui-zoom))] overflow-hidden bg-white" style={{ color: INK }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 sm:px-12 pt-10">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Inbound leads</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading ? 'Loading…' : `${leads.length} lead${leads.length !== 1 ? 's' : ''} from website forms, email and WhatsApp · ${totalNew} new`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh leads"
            className="h-12 px-5 rounded-[12px] bg-white text-[15px] inline-flex items-center gap-2 cursor-pointer hover:bg-[#f8f9fa] transition-colors"
            style={{ border: '1px solid #dadce0', color: INK }}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* ── Metric tiles: each one filters the list; the active filter gets an ink border ── */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[92px] rounded-[16px] bg-[#f1f3f4] animate-pulse" aria-hidden />)
            : (
              [
                { key: 'all' as Filter,      label: 'Total leads',  value: leads.length, sub: undefined },
                { key: 'new' as Filter,      label: 'New',          value: totalNew,     sub: undefined },
                { key: 'email' as Filter,    label: 'Email / form', value: emCount,      sub: emNew > 0 ? `${emNew} new` : undefined },
                { key: 'whatsapp' as Filter, label: 'WhatsApp',     value: waCount,      sub: waNew > 0 ? `${waNew} new` : undefined },
              ].map(t => {
                const on = filter === t.key
                return (
                  <button key={t.key} type="button" onClick={() => setFilter(t.key)} aria-pressed={on}
                    className="text-left rounded-[16px] px-5 py-4 cursor-pointer transition-colors hover:bg-[#e8eaed]"
                    style={{ background: '#f1f3f4', border: `1px solid ${on ? INK : '#f1f3f4'}` }}>
                    <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{t.label}</p>
                    <p className="m-0 mt-2 text-[28px] font-medium tracking-[-0.02em] leading-none tabular-nums" style={{ color: INK }}>{t.value}</p>
                    <p className="m-0 mt-1.5 text-[12.5px] min-h-[16px]" style={{ color: MUTED }}>{t.sub ?? ''}</p>
                  </button>
                )
              })
            )}
        </div>

        {/* ── Filter + search row ─────────────────────────────────────────── */}
        <div className="mt-5 pb-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid #e8eaed' }}>
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filter leads">
            {FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn('filter-pill', filter === f.key && 'active')}
              >
                {f.label}
                <span className="text-[12px] tabular-nums opacity-70">{f.count}</span>
              </button>
            ))}
          </div>

          <label className="relative flex-shrink-0 w-full sm:w-[300px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#80868b' }} aria-hidden />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, phone, topic"
              aria-label="Search leads"
              className="h-10 w-full rounded-[10px] bg-white pl-10 pr-9 text-[14px] outline-none focus:border-[#202124] transition-colors placeholder:text-[#80868b]"
              style={{ border: '1px solid #dadce0', color: INK }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]"
                style={{ color: MUTED }}
              >
                <X size={12} />
              </button>
            )}
          </label>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden px-6 sm:px-12 pb-8 pt-4 gap-6 bg-white">

        {/* Table / card list */}
        <div
          className={cn(
            'flex-1 overflow-y-auto min-w-0',
            selectedId ? 'hidden sm:flex sm:flex-col overflow-x-auto' : 'overflow-x-auto',
          )}
        >
          {loading ? (
            <div aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 flex items-center gap-8" style={{ borderBottom: '1px solid #e8eaed' }}>
                  <span className="h-3.5 w-20 rounded bg-[#f1f3f4] animate-pulse" />
                  <span className="h-3.5 w-40 rounded bg-[#f1f3f4] animate-pulse" />
                  <span className="h-3.5 w-24 rounded bg-[#f1f3f4] animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>
              {error} <button type="button" onClick={() => load(true)} className="underline bg-transparent border-0 cursor-pointer p-0 text-[16px]" style={{ color: INK }}>Retry</button>
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>
              {search ? `No leads match “${search}”.` : 'No leads yet.'}
            </p>
          ) : (
            <>
              {/* ── Desktop register (≥640px) ── */}
              <div className="hidden sm:block">
                <Register label="Inbound leads" minWidth={880}>
                  <RegisterHead>
                    <RegisterTh first>
                      Name
                      <Tip text="Second line is the company, or the channel when there is none. Website = contact form. Email = direct email. WhatsApp = click-to-chat. Manual = added by the team." />
                    </RegisterTh>
                    <RegisterTh hint="Topic or department the lead asked about">Topic</RegisterTh>
                    <RegisterTh hint="First line of the message">Message</RegisterTh>
                    <RegisterTh>
                      Status
                      <Tip text="New = not yet replied. Converted = policy placed. Update as the conversation moves." />
                    </RegisterTh>
                    <RegisterTh align="right" hint="When the lead arrived">Received</RegisterTh>
                    <RegisterTh last align="right" width={56}><span className="sr-only">Reply</span></RegisterTh>
                  </RegisterHead>
                  <tbody>
                    {filtered.map(lead => {
                      const isActive   = lead.id === selectedId
                      const isExpanded = lead.id === expandedId
                      const isEmail    = channelOf(lead) === 'email' && !!lead.email
                      const msg        = messagePreview(lead)
                      const name       = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || '—'
                      return (
                        <Fragment key={lead.id}>
                          <RegisterRow
                            selected={isActive}
                            onClick={() => setSelectedId(lead.id === selectedId ? null : lead.id)}
                            className={cn(!isActive && isExpanded && 'bg-[#f8f9fa]')}
                          >
                            <RegisterCell first selected={isActive} title={lead.email ?? name} className={cn(!isActive && isExpanded && 'bg-[#f8f9fa]')}
                              primary={<span className="inline-flex items-center gap-2 max-w-full"><span className="truncate min-w-0">{name}</span>{lead.ai_draft_id && <Chip title="AI draft ready">AI draft</Chip>}</span>}
                              secondary={lead.company || channelLabel(lead.source)} />
                            <RegisterCell className="max-w-[200px]"><span className="block truncate text-[14px]" style={{ color: '#3c4043' }}>{lead.topic || lead.department || '—'}</span></RegisterCell>
                            <RegisterCell className="max-w-[320px]"><span className="block truncate text-[13.5px]" style={{ color: MUTED }}>{msg || '—'}</span></RegisterCell>
                            <RegisterCell><span onClick={e => e.stopPropagation()}><StatusDropdown lead={lead} onChange={handleStatus} /></span></RegisterCell>
                            <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: INK }}>{timeAgo(lead.created_at)}</span></RegisterCell>
                            <RegisterCell last align="right">
                              {isEmail && (
                                <span onClick={e => e.stopPropagation()}>
                                  <ReplyExpandButton
                                    isExpanded={isExpanded}
                                    onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : lead.id) }}
                                  />
                                </span>
                              )}
                            </RegisterCell>
                          </RegisterRow>

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
                </Register>
              </div>

              {/* ── Mobile card list (<640px) ── */}
              <div className="sm:hidden">
                {filtered.map(lead => {
                  const isActive = lead.id === selectedId
                  const msg      = messagePreview(lead)
                  return (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedId(lead.id === selectedId ? null : lead.id)}
                      className={cn('px-1 py-3 cursor-pointer', isActive ? 'bg-[#f1f3f4]' : '')}
                      style={{ borderBottom: '1px solid #e8eaed' }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <ChannelBadge source={lead.source} />
                        <span className={cn('flex-1 text-[14px] truncate', lead.status === 'new' ? 'font-medium' : '')} style={{ color: INK }}>
                          {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}
                        </span>
                        <span className="text-[12.5px] flex-shrink-0 tabular-nums" style={{ color: MUTED }}>
                          {timeAgo(lead.created_at)}
                        </span>
                      </div>
                      {(lead.company || lead.topic || lead.department) && (
                        <p className="text-[13px] truncate m-0 mb-1" style={{ color: '#3c4043' }}>
                          {[lead.company, lead.topic ?? lead.department].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {msg && <p className="text-[13px] truncate m-0 mb-2" style={{ color: MUTED }}>{msg}</p>}
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
            <p className="py-3 text-[12.5px] m-0" style={{ color: MUTED }}>
              {filtered.length} lead{filtered.length !== 1 ? 's' : ''} · {totalNew} new
            </p>
          )}
        </div>

        {/* ── Detail panel ───────────────────────────────────────────────────── */}
        {selectedLead && (
          <div className="w-full sm:w-80 sm:flex-shrink-0 bg-white rounded-[16px] overflow-y-auto" style={{ border: '1px solid #e8eaed' }}>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Back to leads list"
              className="sm:hidden flex items-center gap-1.5 px-4 pt-3 pb-1 text-[14px] bg-transparent border-0 cursor-pointer"
              style={{ color: MUTED }}
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

