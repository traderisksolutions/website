'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { X, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react'
import BulkImportContacts from '@/components/BulkImportContacts'
import { cn } from '@/lib/utils'
import { AppSplitLayout, AppMainPanel } from '@/components/app-shell'
import { DataTableSearch } from '@/components/data-table/toolbar'
import { StatusBadge } from '@/components/status-badge'
import type { AppStatus } from '@/components/status-badge'
import { DetailSection, DetailField } from '@/components/detail-section'
import { Avatar, Chip, textareaCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterGroupRow, RegisterEmpty } from '@/components/ui/register'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { CompaniesTab } from '@/components/contacts/CompaniesTab'

const INK = '#202124'
const MUTED = '#5f6368'

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
        <tr key={i} style={{ borderBottom: '1px solid #e8eaed' }}>
          {[60, 30, 25, 40].map((w, j) => (
            <td key={j} className={cn('px-4 h-14', j === 0 && 'pl-6', j === 3 && 'pr-6')}>
              <div className={cn('h-3.5 rounded bg-[#f1f3f4] animate-pulse', j === 3 && 'ml-auto')} style={{ width: `${w}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ── Add-contact dialog ────────────────────────────────────────────────────────
// Manually create a person in Contacts. All fields optional, but the
// contacts table needs at least one of email / phone.

const EMPTY_PERSON = { first_name: '', last_name: '', email: '', phone: '', company: '', notes: '' }

function AddContactDialog({ open, onOpenChange, onSaved, referral = false }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void
  /** Opens straight into "log a referral" mode — also creates an inbound_leads row (source
   *  'referral') so the referral gets a trackable status lifecycle, not just a bare contact. */
  referral?: boolean
}) {
  const [form,   setForm]   = useState(EMPTY_PERSON)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const set = (k: keyof typeof EMPTY_PERSON, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { if (open) { setForm(EMPTY_PERSON); setError(null) } }, [open])

  const canSave = form.email.trim() !== '' || form.phone.trim() !== ''

  async function save() {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/contacts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, isReferral: referral }),
      })
      if (!res.ok) { setError((await res.json()).error ?? 'Failed to save'); return }
      onSaved()
      onOpenChange(false)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-medium tracking-[-0.01em]" style={{ color: INK }}>{referral ? 'Log referral' : 'Add contact'}</DialogTitle>
          <DialogDescription className="text-[14px]" style={{ color: MUTED }}>
            {referral
              ? 'A person referred to TRS by the team. Tracked in Pipeline like any other lead. Email or phone required.'
              : 'Email or phone required.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Input placeholder="First name" aria-label="First name" value={form.first_name} onChange={e => set('first_name', e.target.value)} />
            <Input placeholder="Last name"  aria-label="Last name"  value={form.last_name}  onChange={e => set('last_name', e.target.value)} />
          </div>
          <Input placeholder="Email" aria-label="Email" value={form.email} onChange={e => set('email', e.target.value)} />
          <Input placeholder="Phone" aria-label="Phone" value={form.phone} onChange={e => set('phone', e.target.value)} />
          <Input placeholder="Company" aria-label="Company" value={form.company} onChange={e => set('company', e.target.value)} />
          {referral && (
            <textarea
              placeholder="Who referred them, and what they need"
              aria-label="Referral notes"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className={textareaCls}
            />
          )}
          {error && <p className="m-0 text-[13px]" style={{ color: MUTED }}>{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !canSave}>{saving ? 'Saving…' : referral ? 'Log referral' : 'Add contact'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Contacts | Companies switch, as underline tabs (same pattern as the Companies page). */
function ContactsViewTabs({ view, onChange }: { view: 'contacts' | 'companies'; onChange: (v: 'contacts' | 'companies') => void }) {
  return (
    <div className="mt-4 flex items-center gap-6" role="tablist" aria-label="Contacts or companies">
      {(['contacts', 'companies'] as const).map(k => {
        const on = view === k
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onChange(k)}
            className={cn('relative pb-2 bg-transparent border-0 cursor-pointer text-[15px]', on ? 'font-medium' : 'hover:text-[#202124]')}
            style={{ color: on ? INK : MUTED }}>
            {k === 'contacts' ? 'Contacts' : 'Companies'}
            <span className={cn('absolute left-0 right-0 bottom-0 h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden />
          </button>
        )
      })}
    </div>
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
  const [addOpen,   setAddOpen]   = useState(false)
  const [referralOpen, setReferralOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [view,      setView]      = useState<'contacts' | 'companies'>('contacts')

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/leads', { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch('/api/engagement/conversations', { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch('/api/contacts/cc-participants', { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch('/api/contacts', { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
    ]).then(([inbound, conversations, ccList, manual]: [Contact[], Contact[], Contact[], Contact[]]) => {
      const seen: string[] = []; const merged: Contact[] = []
      for (const l of (Array.isArray(inbound) ? inbound : [])) {
        merged.push(l); if (l.email) seen.push(l.email.toLowerCase())
      }
      for (const c of (Array.isArray(conversations) ? conversations : [])) {
        if (c.email && !seen.includes(c.email.toLowerCase())) { merged.push(c); seen.push(c.email.toLowerCase()) }
      }
      // Manually-added contacts (Contacts "Add contact") that aren't already surfaced.
      for (const c of (Array.isArray(manual) ? manual : [])) {
        if (c.email && !seen.includes(c.email.toLowerCase())) { merged.push(c); seen.push(c.email.toLowerCase()) }
      }
      for (const c of (Array.isArray(ccList) ? ccList : [])) {
        if (c.email && !seen.includes(c.email.toLowerCase())) { merged.push({ ...c, isCC: true }); seen.push(c.email.toLowerCase()) }
      }
      setContacts(merged); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

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

  // Insurance clients (companies/policies/debit notes) are additive to this page — a separate
  // tab that leaves the sales-lead contact list above untouched.
  if (view === 'companies') {
    return <CompaniesTab onSwitchToContacts={() => setView('contacts')} />
  }

  return (
    <AppSplitLayout className="bg-white">

      {/* ── Main table area ── */}
      <AppMainPanel className="bg-white">

        {/* Header: title, count line, view tabs, actions */}
        <div className="flex-shrink-0 px-6 sm:px-12 pt-10" style={{ color: INK }}>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Contacts</h1>
              <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
                {loading ? 'Loading…' : `${primaryCount} contact${primaryCount !== 1 ? 's' : ''}${ccCount > 0 ? ` · ${ccCount} cc` : ''}`}
              </p>
              <ContactsViewTabs view={view} onChange={setView} />
            </div>
            <div className="flex items-center gap-3 flex-wrap pb-2">
              <Button size="lg" variant="outline" onClick={() => setImportOpen(true)}>Import CSV</Button>
              <Button size="lg" variant="outline" onClick={() => setReferralOpen(true)}>Log referral</Button>
              <Button size="lg" onClick={() => setAddOpen(true)}>Add contact</Button>
            </div>
          </div>

          {/* Filter row: status pills left, search right */}
          <div className="mt-5 pb-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid #e8eaed' }}>
            <div className="flex flex-wrap gap-1.5 min-w-0" role="group" aria-label="Filter by status">
              {STATUS_OPTIONS.map(s => (
                <button key={s} type="button" onClick={() => setFilter(s)}
                  aria-pressed={filter === s}
                  className={cn('filter-pill', filter === s && 'active')}>
                  {STATUS_LABELS[s] ?? s}
                </button>
              ))}
            </div>
            <DataTableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search contacts"
              className="flex-shrink-0"
            />
          </div>
        </div>

        <AddContactDialog open={addOpen} onOpenChange={setAddOpen} onSaved={load} />
        <AddContactDialog open={referralOpen} onOpenChange={setReferralOpen} onSaved={load} referral />
        <BulkImportContacts open={importOpen} onOpenChange={setImportOpen} onImported={load} />

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 sm:px-12 pt-6 pb-16" style={{ color: INK }}>
          <Register label="Contacts by company" minWidth={640}>
            <RegisterHead>
              <RegisterTh first hint="Name, and the email on file">Name</RegisterTh>
              <RegisterTh hint="Where the contact came from">Source</RegisterTh>
              <RegisterTh>Status</RegisterTh>
              <RegisterTh last align="right" hint="Date the contact was first recorded">Added</RegisterTh>
            </RegisterHead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : groups.length === 0 ? (
                <RegisterEmpty colSpan={4}>
                  {search
                    ? <>No contacts match “{search}”. <button type="button" onClick={() => setSearch('')} className="underline bg-transparent border-0 cursor-pointer p-0 text-[15px]" style={{ color: INK }}>Clear search</button></>
                    : 'No contacts yet. Leads appear here as they arrive.'}
                </RegisterEmpty>
              ) : (
                groups.map(group => {
                  const key = group.company ?? '—'
                  const isCollapsed = effectiveCollapsed.has(key)
                  const ccInGroup = group.contacts.filter(c => c.isCC).length
                  return (
                    <Fragment key={key}>
                      {/* Company group header */}
                      <RegisterGroupRow colSpan={4} onClick={() => toggleCollapse(key)} open={!isCollapsed}>
                        <span className="flex items-center gap-2 select-none">
                          <span className="flex-shrink-0" style={{ color: '#9aa0a6' }} aria-hidden>
                            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </span>
                          <span style={{ color: group.company ? '#3c4043' : MUTED }}>{group.company ?? 'No company'}</span>
                          <span className="font-normal tabular-nums" style={{ color: '#80868b' }}>{group.contacts.length}</span>
                          {ccInGroup > 0 && <span className="font-normal" style={{ color: '#80868b' }}>{ccInGroup} cc</span>}
                        </span>
                      </RegisterGroupRow>

                      {/* Contacts in group */}
                      {!isCollapsed && group.contacts.map(contact => {
                        const on = selected?.id === contact.id
                        return (
                          <RegisterRow key={contact.id} selected={on} onClick={() => setSelected(on ? null : contact)}>
                            <RegisterCell first selected={on} title={contact.email ?? undefined}
                              primary={<span className="inline-flex items-center gap-2 max-w-full"><span className="truncate min-w-0">{fullName(contact)}</span>{contact.isCC && <Chip>CC</Chip>}</span>}
                              secondary={contact.email ?? 'No email on file'} />
                            <RegisterCell><Chip>{SOURCE_LABEL[contact.source] ?? contact.source}</Chip></RegisterCell>
                            <RegisterCell><StatusBadge status={contact.status as AppStatus} /></RegisterCell>
                            <RegisterCell last align="right"><span className="text-[13.5px] tabular-nums" style={{ color: MUTED }}>{fmtDate(contact.created_at)}</span></RegisterCell>
                          </RegisterRow>
                        )
                      })}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </Register>

          {!loading && groups.length > 0 && (
            <p className="m-0 mt-4 text-[12.5px]" style={{ color: MUTED }}>
              {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
              {filter !== 'all' && ` · ${STATUS_LABELS[filter] ?? filter}`}
            </p>
          )}
        </div>
      </AppMainPanel>

      {/* ── Detail panel: overlay under 768px, side pane above ── */}
      {selected && (
        <div className="fixed inset-0 z-40 md:static md:inset-auto md:z-auto md:w-[320px] md:flex-shrink-0 bg-white overflow-y-auto flex flex-col"
          style={{ color: INK, borderLeft: '1px solid #e8eaed' }}>

          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #e8eaed' }}>
            <span className="text-[16px] font-medium tracking-[-0.01em]">Contact</span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] hover:bg-[#f1f3f4] transition-colors bg-transparent border-0 cursor-pointer"
              style={{ color: MUTED }}>
              <X size={14} />
            </button>
          </div>

          {/* Identity */}
          <DetailSection>
            <div className="flex items-start gap-3">
              <Avatar name={fullName(selected)} className="w-9 h-9" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <p className="text-[15px] font-medium m-0 leading-tight" style={{ color: INK }}>{fullName(selected)}</p>
                  {selected.isCC && <Chip>CC</Chip>}
                </div>
                {resolvedCompany(selected) && (
                  <p className="text-[13px] m-0 mb-2" style={{ color: MUTED }}>{resolvedCompany(selected)}</p>
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
                  type="button"
                  onClick={() => copy(selected.email!, 'email')}
                  aria-label={`Copy email ${selected.email}`}
                  className="flex items-center gap-1.5 max-w-full bg-transparent border-0 p-0 cursor-pointer text-left">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[220px] block" style={{ color: INK }}>
                    {selected.email}
                  </span>
                  {copied === 'email'
                    ? <Check size={12} className="flex-shrink-0" style={{ color: INK }} />
                    : <Copy size={12} className="flex-shrink-0" style={{ color: '#9aa0a6' }} />}
                </button>
              </DetailField>
            )}
            {selected.phone && (
              <DetailField label="Phone">
                <button
                  type="button"
                  onClick={() => copy(selected.phone!, 'phone')}
                  aria-label={`Copy phone ${selected.phone}`}
                  className="flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer">
                  <span style={{ color: INK }}>{selected.phone}</span>
                  {copied === 'phone'
                    ? <Check size={12} className="flex-shrink-0" style={{ color: INK }} />
                    : <Copy size={12} className="flex-shrink-0" style={{ color: '#9aa0a6' }} />}
                </button>
              </DetailField>
            )}
          </DetailSection>

          {/* Lead info */}
          <DetailSection label="Lead" className="flex-1">
            {[
              { label: 'Source',     value: SOURCE_LABEL[selected.source] ?? selected.source },
              { label: 'Department', value: selected.department },
              { label: 'Message',    value: selected.message },
              { label: 'Added',      value: new Date(selected.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' }) },
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
