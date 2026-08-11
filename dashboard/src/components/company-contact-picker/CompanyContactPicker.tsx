'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2, Search, Plus, X, Loader2, Mail, Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/**
 * The seamless company + recipient picker used by both "Generate Debit Note" and the PDF
 * bulk-import review queue: search/select an existing company → pick one of its linked
 * emails, or "+ add new email" (auto-saves immediately) → or, if no company matches,
 * "+ create company" then the same add-email step. Every write happens as soon as the user
 * confirms it — there's no separate "save" step at the parent form level for this part.
 */

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
      if (data.matchedExisting) setNotice(`Matched an existing company: "${data.name}" — not a duplicate.`)
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

  const inp = 'text-[12.5px] border border-[--border-subtle] rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 w-full'

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {/* ── Company ── */}
      {!value ? (
        <div ref={boxRef} className="relative">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              placeholder="Search company name…"
              className="pl-8 h-9 text-[12.5px]"
            />
          </div>
          {open && (query.trim().length > 0 || suggestions.length > 0) && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-[--border-subtle] bg-card shadow-lg max-h-64 overflow-y-auto">
              {searching && <div className="px-3 py-2 text-[11.5px] text-muted-foreground flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Searching…</div>}
              {!searching && suggestions.map(c => (
                <button key={c.id} onClick={() => pickCompany(c)} className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-[12.5px]">
                  <Building2 size={13} className="text-muted-foreground/60 flex-shrink-0" />
                  <span className="truncate uppercase">{c.name}</span>
                </button>
              ))}
              {!searching && query.trim().length > 0 && (
                <button onClick={createCompany} disabled={creating} className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-[12.5px] font-semibold text-primary border-t border-[--border-subtle]">
                  {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Create company &ldquo;{query.trim()}&rdquo;
                </button>
              )}
              {!searching && !query.trim() && suggestions.length === 0 && (
                <div className="px-3 py-2 text-[11.5px] text-muted-foreground">Start typing to search companies…</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-[--border-subtle] px-2.5 py-1.5 bg-muted/30">
          <Building2 size={13} className="text-muted-foreground/60 flex-shrink-0" />
          <span className="text-[12.5px] font-medium flex-1 truncate uppercase">{value.companyName}</span>
          <button onClick={clearCompany} className="text-muted-foreground/60 hover:text-foreground" title="Change company"><X size={13} /></button>
        </div>
      )}

      {/* ── Contact / recipient ── */}
      {!hideContact && value && (
        <div className="pl-1">
          {value.contactId && !addingContact ? (
            <div className="flex items-center gap-2 rounded-md border border-[--border-subtle] px-2.5 py-1.5">
              <Mail size={13} className="text-muted-foreground/60 flex-shrink-0" />
              <span className="text-[12.5px] flex-1 truncate">{value.contactName ? `${value.contactName} <${value.contactEmail}>` : value.contactEmail}</span>
              <button onClick={() => setAddingContact(false)} className="text-emerald-600"><Check size={13} /></button>
              <button onClick={() => onChange({ ...value, contactId: null, contactEmail: null, contactName: null })} className="text-muted-foreground/60 hover:text-foreground" title="Change recipient"><Pencil size={12} /></button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {loadingContacts && <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Loading contacts…</p>}
              {!loadingContacts && contacts.length > 0 && !addingContact && (
                <div className="flex flex-col gap-1">
                  {contacts.map(c => (
                    <button key={c.id} onClick={() => pickContact(c)} className="text-left px-2.5 py-1.5 rounded-md border border-[--border-subtle] hover:bg-accent text-[12.5px] flex items-center gap-2">
                      <Mail size={12} className="text-muted-foreground/50 flex-shrink-0" />
                      <span className="truncate">{contactLabel(c)}</span>
                    </button>
                  ))}
                </div>
              )}
              {!addingContact ? (
                <button onClick={() => setAddingContact(true)} className="self-start flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline">
                  <Plus size={11} /> Add new email
                </button>
              ) : (
                <div className="flex flex-col gap-1.5 rounded-md border border-[--border-subtle] p-2.5 bg-muted/20">
                  <Field label="Email (required)"><input value={newEmail} onChange={e => setNewEmail(e.target.value)} className={inp} /></Field>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Field label="Name (optional)"><input value={newName} onChange={e => setNewName(e.target.value)} className={inp} /></Field>
                    <Field label="Phone (optional)"><input value={newPhone} onChange={e => setNewPhone(e.target.value)} className={inp} /></Field>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    {contacts.length > 0 && <Button variant="ghost" size="xs" onClick={() => setAddingContact(false)}>Cancel</Button>}
                    <Button size="xs" onClick={saveNewContact} disabled={savingContact || !newEmail.trim()}>
                      {savingContact ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Save &amp; use
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {notice && <p className="text-[11px] text-muted-foreground">{notice}</p>}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  )
}
