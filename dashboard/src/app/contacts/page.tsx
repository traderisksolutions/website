'use client'

/**
 * People: every contact on file outside TRS (the contacts table), with the company each belongs to
 * and their threads (GET /api/contacts/people). A row's company opens the company page; its thread
 * count opens the latest thread in the Inbox. Add contact files a person under a company.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { Btn, Empty, Field, Spinner, inputCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { DataTableSearch } from '@/components/data-table/toolbar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CompanyField, type CompanyPick } from '@/components/group-benefits/CompanyField'
import { fmtDate, DASH } from '@/lib/format'
import type { PersonRow } from '@/lib/clients/people'

const MUTED = 'var(--trs-muted)'

function matches(p: PersonRow, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return [p.name, p.email, p.phone, p.title, p.company?.name, p.companyText].some(v => v?.toLowerCase().includes(needle))
}

export default function PeoplePage() {
  const [people, setPeople] = useState<PersonRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/contacts/people', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not load people.')
      setPeople(d.people)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load people.'); setPeople([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => (people ?? []).filter(p => matches(p, search.trim())), [people, search])
  const filed = people?.filter(p => p.company).length ?? 0

  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white text-trs-ink">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 pt-6 pb-20 min-w-0">
        <PageHeader title="People"
          meta={people ? `${people.length} people · ${filed} under a company` : 'Loading…'}
          actions={<>
            <DataTableSearch value={search} onChange={setSearch} placeholder="Search people" className="flex-shrink-0" />
            <Btn level="primary" onClick={() => setAddOpen(true)}>Add contact</Btn>
          </>} />

        {error && <p className="mt-4 mb-0 text-[14px] text-trs-neg" role="alert">{error}</p>}

        <div className="mt-6">
          {!people ? <Spinner label="Loading people…" />
            : shown.length === 0 ? (
              <Empty action={search ? <Btn onClick={() => setSearch('')}>Clear search</Btn> : <Btn level="primary" onClick={() => setAddOpen(true)}>Add contact</Btn>}>
                {search ? `No people match “${search}”.` : 'No contacts on file.'}
              </Empty>
            ) : (
              <Register label="People" minWidth={980}>
                <RegisterHead>
                  <RegisterTh first>Name</RegisterTh><RegisterTh>Title</RegisterTh><RegisterTh>Company</RegisterTh><RegisterTh>Phone</RegisterTh><RegisterTh>Threads</RegisterTh><RegisterTh last>Last email</RegisterTh>
                </RegisterHead>
                <tbody>
                  {shown.map(p => (
                    <RegisterRow key={p.id}>
                      <RegisterCell first identityWidth={260} primary={p.name} secondary={p.email ?? 'No email on file'} title={p.email ?? undefined} />
                      <RegisterCell align="left">{p.title ?? <span className="text-trs-muted">{DASH}</span>}</RegisterCell>
                      <RegisterCell align="left">
                        {p.company
                          ? <Link href={`/companies/${p.company.id}`} className="text-trs-ink no-underline hover:underline">{p.company.name}</Link>
                          : <span className="text-trs-muted">{p.companyText ? `${p.companyText} (not filed)` : 'None'}</span>}
                      </RegisterCell>
                      <RegisterCell className="tabular-nums">{p.phone ?? <span className="text-trs-muted">{DASH}</span>}</RegisterCell>
                      <RegisterCell className="tabular-nums">
                        {p.threads > 0
                          ? <Link href={p.company ? `/companies/${p.company.id}?tab=threads` : `/engagement?thread=${p.latestThreadId}`} className="text-trs-ink underline underline-offset-4">{p.threads}</Link>
                          : <span className="text-trs-muted">0</span>}
                      </RegisterCell>
                      <RegisterCell last className="tabular-nums">
                        {p.latestThreadId ? <Link href={`/engagement?thread=${p.latestThreadId}`} className="text-trs-ink no-underline hover:underline">{fmtDate(p.lastEmailAt)}</Link> : <span className="text-trs-muted">{DASH}</span>}
                      </RegisterCell>
                    </RegisterRow>
                  ))}
                </tbody>
              </Register>
            )}
        </div>
      </div>
      <AddContactDialog open={addOpen} onOpenChange={setAddOpen} onSaved={() => void load()} />
    </div>
  )
}

const EMPTY_PERSON = { first_name: '', last_name: '', email: '', phone: '' }

/** Add one person: name, email or phone, and the company from the shared company field. */
function AddContactDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState(EMPTY_PERSON)
  const [company, setCompany] = useState<CompanyPick>({ id: null, name: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof EMPTY_PERSON, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { if (open) { setForm(EMPTY_PERSON); setCompany({ id: null, name: '' }); setError(null) } }, [open])
  const canSave = form.email.trim() !== '' || form.phone.trim() !== ''

  async function save() {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, company: company.id ? company.name : undefined, company_id: company.id ?? undefined }) })
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not save.'); return }
      onSaved(); onOpenChange(false)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-[20px] font-medium tracking-[-0.01em]">Add contact</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><input className={inputCls} value={form.first_name} onChange={e => set('first_name', e.target.value)} /></Field>
            <Field label="Last name"><input className={inputCls} value={form.last_name} onChange={e => set('last_name', e.target.value)} /></Field>
          </div>
          <Field label="Email"><input className={inputCls} type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
          <Field label="Phone"><input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>
          <CompanyField value={company} onChange={setCompany} allowCreate listId="people-company" />
          {!canSave && <p className="m-0 text-[13px] text-trs-muted">Email or phone required.</p>}
          {error && <p className="m-0 text-[13px] text-trs-neg" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Btn onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn level="primary" onClick={() => void save()} loading={saving} disabled={!canSave}>Add contact</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
