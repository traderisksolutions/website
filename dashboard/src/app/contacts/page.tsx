'use client'

import { useEffect, useState } from 'react'

interface Contact {
  id:         string
  first_name: string | null
  last_name:  string | null
  email:      string | null
  company:    string | null
  phone?:     string | null
  message?:   string | null
  status:     string
  source:     string
  department?: string | null
  created_at: string
  isCC?:      boolean
}

type CompanyGroup = { company: string | null; contacts: Contact[] }

const STATUS_COLORS: Record<string, string> = {
  new:       '#1677FF',
  contacted: '#b45309',
  engaged:   '#2563eb',
  qualified: '#7c3aed',
  proposal:  '#d97706',
  converted: '#059669',
  dropped:   '#4b5563',
  cc:        '#9ca3af',
}

const SOURCE_LABEL: Record<string, string> = {
  website_form:   'Website',
  email:          'Email',
  manual:         'Manual',
  whatsapp_click: 'WhatsApp',
  claims_form:    'Claims',
}

const STATUS_OPTIONS = ['all', 'new', 'contacted', 'engaged', 'qualified', 'proposal', 'converted', 'dropped', 'cc']

function fullName(c: Contact) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—'
}

function groupByCompany(contacts: Contact[]): CompanyGroup[] {
  const map = new Map<string, Contact[]>()
  for (const c of contacts) {
    const key = c.company?.trim() || '—'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  // Sort: named companies A-Z, '—' last
  const groups: CompanyGroup[] = []
  const sorted = Array.from(map.entries()).sort(([a], [b]) => {
    if (a === '—') return 1
    if (b === '—') return -1
    return a.localeCompare(b)
  })
  for (const [company, contacts] of sorted) {
    // Within each group: primary contacts first, CC contacts last
    const primary = contacts.filter(c => !c.isCC)
    const cc      = contacts.filter(c => c.isCC)
    groups.push({ company: company === '—' ? null : company, contacts: [...primary, ...cc] })
  }
  return groups
}

export default function ContactsPage() {
  const [contacts,  setContacts]  = useState<Contact[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<Contact | null>(null)
  const [filter,    setFilter]    = useState('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      fetch('/api/leads',                        { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch('/api/engagement/conversations',      { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch('/api/contacts/cc-participants',      { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
    ]).then(([inbound, conversations, ccList]: [Contact[], Contact[], Contact[]]) => {
      const seen   = new Set<string>()
      const merged: Contact[] = []

      for (const l of (Array.isArray(inbound) ? inbound : [])) {
        merged.push(l)
        if (l.email) seen.add(l.email.toLowerCase())
      }
      for (const c of (Array.isArray(conversations) ? conversations : [])) {
        if (c.email && !seen.has(c.email.toLowerCase())) {
          merged.push(c)
          seen.add(c.email.toLowerCase())
        }
      }
      for (const c of (Array.isArray(ccList) ? ccList : [])) {
        if (c.email && !seen.has(c.email.toLowerCase())) {
          merged.push({ ...c, isCC: true })
          seen.add(c.email.toLowerCase())
        }
      }
      setContacts(merged)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? contacts : contacts.filter(l => l.status === filter)
  const groups   = groupByCompany(filtered)

  function toggleCollapse(company: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(company) ? next.delete(company) : next.add(company)
      return next
    })
  }

  const ccCount      = contacts.filter(c => c.isCC).length
  const primaryCount = contacts.length - ccCount

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Table area ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>Contacts</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#aaa' }}>
              {loading ? 'Loading…' : `${primaryCount} contact${primaryCount !== 1 ? 's' : ''} · ${ccCount} CC`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: '5px 12px', fontSize: 11, borderRadius: 20, border: '1px solid',
                fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                borderColor: filter === s ? '#111' : '#e5e5e5',
                background:  filter === s ? '#111' : '#fff',
                color:       filter === s ? '#fff' : '#888',
              }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#bbb', fontSize: 13 }}>
            Loading contacts…
          </div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#bbb', fontSize: 13 }}>No contacts found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                {['Name', 'Email', 'Source', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#aaa', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => {
                const key        = group.company ?? '—'
                const isCollapsed = collapsed.has(key)
                const ccInGroup  = group.contacts.filter(c => c.isCC).length
                return (
                  <>
                    {/* ── Company group header ── */}
                    <tr key={`group-${key}`} onClick={() => toggleCollapse(key)} style={{ cursor: 'pointer', background: '#f8f9fa' }}>
                      <td colSpan={5} style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#9ca3af', width: 10 }}>{isCollapsed ? '▶' : '▼'}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                            {group.company ?? <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>No company</span>}
                          </span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>
                            {group.contacts.length} contact{group.contacts.length !== 1 ? 's' : ''}
                            {ccInGroup > 0 && ` · ${ccInGroup} CC`}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* ── Contacts in group ── */}
                    {!isCollapsed && group.contacts.map(contact => (
                      <tr key={contact.id}
                        onClick={() => setSelected(selected?.id === contact.id ? null : contact)}
                        style={{ borderBottom: '1px solid #f8f8f8', cursor: 'pointer', background: selected?.id === contact.id ? '#f0f4ff' : 'transparent' }}
                      >
                        <td style={{ padding: '10px 12px 10px 28px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{fullName(contact)}</span>
                            {contact.isCC && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#f3f4f6', color: '#9ca3af', letterSpacing: '0.04em' }}>CC</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#888' }}>{contact.email ?? '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#f4f4f5', color: '#888' }}>
                            {SOURCE_LABEL[contact.source] ?? contact.source}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, textTransform: 'capitalize',
                            background: (STATUS_COLORS[contact.status] ?? '#aaa') + '18',
                            color:       STATUS_COLORS[contact.status] ?? '#aaa',
                          }}>
                            {contact.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#bbb', whiteSpace: 'nowrap' }}>
                          {new Date(contact.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid #e5e5e5', background: '#fff', overflowY: 'auto', padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contact Details</p>
            <button onClick={() => setSelected(null)} style={{ fontSize: 13, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>{fullName(selected)}</h2>
              {selected.isCC && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#f3f4f6', color: '#9ca3af' }}>CC</span>
              )}
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#888' }}>{selected.company ?? 'No company'}</p>
            <span style={{
              display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, textTransform: 'capitalize',
              background: (STATUS_COLORS[selected.status] ?? '#aaa') + '18',
              color:       STATUS_COLORS[selected.status] ?? '#aaa',
            }}>
              {selected.isCC ? 'CC’d on email thread' : selected.status}
            </span>
          </div>

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
