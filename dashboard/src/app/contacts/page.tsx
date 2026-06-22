'use client'

import { useEffect, useState } from 'react'
import { X, ChevronRight, ChevronDown, Users, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppSplitLayout, AppMainPanel, AppPageHeader } from '@/components/app-shell'
import { DataTableToolbar, DataTableSearch } from '@/components/data-table/toolbar'
import { StatusBadge } from '@/components/status-badge'
import type { AppStatus } from '@/components/status-badge'
import { DetailSection, DetailField } from '@/components/detail-section'

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
const STATUS_LABELS: Record<string, string> = {
  all: 'All', new: 'New', contacted: 'Contacted', engaged: 'Engaged',
  qualified: 'Qualified', proposal: 'Proposal', converted: 'Converted',
  dropped: 'Dropped', cc: 'CC',
}

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

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-[--border-subtle]">
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
    <AppSplitLayout>

      {/* ── Main table area ── */}
      <AppMainPanel>

        <AppPageHeader
          title="Contacts"
          description={loading
            ? 'Loading contacts…'
            : `${primaryCount} contact${primaryCount !== 1 ? 's' : ''}${ccCount > 0 ? ` · ${ccCount} CC` : ''}`}
        />

        {/* Table card */}
        <div className="flex-1 overflow-hidden px-6 pb-6">
          <div className="h-full flex flex-col rounded-xl bg-card overflow-hidden" style={{ boxShadow: 'var(--card-shadow)' }}>

            {/* Filter / Search toolbar */}
            <DataTableToolbar>
              <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                {STATUS_OPTIONS.map(s => (
                  <button key={s} onClick={() => setFilter(s)}
                    aria-pressed={filter === s}
                    className={cn('filter-pill', filter === s && 'active')}>
                    {STATUS_LABELS[s] ?? s}
                  </button>
                ))}
              </div>
              <DataTableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search contacts…"
                className="flex-shrink-0"
              />
            </DataTableToolbar>

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
                                <span className="text-muted-foreground/40 flex-shrink-0">
                                  {isCollapsed
                                    ? <ChevronRight size={11} strokeWidth={2.5} />
                                    : <ChevronDown  size={11} strokeWidth={2.5} />}
                                </span>
                                <span className="text-[12.5px] font-semibold text-foreground tracking-tight">
                                  {group.company ?? <span className="text-muted-foreground/35 font-normal italic text-[12px]">No company</span>}
                                </span>
                                <span className="inline-flex items-center text-[10.5px] font-semibold text-muted-foreground/55 bg-muted/70 rounded px-1.5 py-px leading-none">
                                  {group.contacts.length}
                                </span>
                                {ccInGroup > 0 && (
                                  <span className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">
                                    {ccInGroup} CC
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Contacts in group */}
                          {!isCollapsed && group.contacts.map(contact => (
                            <tr key={contact.id}
                              onClick={() => setSelected(selected?.id === contact.id ? null : contact)}
                              className={cn(
                                'cursor-pointer border-b border-[--border-subtle] transition-colors',
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
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted/80 text-muted-foreground/50 uppercase tracking-widest leading-none">
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
                                <StatusBadge status={contact.status as AppStatus} />
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
              <div className="px-4 py-2.5 border-t border-[--border-subtle] bg-muted/20 flex-shrink-0">
                <span className="text-[11px] text-muted-foreground/60">
                  {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
                  {filter !== 'all' && ` · filtered by ${filter}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </AppMainPanel>

      {/* ── Detail panel ── */}
      {selected && (
        <div className="w-[300px] flex-shrink-0 border-l border-[--border-subtle] bg-card overflow-y-auto flex flex-col">

          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[--border-subtle] flex-shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/55">
              Contact Details
            </span>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground/60 hover:text-foreground bg-transparent border-0 cursor-pointer">
              <X size={13} />
            </button>
          </div>

          {/* Identity */}
          <DetailSection>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/[0.07] flex items-center justify-center flex-shrink-0 text-[13px] font-bold text-primary/70">
                {(selected.first_name?.[0] ?? selected.email?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <p className="text-[13.5px] font-semibold text-foreground m-0 leading-tight">{fullName(selected)}</p>
                  {selected.isCC && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-[4px] bg-muted/80 text-muted-foreground/50 uppercase tracking-widest leading-none">CC</span>
                  )}
                </div>
                {resolvedCompany(selected) && (
                  <p className="text-[12px] text-muted-foreground mb-1.5">{resolvedCompany(selected)}</p>
                )}
                <StatusBadge status={(selected.isCC ? 'cc' : selected.status) as AppStatus} />
              </div>
            </div>
          </DetailSection>

          {/* Contact details */}
          <DetailSection label="Contact">
            {selected.email && (
              <DetailField label="Email">
                <button
                  onClick={() => copy(selected.email!, 'email')}
                  className="flex items-center gap-1.5 max-w-full bg-transparent border-0 p-0 cursor-pointer text-left">
                  <span className="text-[12px] text-foreground/85 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] block leading-[1.5]">
                    {selected.email}
                  </span>
                  {copied === 'email'
                    ? <Check size={11} className="text-emerald-500 flex-shrink-0" />
                    : <Copy size={10} className="text-muted-foreground/30 flex-shrink-0 hover:text-muted-foreground" />}
                </button>
              </DetailField>
            )}
            {selected.phone && (
              <DetailField label="Phone">
                <button
                  onClick={() => copy(selected.phone!, 'phone')}
                  className="flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer">
                  <span className="text-[12px] text-foreground/85 leading-[1.5]">{selected.phone}</span>
                  {copied === 'phone'
                    ? <Check size={11} className="text-emerald-500 flex-shrink-0" />
                    : <Copy size={10} className="text-muted-foreground/30 flex-shrink-0" />}
                </button>
              </DetailField>
            )}
          </DetailSection>

          {/* Lead info */}
          <DetailSection label="Lead Info" className="flex-1">
            {[
              { label: 'Source',     value: SOURCE_LABEL[selected.source] ?? selected.source },
              { label: 'Department', value: selected.department },
              { label: 'Message',    value: selected.message },
              { label: 'Created',    value: new Date(selected.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' }) },
            ].filter(f => f.value).map(f => (
              <DetailField key={f.label} label={f.label}>
                {f.value}
              </DetailField>
            ))}
          </DetailSection>
        </div>
      )}
    </AppSplitLayout>
  )
}
