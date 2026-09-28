'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2, Search, Plus, X, Loader2, Mail, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/**
 * The company + recipient picker used by "Generate Debit Note", the PDF bulk-import review queue
 * and the Pricing Matrix quote wizard: search/select an existing company → pick one of its linked
 * emails, or "+ add new email" (auto-saves immediately) → or, if no company matches,
 * "+ create company" then the same add-email step. Every write happens as soon as the user
 * confirms it — there's no separate "save" step at the parent form level for this part.
 */

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

export type CompanyContact = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }
export type CompanySuggestion = { id: string; name: string; address: string | null; type: string | null }

export type PickerValue = {
  companyId:    string
  companyName:  string
  contactId:    string | null
  contactEmail: string | null
  contactName:  string | null
}

function contactLabel(c: CompanyContact) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  return name ? `${name} <${c.email}>` : (c.email ?? c.phone ?? 'Unknown')
}

export function CompanyContactPicker({ value, onChange, className, hideContact, initialQuery }: {
  value: PickerValue | null
  onChange: (v: PickerValue | null) => void
  className?: string
  /** Skip the recipient/email half entirely — for callers (e.g. the Pricing Matrix quote wizard)
   *  that only need companyId/companyName and have no use for a contact selection. */
  hideContact?: boolean
  /** Pre-fills the search box unpicked (e.g. a legacy quote's stored company_name with no linked
   *  company_id yet) — makes re-linking a one-click "Create/search" instead of retyping the name. */
  initialQuery?: string
}) {
  const [query,       setQuery]       = useState(initialQuery ?? '')
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([])
  const [open,        setOpen]        = useState(false)
  const [searching,   setSearching]   = useState(false)
  const [creating,    setCreating]    = useState(false)
  const [contacts,    setContacts]    = useState<CompanyContact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName,  setNewName]  = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [savingContact, setSavingContact] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounced company search.
  useEffect(() => {
    if (value) return
    const q = query.trim()
    const t = setTimeout(() => {
      setSearching(true)
      fetch(`/api/companies?search=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : [])
        .then((rows: CompanySuggestion[]) => setSuggestions(Array.isArray(rows) ? rows : []))
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query, value])

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Once a company is picked, load its linked contacts for the recipient dropdown.
  useEffect(() => {
    if (!value?.companyId || hideContact) { setContacts([]); return }
    setLoadingContacts(true)
    fetch(`/api/companies/${value.companyId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setContacts(d?.contacts?.map((cc: { contacts: CompanyContact }) => cc.contacts).filter(Boolean) ?? []))
      .catch(() => setContacts([]))
      .finally(() => setLoadingContacts(false))
  }, [value?.companyId])

  async function pickCompany(c: CompanySuggestion) {
    setOpen(false); setQuery('')
    onChange({ companyId: c.id, companyName: c.name, contactId: null, contactEmail: null, contactName: null })
  }

  async function createCompany() {
    const name = query.trim()
    if (!name) return
    setCreating(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create company')
      setOpen(false); setQuery('')
      if (data.matchedExisting) setNotice(`Matched an existing company: "${data.name}". Not a duplicate.`)
      onChange({ companyId: data.id, companyName: data.name, contactId: null, contactEmail: null, contactName: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create company')
    } finally { setCreating(false) }
  }

  function pickContact(c: CompanyContact) {
    if (!value) return
    onChange({ ...value, contactId: c.id, contactEmail: c.email, contactName: [c.first_name, c.last_name].filter(Boolean).join(' ') || null })
    setAddingContact(false)
  }

  async function saveNewContact() {
    if (!value || !newEmail.trim()) return
    setSavingContact(true); setError(null)
    try {
      const res = await fetch(`/api/companies/${value.companyId}/contacts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || undefined, phone: newPhone.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save contact')
      const c: CompanyContact = data.contact
      setContacts(prev => prev.some(p => p.id === c.id) ? prev : [...prev, c])
      pickContact(c)
      setNewEmail(''); setNewName(''); setNewPhone('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save contact')
    } finally { setSavingContact(false) }
  }

  function clearCompany() {
    onChange(null); setContacts([]); setAddingContact(false); setNotice(null)
  }

  const inp = 'w-full h-10 rounded-[10px] border border-[#dadce0] bg-white px-3.5 text-[14px] text-[#202124] outline-none focus:border-[#202124] placeholder:text-[#80868b]'
  const row = 'w-full text-left px-4 py-2.5 bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa] flex items-center gap-2.5 text-[14px] disabled:opacity-60'

  return (
    <div className={cn('flex flex-col gap-3', className)} style={{ color: INK }}>
      {/* ── Company ── */}
      {!value ? (
        <div ref={boxRef} className="relative">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#9aa0a6' }} />
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              placeholder="Search company name"
              aria-label="Company"
              className="w-full h-12 rounded-[12px] border border-[#dadce0] bg-white pl-10 pr-4 text-[15px] outline-none focus:border-[#202124] placeholder:text-[#80868b]"
              style={{ color: INK }}
            />
          </div>
          {open && (query.trim().length > 0 || suggestions.length > 0) && (
            <div className="absolute z-20 mt-1.5 w-full rounded-[14px] bg-white max-h-64 overflow-y-auto py-1" style={{ border: `1px solid ${RULE}`, boxShadow: '0 8px 24px rgba(32,33,36,0.08)' }}>
              {searching && <div className="px-4 py-2.5 text-[13px] flex items-center gap-1.5" style={{ color: MUTED }}><Loader2 size={12} className="animate-spin" /> Searching…</div>}
              {!searching && suggestions.map(c => (
                <button key={c.id} type="button" onClick={() => pickCompany(c)} className={row} style={{ color: INK }}>
                  <Building2 size={14} className="flex-shrink-0" style={{ color: '#9aa0a6' }} />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
              {!searching && query.trim().length > 0 && (
                <button type="button" onClick={createCompany} disabled={creating} className={cn(row, 'font-medium')} style={{ color: INK, borderTop: `1px solid ${RULE}` }}>
                  {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Create company &ldquo;{query.trim()}&rdquo;
                </button>
              )}
              {!searching && !query.trim() && suggestions.length === 0 && (
                <div className="px-4 py-2.5 text-[13px]" style={{ color: MUTED }}>Type to search companies</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 h-12 rounded-[12px] px-4" style={{ background: '#f1f3f4' }}>
          <Building2 size={14} className="flex-shrink-0" style={{ color: MUTED }} />
          <span className="text-[15px] font-medium flex-1 truncate" style={{ color: INK }}>{value.companyName}</span>
          <button type="button" onClick={clearCompany} aria-label="Change company" title="Change company" className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#e8eaed]" style={{ color: MUTED }}><X size={14} /></button>
        </div>
      )}

      {/* ── Contact / recipient ── */}
      {!hideContact && value && (
        <div>
          {value.contactId && !addingContact ? (
            <div className="flex items-center gap-2.5 h-10 rounded-[10px] px-3.5" style={{ border: '1px solid #dadce0' }}>
              <Mail size={14} className="flex-shrink-0" style={{ color: MUTED }} />
              <span className="text-[14px] flex-1 truncate">{value.contactName ? `${value.contactName} <${value.contactEmail}>` : value.contactEmail}</span>
              <button type="button" onClick={() => onChange({ ...value, contactId: null, contactEmail: null, contactName: null })} aria-label="Change recipient" title="Change recipient" className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><Pencil size={12} /></button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {loadingContacts && <p className="m-0 text-[13px] flex items-center gap-1.5" style={{ color: MUTED }}><Loader2 size={12} className="animate-spin" /> Loading contacts…</p>}
              {!loadingContacts && contacts.length > 0 && !addingContact && (
                <div className="flex flex-col rounded-[12px] overflow-hidden" style={{ border: `1px solid ${RULE}` }}>
                  {contacts.map(c => (
                    <button key={c.id} type="button" onClick={() => pickContact(c)} className={cn(row, 'py-2.5')} style={{ color: INK, borderBottom: `1px solid ${RULE}` }}>
                      <Mail size={13} className="flex-shrink-0" style={{ color: '#9aa0a6' }} />
                      <span className="truncate">{contactLabel(c)}</span>
                    </button>
                  ))}
                </div>
              )}
              {!addingContact ? (
                <button type="button" onClick={() => setAddingContact(true)} className="self-start inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[13.5px] font-medium bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: INK }}>
                  <Plus size={12} /> Add email
                </button>
              ) : (
                <div className="flex flex-col gap-3 rounded-[16px] p-4" style={{ background: '#f1f3f4' }}>
                  <Field label="Email (required)"><input value={newEmail} onChange={e => setNewEmail(e.target.value)} className={inp} /></Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Name (optional)"><input value={newName} onChange={e => setNewName(e.target.value)} className={inp} /></Field>
                    <Field label="Phone (optional)"><input value={newPhone} onChange={e => setNewPhone(e.target.value)} className={inp} /></Field>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    {contacts.length > 0 && <Button variant="ghost" size="sm" onClick={() => setAddingContact(false)}>Cancel</Button>}
                    <Button size="sm" onClick={saveNewContact} disabled={savingContact || !newEmail.trim()}>
                      {savingContact ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Save and use
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {notice && <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{notice}</p>}
      {error && <p role="alert" className="m-0 text-[12.5px]" style={{ color: '#3c4043' }}>{error}</p>}
    </div>
  )
}
