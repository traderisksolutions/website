'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import React from 'react'

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
  new:          { bg: '#f0f0f0', color: '#555'    },
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
  const [leads,       setLeads]       = useState<OutboundLead[]>([])
  const [loading,     setLoading]     = useState(true)
  const [q,           setQ]           = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [typeFilter,   setTypeFilter]   = useState<RecordType | 'all'>('all')
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [notes,       setNotes]       = useState<Record<string, string>>({})
  const [saving,      setSaving]      = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/outbound/leads')
      if (res.ok) {
        const data: OutboundLead[] = await res.json()
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
      l.full_name?.toLowerCase().includes(s)       ||
      l.headline?.toLowerCase().includes(s)         ||
      l.current_company?.toLowerCase().includes(s)  ||
      l.current_title?.toLowerCase().includes(s)    ||
      l.location?.toLowerCase().includes(s)         ||
      l.headquarters?.toLowerCase().includes(s)
    )
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid #e5e5e5', background: '#fff',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111', letterSpacing: '-0.02em' }}>
            Outbound Leads
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>
            {leads.length} total · {leads.filter(l => l.status === 'new').length} new
          </p>
        </div>
        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: '#f4f4f5', borderRadius: 7, padding: '0 10px', height: 34, width: 220,
        }}>
          <Search size={13} style={{ color: '#aaa', flexShrink: 0 }} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search leads…"
            style={{ flex: 1, border: 'none', background: 'none', fontSize: 13, color: '#111', outline: 'none' }}
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as Status | 'all')}
          style={{
            height: 34, padding: '0 10px', borderRadius: 7,
            border: '1px solid #e5e5e5', fontSize: 12, color: '#555', background: '#fff', cursor: 'pointer',
          }}
        >
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="replied">Replied</option>
          <option value="qualified">Qualified</option>
          <option value="disqualified">Disqualified</option>
        </select>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as RecordType | 'all')}
          style={{
            height: 34, padding: '0 10px', borderRadius: 7,
            border: '1px solid #e5e5e5', fontSize: 12, color: '#555', background: '#fff', cursor: 'pointer',
          }}
        >
          <option value="all">All Types</option>
          <option value="person">People</option>
          <option value="company">Companies</option>
        </select>

      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
            No leads yet.{' '}
            <a href="/outbound/search" style={{ color: '#111', fontWeight: 500 }}>
              Search for prospects →
            </a>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                {['', 'Name', 'Role / Headline', 'Company', 'Location', 'Email', 'Source', 'Status', 'Added'].map(col => (
                  <th key={col} style={{
                    padding: '9px 14px', fontSize: 11, fontWeight: 600, color: '#aaa',
                    textAlign: 'left', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => {
                const expanded = expandedId === lead.id
                const s        = STATUS_STYLE[lead.status]
                const avatar   = lead.profile_picture ?? lead.logo_url
                const date     = new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })

                return (
                  <React.Fragment key={lead.id}>
                    <tr
                      onClick={() => setExpandedId(expanded ? null : lead.id)}
                      style={{
                        borderBottom: '1px solid #f0f0f0',
                        background:   expanded ? '#fafafa' : '#fff',
                        cursor:       'pointer',
                        transition:   'background 0.1s',
                      }}
                    >
                      {/* Avatar */}
                      <td style={{ padding: '10px 8px 10px 14px', width: 44 }}>
                        {avatar ? (
                          <img src={avatar} alt="" style={{
                            width: 32, height: 32, objectFit: 'cover', background: '#f4f4f5',
                            borderRadius: lead.record_type === 'person' ? '50%' : 6,
                          }} />
                        ) : (
                          <div style={{
                            width: 32, height: 32, background: '#f4f4f5', fontSize: 15,
                            borderRadius: lead.record_type === 'person' ? '50%' : 6,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {lead.record_type === 'person' ? '👤' : '🏢'}
                          </div>
                        )}
                      </td>

                      {/* Name */}
                      <td style={{ padding: '10px 14px', minWidth: 160 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111', letterSpacing: '-0.01em' }}>
                          {lead.full_name ?? '—'}
                        </p>
                        {lead.linkedin_url && (
                          <a
                            href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: 11, color: '#0a66c2', textDecoration: 'none' }}
                          >
                            LinkedIn ↗
                          </a>
                        )}
                      </td>

                      {/* Role */}
                      <td style={{ padding: '10px 14px', maxWidth: 200 }}>
                        <p style={{
                          margin: 0, fontSize: 12, color: '#555',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {lead.current_title ?? lead.headline ?? lead.company_tagline ?? '—'}
                        </p>
                      </td>

                      {/* Company */}
                      <td style={{ padding: '10px 14px', minWidth: 140 }}>
                        <p style={{ margin: 0, fontSize: 12, color: '#555' }}>
                          {lead.current_company ?? '—'}
                        </p>
                      </td>

                      {/* Location */}
                      <td style={{ padding: '10px 14px', minWidth: 120 }}>
                        <p style={{ margin: 0, fontSize: 12, color: '#888' }}>
                          {lead.location ?? lead.headquarters ?? '—'}
                        </p>
                      </td>

                      {/* Email */}
                      <td style={{ padding: '10px 14px', minWidth: 180 }}>
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: '#16a34a', textDecoration: 'none', fontWeight: 500 }}>
                            {lead.email}
                          </a>
                        ) : lead.record_type === 'person' ? (
                          <span style={{ fontSize: 12, color: '#ddd' }}>—</span>
                        ) : null}
                      </td>

                      {/* Source */}
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 500, padding: '2px 7px',
                          borderRadius: 5, background: '#f4f4f5', color: '#888',
                        }}>
                          {SOURCE_LABEL[lead.source]}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                        <select
                          value={lead.status}
                          onChange={e => updateStatus(lead.id, e.target.value as Status)}
                          style={{
                            padding: '3px 8px', fontSize: 11, fontWeight: 500, borderRadius: 5,
                            border: 'none', background: s.bg, color: s.color, cursor: 'pointer',
                          }}
                        >
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="replied">Replied</option>
                          <option value="qualified">Qualified</option>
                          <option value="disqualified">Disqualified</option>
                        </select>
                      </td>

                      {/* Date */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>{date}</p>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {expanded && (
                      <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                        <td colSpan={9} style={{ padding: '14px 14px 18px 60px' }}>
                          <div style={{ display: 'flex', gap: 32 }}>

                            {/* Details */}
                            {(lead.headline || lead.company_tagline || lead.current_industry) && (
                              <div style={{ flex: 2 }}>
                                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Details
                                </p>
                                {(lead.headline || lead.company_tagline) && (
                                  <p style={{ margin: '0 0 6px', fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                                    {lead.headline ?? lead.company_tagline}
                                  </p>
                                )}
                                {lead.current_industry && (
                                  <p style={{ margin: 0, fontSize: 12, color: '#888' }}>Industry: {lead.current_industry}</p>
                                )}
                                {lead.employee_count && (
                                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
                                    Employees: {lead.employee_count.toLocaleString()}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Notes */}
                            <div style={{ flex: 1, minWidth: 240 }}>
                              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Notes
                              </p>
                              <textarea
                                value={notes[lead.id] ?? ''}
                                onChange={e => setNotes(prev => ({ ...prev, [lead.id]: e.target.value }))}
                                placeholder="Add notes…"
                                rows={3}
                                style={{
                                  width: '100%', padding: '8px 10px', fontSize: 12,
                                  borderRadius: 7, border: '1px solid #e5e5e5',
                                  resize: 'vertical', fontFamily: 'inherit', color: '#555',
                                  boxSizing: 'border-box', background: '#fff',
                                }}
                              />
                              <button
                                onClick={() => saveNotes(lead.id)}
                                disabled={saving === lead.id}
                                style={{
                                  marginTop: 6, padding: '5px 14px', fontSize: 12, fontWeight: 500,
                                  borderRadius: 6, border: '1px solid #e5e5e5',
                                  background: '#fff', color: '#555', cursor: 'pointer',
                                }}
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
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
