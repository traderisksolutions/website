'use client'

import { useEffect, useState } from 'react'
import { Search, X, ChevronRight, ChevronDown, Users, Copy, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { statusMeta } from '@/lib/status'

interface Contact {
  id: string; first_name: string | null; last_name: string | null
  email: string | null; company: string | null; phone?: string | null
  message?: string | null; status: string; source: string
  department?: string | null; created_at: string; isCC?: boolean
}

type CompanyGroup = { company: string | null; contacts: Contact[] }

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
    c.email, c.company, c.phone, c.department, c.message,
    SOURCE_LABEL[c.source] ?? c.source, c.status,
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status)
  return (
    <span className="st-badge" style={{ color: m.color, background: m.bg }}>
      {m.label}
    </span>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-border/60">
          {[60, 45, 30, 20, 25].map((w, j) => (
            <td key={j} className={cn('px-3 h-11', j === 0 && 'pl-8')}>
              <div className="skeleton sk-cell" style={{ width: `${w}%`, height: 10 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export default function ContactsPage() {
  const [contacts,  setContacts]  = useState<Contact[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<Contact | null>(null)
  const [filter,    setFilter]    = useState('all')
  const [search,    setSearch]    = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [copied,    setCopied]    = useState<string | null>(null)

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
  const effectiveCollapsed = search.trim() ? new Set<string>() : collapsed

  function toggleCollapse(company: string) {
    setCollapsed(prev => { const next = new Set(prev); next.has(company) ? next.delete(company) : next.add(company); return next })
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key); setTimeout(() => setCopied(null), 1500)
  }

  const ccCount      = contacts.filter(c => c.isCC).length
  const primaryCount = contacts.length - ccCount

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Main table area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Page header */}
        <div className="page-header bg-background">
          <div>
            <h1 className="page-title">Contacts</h1>
            <p className="page-subtitle">
              {loading
                ? 'Loading contacts…'
                : `${primaryCount} contact${primaryCount !== 1 ? 's' : ''}${ccCount > 0 ? ` · ${ccCount} CC` : ''}`}
            </p>
          </div>
        </div>

        {/* Table card */}
        <div className="flex-1 overflow-hidden px-6 pb-6">
          <div className="h-full flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden">

            {/* Filter bar */}
            <div className="filter-bar">
              <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                {STATUS_OPTIONS.map(s => (
                  <button key={s} onClick={() => setFilter(s)}
                    className={cn('filter-pill capitalize', filter === s && 'active')}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="filter-search flex-shrink-0">
                <Search size={12} className="text-muted-foreground/60 flex-shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search contacts…"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="data-table w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="pl-8 pr-3 text-left">Name</th>
                    <th className="text-left">Email</th>
                    <th className="text-left">Source</th>
                    <th className="text-left">Status</th>
                    <th className="text-right pr-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonRows />
                  ) : groups.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="empty-state">
                          <div className="empty-icon-wrap">
                            <Users size={20} className="text-muted-foreground" />
                          </div>
                          <p className="empty-title">{search ? 'No contacts found' : 'No contacts yet'}</p>
                          <p className="empty-desc">
                            {search
                              ? `No contacts match "${search}"`
                              : 'Contacts will appear here once leads start coming in.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    groups.map(group => {
                      const key = group.company ?? '—'
                      const isCollapsed = effectiveCollapsed.has(key)
                      const ccInGroup = group.contacts.filter(c => c.isCC).length
                      return (
                        <>
                          {/* Company group header */}
                          <tr key={`g-${key}`}
                            onClick={() => toggleCollapse(key)}
                            className="group-row cursor-pointer select-none">
                            <td colSpan={5} className="pl-3">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground/50 flex-shrink-0">
                                  {isCollapsed
                                    ? <ChevronRight size={12} strokeWidth={2.5} />
                                    : <ChevronDown  size={12} strokeWidth={2.5} />}
                                </span>
                                <span className="text-[12px] font-semibold text-foreground">
                                  {group.company ?? <span className="text-muted-foreground/40 font-normal italic">No company</span>}
                                </span>
                                <span className="text-[11px] text-muted-foreground/60">
                                  {group.contacts.length} contact{group.contacts.length !== 1 ? 's' : ''}
                                  {ccInGroup > 0 && ` · ${ccInGroup} CC`}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* Contacts in group */}
                          {!isCollapsed && group.contacts.map(contact => (
                            <tr key={contact.id}
                              onClick={() => setSelected(selected?.id === contact.id ? null : contact)}
                              className={cn(
                                'cursor-pointer border-b border-border/60 transition-colors',
                                selected?.id === contact.id
                                  ? 'row-selected'
                                  : 'hover:bg-muted/40',
                              )}>
                              <td className="pl-8 pr-3 h-11">
                                <div className="flex items-center gap-2">
                                  <span className="text-[13px] font-medium text-foreground leading-none">
                                    {fullName(contact)}
                                  </span>
                                  {contact.isCC && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">
                                      CC
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="text-[12px] text-muted-foreground pr-3 max-w-[200px]">
                                <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                                  {contact.email ?? '—'}
                                </span>
                              </td>
                              <td className="pr-3">
                                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                                  {SOURCE_LABEL[contact.source] ?? contact.source}
                                </span>
                              </td>
                              <td className="pr-3">
                                <StatusBadge status={contact.status} />
                              </td>
                              <td className="text-[11px] text-muted-foreground/60 whitespace-nowrap text-right pr-4">
                                {fmtDate(contact.created_at)}
                              </td>
                            </tr>
                          ))}
                        </>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            {!loading && groups.length > 0 && (
              <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex-shrink-0">
                <span className="text-[11px] text-muted-foreground/60">
                  {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
                  {filter !== 'all' && ` · filtered by ${filter}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div className="w-[300px] flex-shrink-0 border-l border-border bg-card overflow-y-auto flex flex-col">

          {/* Panel header */}
          <div className="detail-section flex items-center justify-between">
            <span className="detail-section-label" style={{ margin: 0 }}>Contact Details</span>
            <button
              onClick={() => setSelected(null)}
              className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>

          {/* Identity */}
          <div className="detail-section">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-[13px] font-bold text-muted-foreground">
                {(selected.first_name?.[0] ?? selected.email?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[14px] font-semibold text-foreground m-0 leading-tight">{fullName(selected)}</p>
                  {selected.isCC && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">CC</span>
                  )}
                </div>
                {resolvedCompany(selected) && (
                  <p className="text-[12px] text-muted-foreground mt-0.5 mb-1.5">{resolvedCompany(selected)}</p>
                )}
                <StatusBadge status={selected.isCC ? 'cc' : selected.status} />
              </div>
            </div>
          </div>

          {/* Contact details */}
          <div className="detail-section">
            <p className="detail-section-label">Contact</p>
            <div className="flex flex-col gap-3">
              {selected.email && (
                <div className="detail-field">
                  <p className="detail-field-label">Email</p>
                  <button
                    onClick={() => copy(selected.email!, 'email')}
                    className="flex items-center gap-1.5 max-w-full bg-transparent border-0 p-0 cursor-pointer text-left">
                    <span className="detail-field-value overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] block">
                      {selected.email}
                    </span>
                    {copied === 'email'
                      ? <Check size={11} className="text-emerald-500 flex-shrink-0" />
                      : <Copy size={10} className="text-muted-foreground/30 flex-shrink-0 hover:text-muted-foreground" />}
                  </button>
                </div>
              )}
              {selected.phone && (
                <div className="detail-field">
                  <p className="detail-field-label">Phone</p>
                  <button
                    onClick={() => copy(selected.phone!, 'phone')}
                    className="flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer">
                    <span className="detail-field-value">{selected.phone}</span>
                    {copied === 'phone'
                      ? <Check size={11} className="text-emerald-500 flex-shrink-0" />
                      : <Copy size={10} className="text-muted-foreground/30 flex-shrink-0" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Lead info */}
          <div className="detail-section flex-1">
            <p className="detail-section-label">Lead Info</p>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Source',     value: SOURCE_LABEL[selected.source] ?? selected.source },
                { label: 'Department', value: selected.department },
                { label: 'Message',    value: selected.message },
                { label: 'Created',    value: new Date(selected.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' }) },
              ].filter(f => f.value).map(f => (
                <div key={f.label} className="detail-field">
                  <p className="detail-field-label">{f.label}</p>
                  <p className="detail-field-value">{f.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
