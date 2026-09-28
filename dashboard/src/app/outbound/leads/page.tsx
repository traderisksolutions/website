'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import React from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { cn } from '@/lib/utils'
import { StatCard } from '@/components/stat-card'
import { Chip, Segmented, inputCls, textareaCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

type Status     = 'new' | 'contacted' | 'replied' | 'qualified' | 'disqualified'
type RecordType = 'person' | 'company'
type Source     = 'url_lookup' | 'people_search' | 'company_search'

interface OutboundLead {
  id:                 string
  created_at:         string
  record_type:        RecordType
  source:             Source
  linkedin_url:       string | null
  username:           string | null
  full_name:          string | null
  headline:           string | null
  profile_picture:    string | null
  location:           string | null
  current_title:      string | null
  current_company:    string | null
  current_industry:   string | null
  company_tagline:    string | null
  employee_count:     number | null
  headquarters:       string | null
  logo_url:           string | null
  email:              string | null
  email_status:       string | null
  status:             Status
  notes:              string | null
}

const SOURCE_LABEL: Record<Source, string> = {
  url_lookup:     'URL lookup',
  people_search:  'People search',
  company_search: 'Company search',
}

const STATUS_OPTIONS: { value: Status | 'all'; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' },
  { value: 'replied', label: 'Replied' }, { value: 'qualified', label: 'Qualified' }, { value: 'disqualified', label: 'Disqualified' },
]
const TYPE_OPTIONS: { value: RecordType | 'all'; label: string }[] = [
  { value: 'all', label: 'All types' }, { value: 'person', label: 'People' }, { value: 'company', label: 'Companies' },
]

// Status is edited in place. The control is a neutral chip; the label carries the meaning.
const statusSelectCls = 'h-7 rounded-[6px] px-2 pr-6 text-[11.5px] font-medium border-0 cursor-pointer appearance-none outline-none focus-visible:ring-2 focus-visible:ring-[#202124]'
const statusSelectStyle: React.CSSProperties = {
  background: `#f1f3f4 url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%235f6368' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>") no-repeat right 6px center`,
  color: '#3c4043',
}

function StatusSelect({ value, onChange, className }: { value: Status; onChange: (s: Status) => void; className?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as Status)} onClick={e => e.stopPropagation()}
      className={cn(statusSelectCls, className)} style={statusSelectStyle} aria-label="Lead status">
      <option value="new">New</option>
      <option value="contacted">Contacted</option>
      <option value="replied">Replied</option>
      <option value="qualified">Qualified</option>
      <option value="disqualified">Disqualified</option>
    </select>
  )
}

function initials(name: string | null): string {
  if (!name?.trim()) return '·'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Photo when Apollo has one; otherwise initials on the grey field. */
function LeadAvatar({ lead, size = 32 }: { lead: OutboundLead; size?: number }) {
  const src = lead.profile_picture ?? lead.logo_url
  const radius = lead.record_type === 'person' ? '50%' : 8
  if (src) return <img src={src} alt="" className="object-cover flex-shrink-0" style={{ width: size, height: size, borderRadius: radius, background: '#f1f3f4' }} />
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 font-medium"
      style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.36, background: '#f1f3f4', color: INK }}
    >
      {initials(lead.full_name ?? lead.current_company)}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="m-0 mb-1.5 text-[12.5px]" style={{ color: MUTED }}>{children}</p>
}

function OutboundLeadsPageInner() {
  // Deep-link from Pipeline (?lead=<outbound_leads.id>) — pre-expands that lead's row on load.
  const searchParams = useSearchParams()
  const initLead      = searchParams.get('lead')

  const [leads,         setLeads]         = useState<OutboundLead[]>([])
  const [loading,       setLoading]       = useState(true)
  const [q,             setQ]             = useState('')
  const [statusFilter,  setStatusFilter]  = useState<Status | 'all'>('all')
  const [typeFilter,    setTypeFilter]    = useState<RecordType | 'all'>('all')
  const [expandedId,        setExpandedId]        = useState<string | null>(initLead)
  const [notes,             setNotes]             = useState<Record<string, string>>({})
  const [saving,            setSaving]            = useState<string | null>(null)
  const [fetchingEmailLead, setFetchingEmailLead] = useState<Set<string>>(new Set())
  const [campaigns,         setCampaigns]         = useState<{ id: string; name: string }[]>([])
  const [campaignsLoaded,   setCampaignsLoaded]   = useState(false)
  const [campaignPick,      setCampaignPick]      = useState<Record<string, string>>({})
  const [addingToCampaign,  setAddingToCampaign]  = useState<string | null>(null)
  const [addSuccess,        setAddSuccess]        = useState<Record<string, string>>({})
  const [selectedLeads,     setSelectedLeads]     = useState<string[]>([])
  const [bulkCampaign,      setBulkCampaign]      = useState('')
  const [bulkAdding,        setBulkAdding]        = useState(false)
  const [bulkSuccess,       setBulkSuccess]       = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/outbound/leads')
      if (res.ok) {
        const raw = await res.json()
        const data: OutboundLead[] = Array.isArray(raw) ? raw : []
        setLeads(data)
        const n: Record<string, string> = {}
        data.forEach(l => { n[l.id] = l.notes ?? '' })
        setNotes(n)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function updateStatus(id: string, status: Status) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    await fetch('/api/outbound/leads', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
  }

  async function fetchEmailForLead(leadId: string) {
    setFetchingEmailLead(prev => { const n = new Set(prev); n.add(leadId); return n })
    try {
      const res  = await fetch('/api/outbound/apollo-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      })
      const data = await res.json()
      if (res.ok && data.results?.[0]?.email) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, email: data.results[0].email } : l))
      }
    } finally {
      setFetchingEmailLead(prev => { const n = new Set(prev); n.delete(leadId); return n })
    }
  }

  async function saveNotes(id: string) {
    setSaving(id)
    await fetch('/api/outbound/leads', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, notes: notes[id] }),
    })
    setSaving(null)
  }

  async function ensureCampaigns() {
    if (campaignsLoaded) return
    const res = await fetch('/api/outbound/campaigns')
    const data = await res.json()
    setCampaigns(Array.isArray(data) ? data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) : [])
    setCampaignsLoaded(true)
  }

  async function addToCampaign(lead: OutboundLead) {
    const campaignId = campaignPick[lead.id]
    if (!campaignId) return
    setAddingToCampaign(lead.id)
    try {
      const sourceType = lead.source === 'people_search' ? 'agent_discovery' : 'manual'
      const res = await fetch(`/api/outbound/campaigns/${campaignId}/leads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: [lead.id], source_type: sourceType }),
      })
      if (res.ok) {
        const campName = campaigns.find(c => c.id === campaignId)?.name ?? 'campaign'
        setAddSuccess(prev => ({ ...prev, [lead.id]: `Added to "${campName}"` }))
        setTimeout(() => setAddSuccess(prev => { const n = { ...prev }; delete n[lead.id]; return n }), 3000)
      }
    } finally { setAddingToCampaign(null) }
  }

  async function addBulkToCampaign() {
    if (!bulkCampaign || selectedLeads.length === 0) return
    setBulkAdding(true)
    try {
      const res = await fetch(`/api/outbound/campaigns/${bulkCampaign}/leads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: selectedLeads, source_type: 'manual' }),
      })
      if (res.ok) {
        const campName = campaigns.find(c => c.id === bulkCampaign)?.name ?? 'campaign'
        setBulkSuccess(`${selectedLeads.length} lead${selectedLeads.length > 1 ? 's' : ''} added to "${campName}"`)
        setSelectedLeads([])
        setTimeout(() => setBulkSuccess(null), 4000)
      }
    } finally { setBulkAdding(false) }
  }

  function toggleSelect(id: string) {
    setSelectedLeads(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll(pool: OutboundLead[]) {
    setSelectedLeads(selectedLeads.length === pool.length ? [] : pool.map(l => l.id))
  }

  const filtered = leads.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false
    if (typeFilter   !== 'all' && l.record_type !== typeFilter) return false
    if (!q) return true
    const s = q.toLowerCase()
    return (
      l.full_name?.toLowerCase().includes(s)      ||
      l.headline?.toLowerCase().includes(s)        ||
      l.current_company?.toLowerCase().includes(s) ||
      l.current_title?.toLowerCase().includes(s)   ||
      l.location?.toLowerCase().includes(s)        ||
      l.headquarters?.toLowerCase().includes(s)
    )
  })

  const anyFilter = !!q || statusFilter !== 'all' || typeFilter !== 'all'

  const campaignSelect = (value: string, onChange: (v: string) => void, extra?: string) => (
    <select value={value} onChange={e => onChange(e.target.value)} onClick={e => { e.stopPropagation(); ensureCampaigns() }}
      className={cn(inputCls, 'h-9 max-w-[280px]', extra)} aria-label="Campaign">
      <option value="">Select campaign</option>
      {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )

  const expandedPanel = (lead: OutboundLead) => (
    <div className="flex gap-8 flex-wrap rounded-[12px] px-5 py-4" style={{ background: '#f8f9fa' }}>
      {(lead.headline || lead.company_tagline || lead.current_industry || lead.employee_count) && (
        <div className="flex-[2] min-w-[200px]">
          <Label>Details</Label>
          {(lead.headline || lead.company_tagline) && (
            <p className="m-0 mb-1.5 text-[14px] leading-relaxed" style={{ color: '#3c4043' }}>{lead.headline ?? lead.company_tagline}</p>
          )}
          {lead.current_industry && <p className="m-0 text-[13px]" style={{ color: MUTED }}>Industry: {lead.current_industry}</p>}
          {lead.employee_count && <p className="m-0 mt-1 text-[13px]" style={{ color: MUTED }}>Employees: {lead.employee_count.toLocaleString()}</p>}
        </div>
      )}
      <div className="flex-1 min-w-[220px]">
        <Label>Notes</Label>
        <textarea value={notes[lead.id] ?? ''} onChange={e => setNotes(prev => ({ ...prev, [lead.id]: e.target.value }))}
          placeholder="Add notes" rows={3} className={textareaCls} onClick={e => e.stopPropagation()} />
        <Button variant="outline" size="sm" className="mt-2" onClick={e => { e.stopPropagation(); saveNotes(lead.id) }} disabled={saving === lead.id}>
          {saving === lead.id ? 'Saving…' : 'Save notes'}
        </Button>
      </div>
      <div className="min-w-[220px]">
        <Label>Add to campaign</Label>
        {addSuccess[lead.id] ? (
          <p className="m-0 text-[13px]" style={{ color: '#3c4043' }}>{addSuccess[lead.id]}</p>
        ) : (
          <div className="flex gap-2 items-center flex-wrap">
            {campaignSelect(campaignPick[lead.id] ?? '', v => setCampaignPick(prev => ({ ...prev, [lead.id]: v })), 'flex-1')}
            <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); addToCampaign(lead) }} disabled={!campaignPick[lead.id] || addingToCampaign === lead.id}>
              {addingToCampaign === lead.id ? 'Adding…' : 'Add'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  const emailCell = (lead: OutboundLead) => lead.email ? (
    <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()} className="text-[13.5px] no-underline hover:underline" style={{ color: INK }}>{lead.email}</a>
  ) : lead.record_type === 'person' ? (
    fetchingEmailLead.has(lead.id)
      ? <Loader2 size={13} className="animate-spin" style={{ color: '#9aa0a6' }} />
      : <Button variant="outline" size="xs" onClick={e => { e.stopPropagation(); fetchEmailForLead(lead.id) }}>Get email</Button>
  ) : <span style={{ color: '#9aa0a6' }}>—</span>

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1400px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Lead database</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading ? 'Loading…' : anyFilter ? `${filtered.length} of ${leads.length} lead${leads.length === 1 ? '' : 's'}` : `${leads.length} lead${leads.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <label className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#80868b' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, company, title, location" aria-label="Search leads"
              className="h-12 w-[260px] sm:w-[340px] rounded-[12px] border bg-white pl-11 pr-9 text-[15px] outline-none focus:border-[#202124] transition-colors" style={{ borderColor: '#dadce0' }} />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={13} /></button>
            )}
          </label>
        </div>

        {/* Tiles */}
        {!loading && leads.length > 0 && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total leads" value={leads.length} />
            <StatCard label="New"         value={leads.filter(l => l.status === 'new').length} />
            <StatCard label="Contacted"   value={leads.filter(l => l.status === 'contacted' || l.status === 'replied').length} />
            <StatCard label="Qualified"   value={leads.filter(l => l.status === 'qualified').length} />
          </div>
        )}

        {/* Filters */}
        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <Segmented value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
          <Segmented value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
        </div>

        {/* Bulk action row */}
        {selectedLeads.length > 0 && (
          <div className="mt-4 flex items-center gap-3 px-4 py-2.5 rounded-[12px] flex-wrap" style={{ background: '#f1f3f4' }}>
            <span className="text-[14px] font-medium tabular-nums" style={{ color: INK }}>{selectedLeads.length} selected</span>
            <div className="flex-1" />
            {bulkSuccess ? (
              <span className="text-[14px]" style={{ color: '#3c4043' }}>{bulkSuccess}</span>
            ) : (
              <>
                {campaignSelect(bulkCampaign, setBulkCampaign, 'bg-white')}
                <Button size="sm" onClick={addBulkToCampaign} disabled={!bulkCampaign || bulkAdding}>
                  {bulkAdding ? 'Adding…' : 'Add to campaign'}
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSelectedLeads([])}>Clear</Button>
          </div>
        )}

        {/* Content */}
        <div className="mt-6">
          {loading ? (
            <div className="rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }} aria-busy="true">
              <div className="h-10" style={{ borderBottom: `1px solid ${RULE}` }} />
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[60px] px-5 flex items-center gap-4" style={{ borderBottom: `1px solid ${RULE}` }}>
                  <span className="w-8 h-8 rounded-full bg-[#f1f3f4] animate-pulse flex-shrink-0" />
                  <span className="h-3.5 w-40 rounded bg-[#f1f3f4] animate-pulse" />
                  <span className="h-3.5 w-56 rounded bg-[#f1f3f4] animate-pulse" />
                  <span className="h-3.5 w-16 rounded bg-[#f1f3f4] animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>
              {anyFilter ? <>No leads match. <button type="button" onClick={() => { setQ(''); setStatusFilter('all'); setTypeFilter('all') }} className="underline bg-transparent border-0 p-0 cursor-pointer" style={{ color: INK }}>Clear filters</button></> : 'No leads yet. Run Lead discovery to add prospects.'}
            </p>
          ) : (
            <>
              {/* Desktop register (≥640px) */}
              <div className="hidden sm:block">
                <Register label="Lead database" minWidth={1040} maxHeight="calc(100vh - 260px)">
                  <RegisterHead>
                    <RegisterTh first>
                      <span className="inline-flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && selectedLeads.length === filtered.length}
                          onChange={() => { ensureCampaigns(); toggleSelectAll(filtered) }}
                          className="cursor-pointer"
                          aria-label="Select all"
                        />
                        Name
                      </span>
                    </RegisterTh>
                    <RegisterTh>Location</RegisterTh>
                    <RegisterTh>Email</RegisterTh>
                    <RegisterTh>Source</RegisterTh>
                    <RegisterTh align="right">Added</RegisterTh>
                    <RegisterTh last>Status</RegisterTh>
                  </RegisterHead>
                  <tbody>
                    {filtered.map(lead => {
                      const expanded = expandedId === lead.id
                      const date     = new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
                      const role     = lead.current_title ?? lead.headline ?? lead.company_tagline
                      return (
                        <React.Fragment key={lead.id}>
                          <RegisterRow selected={expanded} onClick={() => { setExpandedId(expanded ? null : lead.id); ensureCampaigns() }}>
                            <RegisterCell first selected={expanded} className="min-w-[300px] max-w-[380px]">
                              <span className="flex items-center gap-3 min-w-0">
                                <span onClick={e => e.stopPropagation()} className="inline-flex flex-shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={selectedLeads.includes(lead.id)}
                                    onChange={() => { ensureCampaigns(); toggleSelect(lead.id) }}
                                    className="cursor-pointer"
                                    aria-label={`Select ${lead.full_name ?? 'lead'}`}
                                  />
                                </span>
                                <LeadAvatar lead={lead} size={32} />
                                <span className="min-w-0">
                                  <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }}>{lead.full_name ?? '—'}</span>
                                  <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>
                                    {[role, lead.current_company].filter(Boolean).join(' · ') || 'No role on file'}
                                    {lead.linkedin_url && (
                                      <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                        className="ml-1.5 no-underline hover:underline" style={{ color: MUTED }}>LinkedIn ↗</a>
                                    )}
                                  </span>
                                </span>
                              </span>
                            </RegisterCell>
                            <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{lead.location ?? lead.headquarters ?? '—'}</span></RegisterCell>
                            <RegisterCell>{emailCell(lead)}</RegisterCell>
                            <RegisterCell><Chip>{SOURCE_LABEL[lead.source]}</Chip></RegisterCell>
                            <RegisterCell align="right" primary={date} />
                            <RegisterCell last>
                              <span onClick={e => e.stopPropagation()} className="inline-flex">
                                <StatusSelect value={lead.status} onChange={s => updateStatus(lead.id, s)} />
                              </span>
                            </RegisterCell>
                          </RegisterRow>

                          {expanded && (
                            <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                              <td colSpan={6} className="px-4 pb-4 pt-1">{expandedPanel(lead)}</td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </Register>
              </div>

              {/* Mobile list (<640px) */}
              <ul className="sm:hidden m-0 p-0 list-none rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }}>
                {filtered.map(lead => {
                  const expanded = expandedId === lead.id
                  const date     = new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
                  return (
                    <li key={lead.id} className={cn('px-4 py-3', expanded && 'bg-[#f8f9fa]')} style={{ borderBottom: `1px solid ${RULE}` }}>
                      <div className="flex items-center gap-3 mb-1.5">
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={() => { ensureCampaigns(); toggleSelect(lead.id) }}
                          className="cursor-pointer flex-shrink-0"
                          aria-label={`Select ${lead.full_name ?? 'lead'}`}
                        />
                        <div className="flex items-center gap-3 flex-1 min-w-0" onClick={() => { setExpandedId(expanded ? null : lead.id); ensureCampaigns() }}>
                          <LeadAvatar lead={lead} size={36} />
                          <div className="flex-1 min-w-0">
                            <p className="m-0 text-[14px] font-medium truncate" style={{ color: INK }}>{lead.full_name ?? '—'}</p>
                            <p className="m-0 text-[12.5px] truncate" style={{ color: MUTED }}>{lead.current_title ?? lead.headline ?? lead.company_tagline ?? '—'}</p>
                          </div>
                          <span className="text-[12.5px] flex-shrink-0" style={{ color: MUTED }}>{date}</span>
                        </div>
                      </div>

                      {(lead.current_company || lead.location || lead.headquarters) && (
                        <p className="m-0 mb-1.5 text-[13px] truncate" style={{ color: '#3c4043' }}>
                          {[lead.current_company, lead.location ?? lead.headquarters].filter(Boolean).join(' · ')}
                        </p>
                      )}

                      <div className="mb-2 text-[13.5px]">{emailCell(lead)}</div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusSelect value={lead.status} onChange={s => updateStatus(lead.id, s)} />
                        <Chip>{SOURCE_LABEL[lead.source]}</Chip>
                        {lead.linkedin_url && (
                          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] no-underline hover:underline" style={{ color: MUTED }}>LinkedIn ↗</a>
                        )}
                      </div>

                      {expanded && <div className="mt-3">{expandedPanel(lead)}</div>}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function OutboundLeadsPage() {
  return (
    <Suspense>
      <OutboundLeadsPageInner />
    </Suspense>
  )
}
