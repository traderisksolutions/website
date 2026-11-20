'use client'

import { useEffect, useState } from 'react'
import { OwnerPicker } from '@/components/companies/OwnerPicker'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { FolderOpen, ListChecks, Loader2, MoreHorizontal, Pencil, Pin } from 'lucide-react'
import { Btn, Chip, Field, btnClass, inputCls, textareaCls } from './primitives'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { fmtDate, num } from '@/lib/format'
import type { CompanyFacts } from '@/lib/companies/facts'
import { EditCompanyDialog } from './dialogs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { dialogCls } from '@/components/placement/shared'
import { STAGES, STAGE_LABEL, type Company, type Stage } from '@/lib/crm/types'
import { unwrap } from '@/lib/action-result'
import { addBoardTask, updateCompany } from '@/app/companies/actions'

/** Strip the money segment: the header names the relationship, the Finance tab carries the figures. */
function withoutMoney(line: string): string {
  return line.split(' · ').filter(p => !/outstanding$/i.test(p.trim())).join(' · ')
}

const MENU_ITEM = 'px-3 py-2 rounded text-body cursor-pointer text-trs-ink focus:bg-trs-tint data-[highlighted]:bg-trs-tint'

/**
 * The Workbench header: name, one facts line (UEN, business, relationship, owner, policies, premium),
 * Edit, More and New request, the one primary. Drafts to approve and the appointment letter live in
 * the rail only (20 Nov 2026).
 */
export function CompanyHeader({ company, statusLine, facts, team, onCompany, onStage, onNewRequest }: {
  /** Policies held, premium, client since; null while the policies load. */
  facts: CompanyFacts | null
  company: Company
  statusLine: string
  /** The people who can own a company: the sign-in roster, read with the page. Empty when it failed; the picker then shows the current owner alone. */
  team: { email: string; name: string }[]
  onCompany: (c: Company) => void
  onStage: (s: Stage) => Promise<void>
  onNewRequest: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [addingTodo, setAddingTodo] = useState(false)
  const [changing, setChanging] = useState(false)
  const [opening, setOpening] = useState(false)
  const [driveError, setDriveError] = useState<string | null>(null)
  const [pinning, setPinning] = useState(false)

  // Pinned to Home, or not. The column may not exist yet; then the control stays hidden.
  const pinsAvailable = company.home_pinned_at !== undefined
  const pinned = !!company.home_pinned_at
  async function togglePin() {
    setPinning(true)
    try {
      const r = await updateCompany(company.id, { pinned: !pinned })
      if (r.ok) onCompany(r.data.company)
    } finally { setPinning(false) }
  }

  /** The company's one Drive folder (debit notes, employment benefits, every document). Created on first open. */
  async function openDrive() {
    // Opened before the request so the browser does not treat the new tab as a pop-up.
    const tab = window.open('', '_blank')
    setOpening(true); setDriveError(null)
    try {
      const res = await fetch(`/api/companies/${company.id}/drive`, { method: 'POST' })
      const d = await res.json().catch(() => ({})) as { url?: string; error?: string }
      if (!res.ok || !d.url) { tab?.close(); setDriveError(d.error ?? `Drive folder failed (${res.status})`); return }
      if (tab) tab.location.href = d.url; else window.location.href = d.url
    } catch (e) {
      tab?.close(); setDriveError(e instanceof Error ? e.message : 'Drive folder failed')
    } finally { setOpening(false) }
  }
  const [confirming, setConfirming] = useState(false)
  const [savingOwner, setSavingOwner] = useState(false)
  async function setOwners(list: string[]) {
    setSavingOwner(true)
    try {
      const r = await updateCompany(company.id, { owner_emails: list })
      if (r.ok) onCompany(r.data.company)
    } finally { setSavingOwner(false) }
  }

  async function confirm() {
    setConfirming(true)
    try {
      const r = await updateCompany(company.id, { confirmed: true })
      if (r.ok) onCompany(r.data.company)
    } finally { setConfirming(false) }
  }

  const status = withoutMoney(statusLine)
  const fact = (label: string, value: React.ReactNode) => <span className="inline-flex items-center gap-1.5"><span className="text-trs-muted">{label}</span><span className="text-trs-ink">{value}</span></span>

  return (
    <div>
      <Breadcrumbs current={{ label: company.name, href: `/companies/${company.id}` }} fallback={{ label: 'Companies', href: '/companies' }} />
      <PageHeader className="mt-3" title={<span className="block max-w-full truncate" title={company.name}>{company.name}</span>}
        meta={<span className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body">
          {company.uen && fact('UEN', company.uen)}
          {company.industry && fact('Business', company.industry)}
          {fact('Relationship', <select value={company.stage} disabled={changing} aria-label="Relationship" title="Relationship with the company, set by hand"
            onChange={async e => { setChanging(true); try { await onStage(e.target.value as Stage) } finally { setChanging(false) } }}
            className="h-7 w-auto rounded border border-trs-line-2 bg-white pl-2 pr-6 text-body text-trs-ink cursor-pointer outline-none focus:border-trs-ink disabled:opacity-50">
            {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>)}
          {fact('Owner', <OwnerPicker value={company.owner_emails} staff={team.map(m => ({ ...m, actions: 0 }))} onChange={list => void setOwners(list)} disabled={savingOwner} size="sm" />)}
          {facts?.clientSince && fact('Client since', fmtDate(facts.clientSince))}
          {facts && fact('Policies', facts.held)}
          {facts && fact('Annual premium', facts.annualPremium != null ? `S$${num(facts.annualPremium, 0)}` : '—')}
          {company.domains.length > 0 && fact('Domain', company.domains[0])}
          {company.confirmed_at === null && (
            <span className="inline-flex items-center gap-2">
              <Chip title="Mail filing created this record from an email domain. Check the name, then confirm it.">Unconfirmed</Chip>
              <Btn level="tertiary" size="xs" onClick={confirm} disabled={confirming} className="h-auto bg-transparent hover:bg-transparent border-0 p-0 font-normal underline underline-offset-4 text-body text-trs-ink hover:text-trs-ink disabled:opacity-50">{confirming ? 'Saving…' : 'Confirm name'}</Btn>
            </span>
          )}
        </span>}
        actions={<>
          <Btn onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Btn>
          <DropdownMenu modal={false}>
            {/* A plain button: Btn has no forwardRef, and the trigger needs the DOM ref to anchor the menu. */}
            <DropdownMenuTrigger type="button" aria-label="More actions" title="More actions" disabled={opening}
              className={cn(btnClass('secondary', 'sm'), 'w-10 px-0')}>
              {opening ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={18} />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-52 rounded border-trs-line bg-white p-1.5 shadow-[0_12px_32px_rgba(15,20,18,0.12)]">
              <DropdownMenuItem className={MENU_ITEM} onSelect={() => setAddingTodo(true)}><ListChecks size={14} /> Add to-do</DropdownMenuItem>
              <DropdownMenuItem className={MENU_ITEM} onSelect={() => void openDrive()}><FolderOpen size={14} /> Drive</DropdownMenuItem>
              {pinsAvailable && <DropdownMenuItem className={MENU_ITEM} disabled={pinning} onSelect={() => void togglePin()}><Pin size={14} /> {pinned ? 'Unpin from Home' : 'Pin to Home'}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          <Btn level="primary" onClick={onNewRequest}>New request</Btn>
        </>} />
      {status && <p className="m-0 mt-2 text-body text-trs-muted">{status}</p>}
      {driveError && <p className="m-0 mt-2 text-body text-trs-neg">{driveError}</p>}

      <NewTodoDialog open={addingTodo} onClose={() => setAddingTodo(false)} companyId={company.id} staff={team} />
      <EditCompanyDialog open={editing} onClose={() => setEditing(false)} company={company} onSaved={onCompany} />
    </div>
  )
}

/** A to-do for this company on the board: title, owner, due date, note. */
function NewTodoDialog({ open, onClose, companyId, staff }: { open: boolean; onClose: () => void; companyId: string; staff: { email: string; name: string }[] }) {
  const [title, setTitle] = useState('')
  const [who, setWho] = useState('')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(''); setWho(''); setDue(''); setNote(''); setError(null)
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Give the to-do a title.'); return }
    setSaving(true); setError(null)
    try {
      unwrap(await addBoardTask({ companyId, title: title.trim(), note: note.trim() || null, dueOn: due || null, primaryAssignee: who || null, status: 'open', priority: 'medium' }))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className={dialogCls}>
        <DialogHeader>
          <DialogTitle>New to-do</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} autoFocus required /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Owner">
              <select className={`${inputCls} appearance-none`} value={who} onChange={e => setWho(e.target.value)}>
                <option value="">No one yet</option>
                {staff.map(s => <option key={s.email} value={s.email}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Due date"><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
          </div>
          <Field label="Internal note"><textarea className={textareaCls} rows={2} value={note} onChange={e => setNote(e.target.value)} /></Field>
          {error && <p className="m-0 text-small text-trs-neg" role="alert">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Btn type="button" level="tertiary" onClick={onClose}>Cancel</Btn>
            <Btn type="submit" level="primary" loading={saving}>Create to-do</Btn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
