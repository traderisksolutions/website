'use client'

import { useEffect, useState } from 'react'
import React from 'react'
import { Search, Loader2, Table2 } from 'lucide-react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { statusMeta } from '@/lib/status'

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

// Use statusMeta() from shared lib for badge colors

const SOURCE_LABEL: Record<Source, string> = {
  url_lookup:     'URL Lookup',
  people_search:  'People Search',
  company_search: 'Co. Search',
}

export default function OutboundLeadsPage() {
  const [leads,         setLeads]         = useState<OutboundLead[]>([])
  const [loading,       setLoading]       = useState(true)
  const [q,             setQ]             = useState('')
  const [statusFilter,  setStatusFilter]  = useState<Status | 'all'>('all')
  const [typeFilter,    setTypeFilter]    = useState<RecordType | 'all'>('all')
  const [expandedId,        setExpandedId]        = useState<string | null>(null)
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

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Page header */}
      <div className="page-header bg-background border-b border-border flex-shrink-0">
        <div>
          <h1 className="page-title">Outbound Leads</h1>
          <p className="page-subtitle">{leads.length} total · {leads.filter(l => l.status === 'new').length} new</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="filter-search">
            <Search size={12} className="text-muted-foreground/60 flex-shrink-0" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search leads…" />
          </div>

          {/* Status filter */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as Status | 'all')}
            className="h-8 px-2.5 rounded-md border border-border text-[12px] text-foreground bg-background cursor-pointer">
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="replied">Replied</option>
            <option value="qualified">Qualified</option>
            <option value="disqualified">Disqualified</option>
          </select>

          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as RecordType | 'all')}
            className="h-8 px-2.5 rounded-md border border-border text-[12px] text-foreground bg-background cursor-pointer">
            <option value="all">All Types</option>
            <option value="person">People</option>
            <option value="company">Companies</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 h-14 items-center border-b border-border/50">
                <div className="skeleton sk-cell" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="skeleton sk-line" style={{ width: '35%' }} />
                  <div className="skeleton sk-text" style={{ width: '55%' }} />
                </div>
                <div className="skeleton sk-cell" style={{ width: 60 }} />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon-wrap">
              <Table2 size={20} className="text-muted-foreground" />
            </div>
            <p className="empty-title">{q || statusFilter !== 'all' ? 'No leads match your filters' : 'No leads yet'}</p>
            <p className="empty-desc">
              {q || statusFilter !== 'all'
                ? 'Try adjusting your search or filter.'
                : 'Use Lead Discovery to find prospects with Apollo.'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Bulk action bar ── */}
            {selectedLeads.length > 0 && (
              <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-2.5 bg-foreground text-background text-[13px] flex-wrap">
                <span className="font-semibold">{selectedLeads.length} selected</span>
                <div className="flex-1" />
                {bulkSuccess ? (
                  <span className="text-emerald-400 font-medium">{bulkSuccess}</span>
                ) : (
                  <>
                    <select
                      value={bulkCampaign}
                      onChange={e => setBulkCampaign(e.target.value)}
                      onClick={ensureCampaigns}
                      className="h-[30px] px-2 text-[12px] text-foreground bg-background border border-border rounded-md outline-none"
                    >
                      <option value="">Select campaign…</option>
                      {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      onClick={addBulkToCampaign}
                      disabled={!bulkCampaign || bulkAdding}
                      className="px-3 py-1.5 text-[12px] font-semibold bg-background text-foreground rounded-md cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      {bulkAdding ? <Loader2 size={12} className="animate-spin inline" /> : `Add to Campaign`}
                    </button>
                  </>
                )}
                <button onClick={() => setSelectedLeads([])} className="text-[12px] opacity-60 hover:opacity-100 cursor-pointer bg-transparent border-0 text-background">
                  Clear
                </button>
              </div>
            )}

            {/* ── Desktop table (≥640px) ── */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 px-2 pl-3.5">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selectedLeads.length === filtered.length}
                        onChange={() => { ensureCampaigns(); toggleSelectAll(filtered) }}
                        className="cursor-pointer"
                        title="Select all"
                      />
                    </TableHead>
                    {['', 'Name', 'Role / Headline', 'Company', 'Location', 'Email', 'Source', 'Status', 'Added'].map(col => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(lead => {
                    const expanded = expandedId === lead.id
                    const s        = statusMeta(lead.status)
                    const avatar   = lead.profile_picture ?? lead.logo_url
                    const date     = new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
                    return (
                      <React.Fragment key={lead.id}>
                        <TableRow onClick={() => { setExpandedId(expanded ? null : lead.id); ensureCampaigns() }}
                          className={cn('cursor-pointer', expanded && 'bg-muted/30 hover:bg-muted/30')}
                        >
                          <TableCell className="py-2.5 px-2 pl-3.5 w-8" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedLeads.includes(lead.id)}
                              onChange={() => { ensureCampaigns(); toggleSelect(lead.id) }}
                              className="cursor-pointer"
                            />
                          </TableCell>
                          <TableCell className="py-2.5 px-2 pl-3.5 w-11">
                            {avatar ? (
                              <img src={avatar} alt="" className="w-8 h-8 object-cover bg-muted"
                                style={{ borderRadius: lead.record_type === 'person' ? '50%' : 6 }} />
                            ) : (
                              <div className="w-8 h-8 bg-muted text-[15px] flex items-center justify-center"
                                style={{ borderRadius: lead.record_type === 'person' ? '50%' : 6 }}>
                                {lead.record_type === 'person' ? '👤' : '🏢'}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[160px]">
                            <p className="text-[13px] font-medium text-foreground tracking-tight">{lead.full_name ?? '—'}</p>
                            {lead.linkedin_url && (
                              <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-[11px] text-[#0a66c2] no-underline">LinkedIn ↗</a>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <p className="text-[12px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                              {lead.current_title ?? lead.headline ?? lead.company_tagline ?? '—'}
                            </p>
                          </TableCell>
                          <TableCell className="min-w-[140px]">
                            <p className="text-[12px] text-muted-foreground">{lead.current_company ?? '—'}</p>
                          </TableCell>
                          <TableCell className="min-w-[120px]">
                            <p className="text-[12px] text-muted-foreground/70">{lead.location ?? lead.headquarters ?? '—'}</p>
                          </TableCell>
                          <TableCell className="min-w-[180px]">
                            {lead.email ? (
                              <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()}
                                className="text-[12px] text-emerald-600 no-underline font-medium">{lead.email}</a>
                            ) : lead.record_type === 'person' ? (
                              fetchingEmailLead.has(lead.id)
                                ? <Loader2 size={12} className="animate-spin text-muted-foreground" />
                                : (
                                  <button onClick={e => { e.stopPropagation(); fetchEmailForLead(lead.id) }}
                                    className="text-[11px] px-2 py-0.5 rounded border-0 cursor-pointer bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                                    Get Email
                                  </button>
                                )
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              {SOURCE_LABEL[lead.source]}
                            </span>
                          </TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            <select value={lead.status} onChange={e => updateStatus(lead.id, e.target.value as Status)}
                              className="text-[11px] font-semibold px-2 py-1 rounded border-0 cursor-pointer"
                              style={{ background: s.bg, color: s.color }}>
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="replied">Replied</option>
                              <option value="qualified">Qualified</option>
                              <option value="disqualified">Disqualified</option>
                            </select>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <p className="text-[12px] text-muted-foreground/60">{date}</p>
                          </TableCell>
                        </TableRow>

                        {expanded && (
                          <tr className="bg-muted/20 border-b border-border">
                            <td colSpan={10} className="px-3.5 pb-4 pt-3 pl-14">
                              <div className="flex gap-8 flex-wrap">
                                {(lead.headline || lead.company_tagline || lead.current_industry) && (
                                  <div className="flex-[2] min-w-[200px]">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Details</p>
                                    {(lead.headline || lead.company_tagline) && (
                                      <p className="text-[13px] text-muted-foreground leading-relaxed mb-1.5">{lead.headline ?? lead.company_tagline}</p>
                                    )}
                                    {lead.current_industry && <p className="text-[12px] text-muted-foreground/70">Industry: {lead.current_industry}</p>}
                                    {lead.employee_count && <p className="text-[12px] text-muted-foreground/70 mt-1">Employees: {lead.employee_count.toLocaleString()}</p>}
                                  </div>
                                )}
                                <div className="flex-1 min-w-[200px]">
                                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</p>
                                  <textarea value={notes[lead.id] ?? ''} onChange={e => setNotes(prev => ({ ...prev, [lead.id]: e.target.value }))}
                                    placeholder="Add notes…" rows={3}
                                    className="w-full px-2.5 py-2 text-[12px] text-foreground bg-background border border-border rounded-md resize-y font-sans outline-none focus:ring-1 focus:ring-ring" />
                                  <button onClick={() => saveNotes(lead.id)} disabled={saving === lead.id}
                                    className="mt-1.5 px-3.5 py-1.5 text-[12px] font-medium text-foreground bg-background border border-border rounded-md cursor-pointer disabled:opacity-50">
                                    {saving === lead.id ? 'Saving…' : 'Save Notes'}
                                  </button>
                                </div>
                                <div className="min-w-[200px]">
                                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Add to Campaign</p>
                                  {addSuccess[lead.id] ? (
                                    <p className="text-[12px] text-emerald-600 font-medium">{addSuccess[lead.id]}</p>
                                  ) : (
                                    <div className="flex gap-2 items-center">
                                      <select
                                        value={campaignPick[lead.id] ?? ''}
                                        onChange={e => setCampaignPick(prev => ({ ...prev, [lead.id]: e.target.value }))}
                                        onClick={e => e.stopPropagation()}
                                        className="flex-1 h-[30px] px-2 text-[12px] text-foreground bg-background border border-border rounded-md outline-none"
                                      >
                                        <option value="">Select campaign…</option>
                                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                      </select>
                                      <button
                                        onClick={e => { e.stopPropagation(); addToCampaign(lead) }}
                                        disabled={!campaignPick[lead.id] || addingToCampaign === lead.id}
                                        className="px-3 py-1.5 text-[12px] font-medium text-white bg-foreground rounded-md cursor-pointer disabled:opacity-40 whitespace-nowrap"
                                      >
                                        {addingToCampaign === lead.id ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* ── Mobile card list (<640px) ── */}
            <div className="sm:hidden divide-y divide-border">
              {filtered.map(lead => {
                const expanded = expandedId === lead.id
                const s        = statusMeta(lead.status)
                const avatar   = lead.profile_picture ?? lead.logo_url
                const date     = new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
                return (
                  <div key={lead.id} className={cn('px-4 py-3', expanded && 'bg-muted/20')}>
                    {/* Top row: checkbox + avatar + name + date */}
                    <div className="flex items-center gap-3 mb-1.5">
                      <input
                        type="checkbox"
                        checked={selectedLeads.includes(lead.id)}
                        onChange={() => { ensureCampaigns(); toggleSelect(lead.id) }}
                        className="cursor-pointer flex-shrink-0"
                        onClick={e => e.stopPropagation()}
                      />
                    <div className="flex items-center gap-3 flex-1" onClick={() => { setExpandedId(expanded ? null : lead.id); ensureCampaigns() }}>
                      {avatar ? (
                        <img src={avatar} alt="" className="w-9 h-9 flex-shrink-0 object-cover bg-muted"
                          style={{ borderRadius: lead.record_type === 'person' ? '50%' : 6 }} />
                      ) : (
                        <div className="w-9 h-9 flex-shrink-0 bg-muted text-[16px] flex items-center justify-center"
                          style={{ borderRadius: lead.record_type === 'person' ? '50%' : 6 }}>
                          {lead.record_type === 'person' ? '👤' : '🏢'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">{lead.full_name ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {lead.current_title ?? lead.headline ?? lead.company_tagline ?? '—'}
                        </p>
                      </div>
                      <span className="text-[11px] text-muted-foreground/50 flex-shrink-0">{date}</span>
                    </div>
                    </div>

                    {/* Company + location */}
                    {(lead.current_company || lead.location || lead.headquarters) && (
                      <p className="text-[12px] text-muted-foreground mb-1.5 truncate">
                        {[lead.current_company, lead.location ?? lead.headquarters].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    {/* Email */}
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="text-[12px] text-emerald-600 no-underline font-medium block mb-2 truncate">
                        {lead.email}
                      </a>
                    ) : lead.record_type === 'person' ? (
                      <div className="mb-2">
                        {fetchingEmailLead.has(lead.id)
                          ? <Loader2 size={12} className="animate-spin text-muted-foreground" />
                          : (
                            <button onClick={() => fetchEmailForLead(lead.id)}
                              className="text-[11px] px-2 py-0.5 rounded border-0 cursor-pointer bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                              Get Email
                            </button>
                          )
                        }
                      </div>
                    ) : null}

                    {/* Status row */}
                    <div className="flex items-center gap-2">
                      <select value={lead.status} onChange={e => updateStatus(lead.id, e.target.value as Status)}
                        className="text-[11px] font-semibold px-2 py-1 rounded border-0 cursor-pointer flex-1"
                        style={{ background: s.bg, color: s.color }}>
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="replied">Replied</option>
                        <option value="qualified">Qualified</option>
                        <option value="disqualified">Disqualified</option>
                      </select>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {SOURCE_LABEL[lead.source]}
                      </span>
                      {lead.linkedin_url && (
                        <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-[#0a66c2] no-underline">LinkedIn ↗</a>
                      )}
                    </div>

                    {/* Expanded notes + campaign */}
                    {expanded && (
                      <div className="mt-3 pt-3 border-t border-border">
                        {(lead.headline || lead.current_industry || lead.employee_count) && (
                          <div className="mb-3">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Details</p>
                            {lead.headline && <p className="text-[12px] text-muted-foreground leading-relaxed">{lead.headline}</p>}
                            {lead.current_industry && <p className="text-[12px] text-muted-foreground/70 mt-1">Industry: {lead.current_industry}</p>}
                            {lead.employee_count && <p className="text-[12px] text-muted-foreground/70">Employees: {lead.employee_count.toLocaleString()}</p>}
                          </div>
                        )}
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                        <textarea value={notes[lead.id] ?? ''} onChange={e => setNotes(prev => ({ ...prev, [lead.id]: e.target.value }))}
                          placeholder="Add notes…" rows={3}
                          className="w-full px-2.5 py-2 text-[12px] text-foreground bg-background border border-border rounded-md resize-y font-sans outline-none focus:ring-1 focus:ring-ring" />
                        <button onClick={() => saveNotes(lead.id)} disabled={saving === lead.id}
                          className="mt-1.5 px-3.5 py-1.5 text-[12px] font-medium text-foreground bg-background border border-border rounded-md cursor-pointer disabled:opacity-50">
                          {saving === lead.id ? 'Saving…' : 'Save Notes'}
                        </button>
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Add to Campaign</p>
                          {addSuccess[lead.id] ? (
                            <p className="text-[12px] text-emerald-600 font-medium">{addSuccess[lead.id]}</p>
                          ) : (
                            <div className="flex gap-2">
                              <select
                                value={campaignPick[lead.id] ?? ''}
                                onChange={e => setCampaignPick(prev => ({ ...prev, [lead.id]: e.target.value }))}
                                className="flex-1 h-[32px] px-2 text-[12px] text-foreground bg-background border border-border rounded-md outline-none"
                              >
                                <option value="">Select campaign…</option>
                                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              <button
                                onClick={() => addToCampaign(lead)}
                                disabled={!campaignPick[lead.id] || addingToCampaign === lead.id}
                                className="px-3 py-1.5 text-[12px] font-medium text-white bg-foreground rounded-md cursor-pointer disabled:opacity-40 whitespace-nowrap"
                              >
                                {addingToCampaign === lead.id ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
