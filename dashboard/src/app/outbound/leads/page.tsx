'use client'

import { useEffect, useState } from 'react'
import React from 'react'
import { Search } from 'lucide-react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'

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

const STATUS_STYLE: Record<Status, { bg: string; color: string }> = {
  new:          { bg: '#f4f4f5', color: '#555'    },
  contacted:    { bg: '#eff6ff', color: '#1d4ed8' },
  replied:      { bg: '#fef3c7', color: '#92400e' },
  qualified:    { bg: '#f0fdf4', color: '#166534' },
  disqualified: { bg: '#fef2f2', color: '#991b1b' },
}

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
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [notes,         setNotes]         = useState<Record<string, string>>({})
  const [saving,        setSaving]        = useState<string | null>(null)

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

  async function saveNotes(id: string) {
    setSaving(id)
    await fetch('/api/outbound/leads', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, notes: notes[id] }),
    })
    setSaving(null)
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

      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-background flex-shrink-0 flex-wrap">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Outbound Leads</h1>
          <p className="text-[12px] text-muted-foreground">{leads.length} total · {leads.filter(l => l.status === 'new').length} new</p>
        </div>
        <div className="flex-1" />

        {/* Search */}
        <div className="flex items-center gap-2 bg-muted rounded-md px-3 h-[34px] w-52">
          <Search size={13} className="text-muted-foreground flex-shrink-0" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search leads…"
            className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground" />
        </div>

        {/* Status filter */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as Status | 'all')}
          className="h-[34px] px-2.5 rounded-md border border-border text-[12px] text-foreground bg-background cursor-pointer">
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="replied">Replied</option>
          <option value="qualified">Qualified</option>
          <option value="disqualified">Disqualified</option>
        </select>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as RecordType | 'all')}
          className="h-[34px] px-2.5 rounded-md border border-border text-[12px] text-foreground bg-background cursor-pointer">
          <option value="all">All Types</option>
          <option value="person">People</option>
          <option value="company">Companies</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">
            No leads yet.{' '}
            <a href="/outbound/search" className="text-foreground font-medium no-underline">Search for prospects →</a>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {['', 'Name', 'Role / Headline', 'Company', 'Location', 'Email', 'Source', 'Status', 'Added'].map(col => (
                  <TableHead key={col}>{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(lead => {
                const expanded = expandedId === lead.id
                const s        = STATUS_STYLE[lead.status]
                const avatar   = lead.profile_picture ?? lead.logo_url
                const date     = new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
                return (
                  <React.Fragment key={lead.id}>
                    <TableRow onClick={() => setExpandedId(expanded ? null : lead.id)}
                      className={cn('cursor-pointer', expanded && 'bg-muted/30 hover:bg-muted/30')}
                    >
                      {/* Avatar */}
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
                      {/* Name */}
                      <TableCell className="min-w-[160px]">
                        <p className="text-[13px] font-medium text-foreground tracking-tight">{lead.full_name ?? '—'}</p>
                        {lead.linkedin_url && (
                          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-[11px] text-[#0a66c2] no-underline">
                            LinkedIn ↗
                          </a>
                        )}
                      </TableCell>
                      {/* Role */}
                      <TableCell className="max-w-[200px]">
                        <p className="text-[12px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                          {lead.current_title ?? lead.headline ?? lead.company_tagline ?? '—'}
                        </p>
                      </TableCell>
                      {/* Company */}
                      <TableCell className="min-w-[140px]">
                        <p className="text-[12px] text-muted-foreground">{lead.current_company ?? '—'}</p>
                      </TableCell>
                      {/* Location */}
                      <TableCell className="min-w-[120px]">
                        <p className="text-[12px] text-muted-foreground/70">{lead.location ?? lead.headquarters ?? '—'}</p>
                      </TableCell>
                      {/* Email */}
                      <TableCell className="min-w-[180px]">
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()}
                            className="text-[12px] text-emerald-600 no-underline font-medium">{lead.email}</a>
                        ) : lead.record_type === 'person' ? (
                          <span className="text-[12px] text-muted-foreground/30">—</span>
                        ) : null}
                      </TableCell>
                      {/* Source */}
                      <TableCell>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {SOURCE_LABEL[lead.source]}
                        </span>
                      </TableCell>
                      {/* Status */}
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
                      {/* Date */}
                      <TableCell className="whitespace-nowrap">
                        <p className="text-[12px] text-muted-foreground/60">{date}</p>
                      </TableCell>
                    </TableRow>

                    {/* Expanded row */}
                    {expanded && (
                      <tr className="bg-muted/20 border-b border-border">
                        <td colSpan={9} className="px-3.5 pb-4 pt-3 pl-14">
                          <div className="flex gap-8">
                            {(lead.headline || lead.company_tagline || lead.current_industry) && (
                              <div className="flex-[2]">
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Details</p>
                                {(lead.headline || lead.company_tagline) && (
                                  <p className="text-[13px] text-muted-foreground leading-relaxed mb-1.5">{lead.headline ?? lead.company_tagline}</p>
                                )}
                                {lead.current_industry && (
                                  <p className="text-[12px] text-muted-foreground/70">Industry: {lead.current_industry}</p>
                                )}
                                {lead.employee_count && (
                                  <p className="text-[12px] text-muted-foreground/70 mt-1">Employees: {lead.employee_count.toLocaleString()}</p>
                                )}
                              </div>
                            )}
                            <div className="flex-1 min-w-[240px]">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</p>
                              <textarea
                                value={notes[lead.id] ?? ''}
                                onChange={e => setNotes(prev => ({ ...prev, [lead.id]: e.target.value }))}
                                placeholder="Add notes…"
                                rows={3}
                                className="w-full px-2.5 py-2 text-[12px] text-foreground bg-background border border-border rounded-md resize-y font-sans outline-none focus:ring-1 focus:ring-ring"
                              />
                              <button
                                onClick={() => saveNotes(lead.id)}
                                disabled={saving === lead.id}
                                className="mt-1.5 px-3.5 py-1.5 text-[12px] font-medium text-foreground bg-background border border-border rounded-md cursor-pointer disabled:opacity-50"
                              >
                                {saving === lead.id ? 'Saving…' : 'Save Notes'}
                              </button>
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
        )}
      </div>
    </div>
  )
}
