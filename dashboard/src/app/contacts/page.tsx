'use client'

import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface Contact {
  id: string; first_name: string | null; last_name: string | null
  email: string | null; company: string | null; phone?: string | null
  message?: string | null; status: string; source: string
  department?: string | null; created_at: string; isCC?: boolean
}

type CompanyGroup = { company: string | null; contacts: Contact[] }

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new:       { bg: '#eff6ff', text: '#2563eb' },
  contacted: { bg: '#fefce8', text: '#b45309' },
  engaged:   { bg: '#eff6ff', text: '#1d4ed8' },
  qualified: { bg: '#f5f3ff', text: '#7c3aed' },
  proposal:  { bg: '#fffbeb', text: '#d97706' },
  converted: { bg: '#f0fdf4', text: '#059669' },
  dropped:   { bg: '#f9fafb', text: '#6b7280' },
  cc:        { bg: '#f9fafb', text: '#9ca3af' },
}

const SOURCE_LABEL: Record<string, string> = {
  website_form: 'Website', email: 'Email', manual: 'Manual',
  whatsapp_click: 'WhatsApp', claims_form: 'Claims',
}

const STATUS_OPTIONS = ['all', 'new', 'contacted', 'engaged', 'qualified', 'proposal', 'converted', 'dropped', 'cc']

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'live.com', 'me.com', 'msn.com', 'protonmail.com', 'aol.com', 'googlemail.com',
])

function inferCompany(email: string | null): string | null {
  if (!email) return null
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain || PERSONAL_DOMAINS.has(domain)) return null
  const name = domain.split('.')[0]
  return name.charAt(0).toUpperCase() + name.slice(1)
}
function resolvedCompany(c: Contact) { return c.company?.trim() || inferCompany(c.email) || null }
function fullName(c: Contact) { return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—' }

function matchesSearch(c: Contact, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return [
    [c.first_name, c.last_name].filter(Boolean).join(' '),
    c.email,
    c.company,
    c.phone,
    c.department,
    c.message,
    SOURCE_LABEL[c.source] ?? c.source,
    c.status,
  ].some(v => v?.toLowerCase().includes(lower))
}

function groupByCompany(contacts: Contact[]): CompanyGroup[] {
  const map = new Map<string, Contact[]>()
  for (const c of contacts) {
    const key = resolvedCompany(c) ?? '—'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  const sorted = Array.from(map.entries()).sort(([a], [b]) => {
    if (a === '—') return 1; if (b === '—') return -1; return a.localeCompare(b)
  })
  return sorted.map(([company, contacts]) => {
    const primary = contacts.filter(c => !c.isCC); const cc = contacts.filter(c => c.isCC)
    return { company: company === '—' ? null : company, contacts: [...primary, ...cc] }
  })
}

export default function ContactsPage() {
  const [contacts,  setContacts]  = useState<Contact[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<Contact | null>(null)
  const [filter,    setFilter]    = useState('all')
  const [search,    setSearch]    = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      fetch('/api/leads', { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch('/api/engagement/conversations', { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch('/api/contacts/cc-participants', { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
    ]).then(([inbound, conversations, ccList]: [Contact[], Contact[], Contact[]]) => {
      const seen: string[] = []; const merged: Contact[] = []
      for (const l of (Array.isArray(inbound) ? inbound : [])) {
        merged.push(l); if (l.email) seen.push(l.email.toLowerCase())
      }
      for (const c of (Array.isArray(conversations) ? conversations : [])) {
        if (c.email && !seen.includes(c.email.toLowerCase())) { merged.push(c); seen.push(c.email.toLowerCase()) }
      }
      for (const c of (Array.isArray(ccList) ? ccList : [])) {
        if (c.email && !seen.includes(c.email.toLowerCase())) { merged.push({ ...c, isCC: true }); seen.push(c.email.toLowerCase()) }
      }
      setContacts(merged); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const statusFiltered = filter === 'all' ? contacts : contacts.filter(l => l.status === filter)
  const filtered       = statusFiltered.filter(c => matchesSearch(c, search))
  const groups         = groupByCompany(filtered)
  // Auto-expand all groups while searching so results aren't hidden
  const effectiveCollapsed = search.trim() ? new Set<string>() : collapsed

  function toggleCollapse(company: string) {
    setCollapsed(prev => { const next = new Set(prev); next.has(company) ? next.delete(company) : next.add(company); return next })
  }

  const ccCount = contacts.filter(c => c.isCC).length
  const primaryCount = contacts.length - ccCount

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Table area ── */}
      <div className="flex-1 overflow-auto p-6 lg:p-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-5 gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Contacts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading ? 'Loading…' : `${primaryCount} contact${primaryCount !== 1 ? 's' : ''} · ${ccCount} CC`}
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          {/* Filter bar */}
          <div className="border-b px-4 py-3 flex items-center gap-3">
            <div className="flex flex-wrap gap-1.5 flex-1">
              {STATUS_OPTIONS.map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={cn(
                    'px-3 py-1 text-[11px] font-semibold rounded-full border transition-colors capitalize',
                    filter === s
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-background text-muted-foreground border-border hover:border-muted-foreground'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-muted rounded-md px-3 h-8 w-52 flex-shrink-0">
              <Search size={13} className="text-muted-foreground flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search contacts…"
                className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground min-w-0"
              />
              {search && (
                <button onClick={() => setSearch('')} className="flex-shrink-0">
                  <X size={12} className="text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading contacts…</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {search ? `No contacts matching "${search}"` : 'No contacts found'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {['Name', 'Email', 'Source', 'Status', 'Date'].map(h => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map(group => {
                  const key = group.company ?? '—'
                  const isCollapsed = effectiveCollapsed.has(key)
                  const ccInGroup = group.contacts.filter(c => c.isCC).length
                  return (
                    <>
                      {/* Company group header */}
                      <tr key={`g-${key}`} onClick={() => toggleCollapse(key)} className="cursor-pointer bg-muted/40 hover:bg-muted/60 border-b transition-colors">
                        <td colSpan={5} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-3">{isCollapsed ? '▶' : '▼'}</span>
                            <span className="text-[12px] font-semibold text-foreground">
                              {group.company ?? <span className="text-muted-foreground/50 italic">No company</span>}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {group.contacts.length} contact{group.contacts.length !== 1 ? 's' : ''}
                              {ccInGroup > 0 && ` · ${ccInGroup} CC`}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Contacts in group */}
                      {!isCollapsed && group.contacts.map(contact => (
                        <TableRow key={contact.id}
                          onClick={() => setSelected(selected?.id === contact.id ? null : contact)}
                          className={cn('cursor-pointer', selected?.id === contact.id && 'bg-primary/5 hover:bg-primary/5')}
                        >
                          <TableCell className="pl-8 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-foreground">{fullName(contact)}</span>
                              {contact.isCC && (
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">CC</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-[12px] text-muted-foreground">{contact.email ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-medium">
                              {SOURCE_LABEL[contact.source] ?? contact.source}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded capitalize"
                              style={{
                                background: (STATUS_COLORS[contact.status] ?? STATUS_COLORS.cc).bg,
                                color:      (STATUS_COLORS[contact.status] ?? STATUS_COLORS.cc).text,
                              }}
                            >
                              {contact.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-[12px] text-muted-foreground whitespace-nowrap">
                            {new Date(contact.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div className="w-80 flex-shrink-0 border-l border-border bg-card overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Contact Details</p>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSelected(null)}>✕</Button>
          </div>

          <div className="mb-5">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-bold text-foreground tracking-tight">{fullName(selected)}</h2>
              {selected.isCC && <Badge variant="secondary" className="text-[9px]">CC</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mb-2">{resolvedCompany(selected) ?? 'No company'}</p>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize"
              style={{
                background: (STATUS_COLORS[selected.status] ?? STATUS_COLORS.cc).bg,
                color:      (STATUS_COLORS[selected.status] ?? STATUS_COLORS.cc).text,
              }}
            >
              {selected.isCC ? "CC'd on thread" : selected.status}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {([
              { label: 'Email',      value: selected.email },
              { label: 'Phone',      value: selected.phone },
              { label: 'Source',     value: SOURCE_LABEL[selected.source] ?? selected.source },
              { label: 'Department', value: selected.department },
              { label: 'Message',    value: selected.message },
              { label: 'Created',    value: new Date(selected.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' }) },
            ] as { label: string; value: string | null | undefined }[]).filter(f => f.value).map(f => (
              <div key={f.label} className="p-3 bg-muted/50 rounded-lg">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{f.label}</p>
                <p className="text-[13px] text-foreground leading-relaxed">{f.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
