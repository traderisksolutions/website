'use client'

import { useEffect, useState } from 'react'
import { OwnerPicker } from '@/components/companies/OwnerPicker'
import Link from 'next/link'
import { FileText, FolderOpen, ListChecks, Loader2, MailCheck, MoreHorizontal, Pencil, Pin } from 'lucide-react'
import { AppointmentLetterDialog } from '@/components/letters/AppointmentLetterDialog'
import { Btn, Chip, Field, inputCls, textareaCls } from './primitives'
import { EditCompanyDialog } from './dialogs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { dialogCls } from '@/components/placement/shared'
import type { StaffMember } from '@/lib/crm/staff'
import { STAGES, STAGE_LABEL, type Company, type Stage } from '@/lib/crm/types'
import type { PortfolioCount } from '@/lib/companies/portfolio'

const INK = '#0f1412'
const MUTED = '#4a5550'

/** Strip the money segment: the header names the relationship, the Finance tab carries the figures. */
function withoutMoney(line: string): string {
  return line.split(' · ').filter(p => !/outstanding$/i.test(p.trim())).join(' · ')
}

const ACTION_BTN = 'h-9 px-4 rounded-[10px] text-[14px]'
const MENU_ITEM = 'px-3 py-2 rounded-[8px] text-[13.5px] cursor-pointer text-[#0f1412] focus:bg-[#faf9f6] data-[highlighted]:bg-[#faf9f6]'

/** Name on one line, then stage, owner and domain on one row, then one muted status line. No stat boxes. */
export function CompanyHeader({ company, statusLine, portfolio, draftsCount, onCompany, onStage, onDrafts }: {
  /** Every state the company's policies are in at once: "2 in force · 1 quoting". Null while loading. */
  portfolio?: PortfolioCount[] | null
  company: Company
  statusLine: string
  /** Drafts waiting for approval across the company's placements and policies; null while unknown. */
  draftsCount: number | null
  onCompany: (c: Company) => void
  onStage: (s: Stage) => Promise<void>
  onDrafts: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [addingTodo, setAddingTodo] = useState(false)
  const [letterOpen, setLetterOpen] = useState(false)
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
      const res = await fetch(`/api/companies/${company.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !pinned }) })
      const d = await res.json()
      if (res.ok && d.company) onCompany(d.company)
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
  const [team, setTeam] = useState<{ email: string; name: string }[]>([])
  const [savingOwner, setSavingOwner] = useState(false)
  // The people who can own a company: the team roster. Loaded once; the picker degrades to the
  // current owner alone if the roster is unavailable.
  useEffect(() => {
    fetch('/api/users', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
      const list = Array.isArray(d) ? d : Array.isArray(d?.users) ? d.users : []
      setTeam(list.filter((u: { email?: string; status?: string }) => u.email && u.status !== 'suspended').map((u: { email: string; name?: string }) => ({ email: u.email, name: u.name || u.email.split('@')[0] })))
    }).catch(() => {})
  }, [])
  async function setOwners(list: string[]) {
    setSavingOwner(true)
    try {
      const res = await fetch(`/api/companies/${company.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner_emails: list }) })
      const d = await res.json()
      if (res.ok && d.company) onCompany(d.company)
    } finally { setSavingOwner(false) }
  }

  async function confirm() {
    setConfirming(true)
    try {
      const res = await fetch(`/api/companies/${company.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) })
      const d = await res.json()
      if (res.ok && d.company) onCompany(d.company)
    } finally { setConfirming(false) }
  }

  const status = withoutMoney(statusLine)

  return (
    <div className="mb-8">
      <Link href="/companies" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Contacts</Link>

      {/* The name takes the full width on one line; stage, people, domain, pin and the actions share the row beneath. */}
      <div className="mt-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[28px] sm:text-[30px] font-medium tracking-[-0.02em] leading-[1.15] whitespace-nowrap overflow-hidden text-ellipsis min-w-0" title={company.name} style={{ color: INK }}>{company.name}</h1>

          <div className="mt-3 flex items-center gap-x-3 gap-y-2 flex-wrap text-[14px]" style={{ color: MUTED }}>
            <select
              value={company.stage}
              disabled={changing}
              onChange={async e => { setChanging(true); try { await onStage(e.target.value as Stage) } finally { setChanging(false) } }}
              aria-label="Relationship"
              title="Relationship with the company, set by hand"
              className="h-9 rounded-[7px] border bg-white pl-2.5 pr-7 text-[13.5px] font-medium cursor-pointer outline-none focus:border-[#0f1412] disabled:opacity-50"
              style={{ borderColor: '#d5d9d4', color: INK }}
            >
              {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            {portfolio && portfolio.length > 0 && (
              <span className="inline-flex items-center gap-1.5 flex-wrap" aria-label="Policies by state">
                {portfolio.map(c => <Chip key={c.key} tone={c.tone === 'neutral' ? 'neutral' : c.tone}>{c.count} {c.label}</Chip>)}
              </span>
            )}
            {/* Owners are chosen per company: one or many. Nobody is an owner by default. */}
            <OwnerPicker value={company.owner_emails} staff={team.map(m => ({ ...m, actions: 0 }))} onChange={list => void setOwners(list)} disabled={savingOwner} size="md" />
            {company.domains.length > 0 && <span>{company.domains[0]}</span>}
            {pinsAvailable && (
              <button
                type="button"
                onClick={togglePin}
                disabled={pinning}
                aria-pressed={pinned}
                className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4 text-[13.5px] disabled:opacity-50"
                style={{ color: INK }}
              >
                <Pin size={12} /> {pinning ? 'Saving…' : pinned ? 'Unpin from Home' : 'Pin to Home'}
              </button>
            )}
            {company.confirmed_at === null && (
              <span className="inline-flex items-center gap-2">
                <Chip title="Mail filing created this record from an email domain. Check the name, then confirm it.">Unconfirmed</Chip>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={confirming}
                  className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4 text-[13.5px] disabled:opacity-50"
                  style={{ color: INK }}
                >
                  {confirming ? 'Saving…' : 'Confirm name'}
                </button>
              </span>
            )}
            {/* Two actions at the right of the stage row: drafts (only when some wait, then primary) and a More menu for the rest. Ask AI lives in the chat dock. */}
            <span className="ml-auto inline-flex items-center gap-2">
              {draftsCount !== null && draftsCount > 0 && (
                <Btn level="primary" className={ACTION_BTN} onClick={onDrafts}><MailCheck size={14} /> Drafts to approve ({draftsCount})</Btn>
              )}
              <DropdownMenu modal={false}>
                {/* A plain button: Btn has no forwardRef, and the trigger needs the DOM ref to anchor the menu. */}
                <DropdownMenuTrigger
                  type="button"
                  aria-label="More actions"
                  title="More actions"
                  disabled={opening}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-[7px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f2ee] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: INK }}
                >
                  {opening ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={18} />}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className="w-52 rounded-[12px] border-[#e6e8e4] bg-white p-1.5 shadow-[0_12px_32px_rgba(15,20,18,0.12)]">
                  <DropdownMenuItem className={MENU_ITEM} onSelect={() => setAddingTodo(true)}><ListChecks size={14} /> Add to-do</DropdownMenuItem>
                  <DropdownMenuItem className={MENU_ITEM} onSelect={() => setLetterOpen(true)}><FileText size={14} /> Appointment letter</DropdownMenuItem>
                  <DropdownMenuItem className={MENU_ITEM} onSelect={() => void openDrive()}><FolderOpen size={14} /> Drive</DropdownMenuItem>
                  <DropdownMenuItem className={MENU_ITEM} onSelect={() => setEditing(true)}><Pencil size={14} /> Edit</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
          {status && <p className="m-0 mt-2 text-[14px]" style={{ color: MUTED }}>{status}</p>}
          {driveError && <p className="m-0 mt-2 text-[13px]" style={{ color: '#a1242f' }}>{driveError}</p>}
        </div>
      </div>

      <NewTodoDialog open={addingTodo} onClose={() => setAddingTodo(false)} companyId={company.id} staff={team} />
      <EditCompanyDialog open={editing} onClose={() => setEditing(false)} company={company} onSaved={onCompany} />
      <AppointmentLetterDialog open={letterOpen} onClose={() => setLetterOpen(false)} companyId={company.id} />
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
      const res = await fetch('/api/board/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, title: title.trim(), note: note.trim() || null, dueOn: due || null, primaryAssignee: who || null, status: 'open', priority: 'medium' }),
      })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Could not save.')
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
          <Field label="Title"><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} autoFocus required /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Owner">
              <select className={`${inputCls} appearance-none`} value={who} onChange={e => setWho(e.target.value)}>
                <option value="">No one yet</option>
                {staff.map(s => <option key={s.email} value={s.email}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Due date"><input type="date" className={inputCls} value={due} onChange={e => setDue(e.target.value)} /></Field>
          </div>
          <Field label="Internal note"><textarea className={textareaCls} rows={2} value={note} onChange={e => setNote(e.target.value)} /></Field>
          {error && <p className="m-0 text-[12px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Btn type="button" level="tertiary" onClick={onClose}>Cancel</Btn>
            <Btn type="submit" level="primary" loading={saving}>Create to-do</Btn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
