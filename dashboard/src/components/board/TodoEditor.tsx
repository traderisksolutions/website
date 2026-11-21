'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn } from '@/components/crm/primitives'
import { Input } from '@/components/ui/input'
import type { BoardTask } from '@/lib/crm/board'
import type { StaffMember } from '@/lib/crm/staff'
import type { BoardActions } from './actions'
import { daysUntil, isOpen, sortTasks } from './model'

/**
 * The to-do list for one company, editable in place: type a line and press Enter to add;
 * click a to-do to edit its text; set a date and a person on each; tick to complete; × to
 * remove. Every change writes through the board actions (optimistic, realtime).
 */

export function firstNameOf(email: string | null, staff: Map<string, StaffMember>): string | null {
  if (!email) return null
  const n = staff.get(email)?.name ?? email.split('@')[0]
  return n.split(/[\s._-]+/)[0] || n
}

/** One tone per person, chosen by hashing the address so it is stable everywhere. */
const PERSON_TONES = [
  'bg-trs-neg-bg text-trs-neg', 'bg-trs-soft text-trs-green', 'bg-trs-pos-bg text-trs-pos', 'bg-trs-warn-bg text-trs-warn',
  'bg-trs-info-bg text-trs-info', 'bg-trs-mint text-trs-green-2', 'bg-trs-canvas text-trs-ink-2', 'bg-trs-field text-trs-muted',
]
function personTone(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return PERSON_TONES[h % PERSON_TONES.length]
}
export function PersonTag({ email, staff, size = 'sm' }: { email: string; staff: Map<string, StaffMember>; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded whitespace-nowrap text-small', size === 'sm' ? 'h-5 px-1.5' : 'h-6 px-2', personTone(email))} title={staff.get(email)?.name ?? email}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />{firstNameOf(email, staff)}
    </span>
  )
}

export function dueLabel(iso: string, today: string): string {
  const d = daysUntil(iso, today)!
  const [y, m, dd] = iso.slice(0, 10).split('-').map(Number)
  const nice = new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d < 0) return `${nice} · ${-d}d late`
  return `${nice} · ${d}d`
}

export function TodoEditor({ companyId, tasks, today, staff, staffList, me, actions }: {
  companyId: string
  tasks: BoardTask[]
  today: string
  staff: Map<string, StaffMember>
  staffList: StaffMember[]
  me: string | null
  actions: BoardActions
}) {
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const open = sortTasks(tasks.filter(isOpen), today)
  const done = tasks.filter(t => !isOpen(t))

  async function add() {
    const title = text.trim()
    if (!title) return
    setErr(null)
    const t = await actions.addTask(companyId, { title, status: 'open', priority: 'medium', primaryAssignee: me ?? null, dueOn: null })
    if (t) setText(''); else setErr('Could not save. The to-do table may not exist yet.')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input value={text} onChange={e => setText(e.target.value)} placeholder="Add a to-do and press Enter" aria-label="New to-do"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
          className="h-9 flex-1 min-w-0 px-3.5" />
        <Btn level="primary" onClick={() => void add()} aria-label="Add to-do" className="h-9 w-9 px-0"><Plus size={16} /></Btn>
      </div>
      {err && <p className="m-0 text-body text-trs-muted">{err}</p>}

      {open.length === 0 && !err && <p className="m-0 text-body text-trs-muted">No to-dos. Add one above.</p>}

      <ul className="m-0 p-0 list-none flex flex-col">
        {open.map(t => <TodoRow key={t.id} t={t} today={today} staff={staff} staffList={staffList} actions={actions} />)}
      </ul>

      {done.length > 0 && (
        <details className="text-body text-trs-muted">
          <summary className="cursor-pointer">{done.length} completed</summary>
          <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-1">
            {done.map(t => (
              <li key={t.id} className="flex items-center gap-2 text-body line-through text-trs-muted">
                <Btn level="tertiary" onClick={() => actions.updateTask(t.id, { status: 'open' })} title="Reopen" className="w-4 h-4 p-0 rounded border-0 text-white bg-trs-muted hover:bg-trs-muted hover:text-white"><Check size={11} strokeWidth={3} /></Btn>
                <span className="truncate">{t.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function TodoRow({ t, today, staff, staffList, actions }: { t: BoardTask; today: string; staff: Map<string, StaffMember>; staffList: StaffMember[]; actions: BoardActions }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(t.title)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.select() }, [editing])
  function commit() {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== t.title) void actions.updateTask(t.id, { title: v }); else setDraft(t.title)
  }
  const late = t.due_on ? (daysUntil(t.due_on, today) ?? 0) < 0 : false
  return (
    <li className="group flex items-start gap-2.5 py-3 border-b border-trs-line">
      <Btn level="tertiary" onClick={() => actions.updateTask(t.id, { status: 'complete' })} aria-label={`Complete: ${t.title}`}
        className="mt-[3px] w-4 h-4 p-0 rounded border border-trs-subtle bg-white flex-shrink-0 text-transparent hover:bg-white hover:text-trs-ink">
        <Check size={11} strokeWidth={3} />
      </Btn>
      <div className="min-w-0 flex-1">
        {editing
          ? <Input ref={ref} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(t.title); setEditing(false) } }}
              aria-label="To-do text" className="h-8 px-2 py-0 border-trs-ink" />
          : <Btn level="tertiary" onClick={() => setEditing(true)} title="Click to edit" className="w-full h-auto justify-start text-left p-0 border-0 font-normal whitespace-normal cursor-text text-body leading-snug text-trs-ink hover:bg-transparent hover:text-trs-ink">{t.title}</Btn>}
        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-small text-trs-muted">
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <span className={cn(late ? 'font-medium text-trs-ink' : 'text-trs-muted')}>{t.due_on ? dueLabel(t.due_on, today) : 'No date'}</span>
            <Input type="date" value={t.due_on ?? ''} onChange={e => actions.updateTask(t.id, { dueOn: e.target.value || null })} aria-label="Due date" className="h-5 w-[112px] rounded px-1 py-0 text-small cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity border-trs-line text-trs-muted" />
          </label>
          <select value={t.primary_assignee ?? ''} onChange={e => actions.updateTask(t.id, { primaryAssignee: e.target.value || null })} aria-label="Person" className="h-5 max-w-[130px] rounded border border-trs-line bg-white px-1 text-small cursor-pointer text-trs-muted">
            <option value="">No one</option>
            {staffList.map(s => <option key={s.email} value={s.email}>{s.name.split(/\s+/)[0]}</option>)}
          </select>
          {t.primary_assignee && <PersonTag email={t.primary_assignee} staff={staff} />}
        </div>
      </div>
      <Btn level="tertiary" size="xs" onClick={() => actions.deleteTask(t.id)} aria-label={`Remove: ${t.title}`} className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 px-0 rounded-full border-0 hover:bg-trs-field"><X size={13} /></Btn>
    </li>
  )
}
