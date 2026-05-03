'use client'

import { useEffect, useState } from 'react'

interface Lead {
  id: string
  full_name: string | null
  email: string | null
  company: string | null
  phone: string | null
  message: string | null
  status: string
  source: string
  department: string | null
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  new:       '#3b82f6',
  contacted: '#8b5cf6',
  qualified: '#f59e0b',
  converted: '#16a34a',
  dropped:   '#ef4444',
}

const SOURCE_LABEL: Record<string, string> = {
  website_form:   'Website',
  email:          'Email',
  manual:         'Manual',
  whatsapp_click: 'WhatsApp',
  claims_form:    'Claims',
}

const STATUS_OPTIONS = ['all', 'new', 'contacted', 'qualified', 'converted', 'dropped']

export default function ContactsPage() {
  const [leads,    setLeads]    = useState<Lead[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [filter,   setFilter]   = useState('all')

  useEffect(() => {
    fetch('/api/leads', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((data: Lead[]) => { setLeads(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Table area ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>Contacts</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#aaa' }}>
              {loading ? 'Loading…' : `${leads.length} total contact${leads.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Status filter pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                style={{
                  padding: '5px 12px', fontSize: 11, borderRadius: 20, border: '1px solid',
                  fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                  borderColor: filter === s ? '#111' : '#e5e5e5',
                  background:  filter === s ? '#111' : '#fff',
                  color:       filter === s ? '#fff' : '#888',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#bbb', fontSize: 13 }}>
            Loading contacts…
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                {['Name', 'Company', 'Email', 'Source', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#aaa', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => setSelected(selected?.id === lead.id ? null : lead)}
                  style={{
                    borderBottom: '1px solid #f8f8f8',
                    cursor: 'pointer',
                    background: selected?.id === lead.id ? '#f9fafb' : 'transparent',
                  }}
                >
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: '#111' }}>
                    {lead.full_name ?? '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: '#555' }}>
                    {lead.company ?? '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#888' }}>
                    {lead.email ?? '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: '#f4f4f5', color: '#888',
                    }}>
                      {SOURCE_LABEL[lead.source] ?? lead.source}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: (STATUS_COLORS[lead.status] ?? '#aaa') + '18',
                      color: STATUS_COLORS[lead.status] ?? '#aaa',
                    }}>
                      {lead.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#bbb', whiteSpace: 'nowrap' }}>
                    {new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 0', textAlign: 'center', color: '#bbb', fontSize: 13 }}>
                    No contacts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div style={{
          width: 340, flexShrink: 0,
          borderLeft: '1px solid #e5e5e5',
          background: '#fff', overflowY: 'auto',
          padding: '20px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contact Details</p>
            <button
              onClick={() => setSelected(null)}
              style={{ fontSize: 13, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
            >
              ✕
            </button>
          </div>

          {/* Name + status */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#111', letterSpacing: '-0.01em' }}>
              {selected.full_name ?? 'Unknown'}
            </h2>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#888' }}>{selected.company ?? '—'}</p>
            <span style={{
              display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
              background: (STATUS_COLORS[selected.status] ?? '#aaa') + '18',
              color: STATUS_COLORS[selected.status] ?? '#aaa',
              textTransform: 'capitalize',
            }}>
              {selected.status}
            </span>
          </div>

          {/* Fields */}
          {([
            { label: 'Email',      value: selected.email },
            { label: 'Phone',      value: selected.phone },
            { label: 'Source',     value: SOURCE_LABEL[selected.source] ?? selected.source },
            { label: 'Department', value: selected.department },
            { label: 'Message',    value: selected.message },
            { label: 'Created',    value: new Date(selected.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' }) },
          ] as { label: string; value: string | null | undefined }[]).filter(f => f.value).map(f => (
            <div key={f.label} style={{ marginBottom: 14, padding: '10px 14px', background: '#fafafa', borderRadius: 8 }}>
              <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</p>
              <p style={{ margin: 0, fontSize: 13, color: '#444', lineHeight: 1.5 }}>{f.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
