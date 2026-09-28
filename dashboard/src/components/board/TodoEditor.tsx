'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BoardTask } from '@/lib/crm/board'
import type { StaffMember } from '@/lib/crm/staff'
import type { BoardActions } from './actions'
import { daysUntil, isOpen, sortTasks } from './model'

/**
 * The to-do list for one company, editable in place: type a line and press Enter to add;
 * click a to-do to edit its text; set a date and a person on each; tick to complete; × to
 * remove. Every change writes through the board actions (optimistic, realtime).
 */

const RULE = '#e8eaed'
const INK = '#202124'
const MUTED = '#5f6368'

export function firstNameOf(email: string | null, staff: Map<string, StaffMember>): string | null {
  if (!email) return null
  const n = staff.get(email)?.name ?? email.split('@')[0]
  return n.split(/[\s._-]+/)[0] || n
}

/** One hue per person, chosen by hashing the address so it is stable everywhere. */
const HUES = ['#c5221f', '#1a73e8', '#188038', '#e37400', '#7b1fa2', '#00838f', '#ad1457', '#5f6368']
export function personHue(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}
export function PersonTag({ email, staff, size = 'sm' }: { email: string; staff: Map<string, StaffMember>; size?: 'sm' | 'md' }) {
  const hue = personHue(email)
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-[6px] font-medium whitespace-nowrap', size === 'sm' ? 'h-[20px] px-1.5 text-[11px]' : 'h-[24px] px-2 text-[12.5px]')} style={{ background: hue + '1a', color: hue }} title={staff.get(email)?.name ?? email}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: hue }} aria-hidden />{firstNameOf(email, staff)}
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
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a to-do and press Enter" aria-label="New to-do"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
          className="h-10 flex-1 min-w-0 rounded-[10px] border bg-white px-3.5 text-[14px] outline-none focus:border-[#202124]" style={{ borderColor: '#dadce0', color: INK }} />
        <button type="button" onClick={() => void add()} aria-label="Add to-do" className="h-10 w-10 rounded-[10px] text-white border-0 cursor-pointer inline-flex items-center justify-center" style={{ background: INK }}><Plus size={16} /></button>
      </div>
      {err && <p className="m-0 text-[13px]" style={{ color: MUTED }}>{err}</p>}

      {open.length === 0 && !err && <p className="m-0 text-[13.5px]" style={{ color: MUTED }}>No to-dos. Add one above.</p>}

      <ul className="m-0 p-0 list-none flex flex-col">
        {open.map(t => <TodoRow key={t.id} t={t} today={today} staff={staff} staffList={staffList} actions={actions} />)}
      </ul>

      {done.length > 0 && (
        <details className="text-[13px]" style={{ color: MUTED }}>
          <summary className="cursor-pointer">{done.length} completed</summary>
          <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-1">
            {done.map(t => (
              <li key={t.id} className="flex items-center gap-2 text-[13.5px] line-through" style={{ color: MUTED }}>
                <button type="button" onClick={() => actions.updateTask(t.id, { status: 'open' })} title="Reopen" className="w-[16px] h-[16px] rounded-[3px] border-0 inline-flex items-center justify-center cursor-pointer text-white" style={{ background: '#5f6368' }}><Check size={11} strokeWidth={3} /></button>
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
    <li className="group flex items-start gap-2.5 py-3" style={{ borderBottom: `1px solid ${RULE}` }}>
      <button type="button" onClick={() => actions.updateTask(t.id, { status: 'complete' })} aria-label={`Complete: ${t.title}`}
        className="mt-[3px] w-[16px] h-[16px] rounded-[3px] border bg-white flex-shrink-0 inline-flex items-center justify-center cursor-pointer p-0 text-transparent hover:text-[#202124]" style={{ borderColor: '#9aa0a6' }}>
        <Check size={11} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        {editing
          ? <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(t.title); setEditing(false) } }}
              aria-label="To-do text" className="w-full h-7 rounded-[6px] border px-2 text-[14px] outline-none" style={{ borderColor: '#202124', color: INK }} />
          : <button type="button" onClick={() => setEditing(true)} title="Click to edit" className="w-full text-left bg-transparent border-0 p-0 cursor-text text-[14px] leading-snug" style={{ color: INK }}>{t.title}</button>}
        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[12px]" style={{ color: MUTED }}>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <span className={cn(late && 'font-medium')} style={{ color: late ? INK : MUTED }}>{t.due_on ? dueLabel(t.due_on, today) : 'No date'}</span>
            <input type="date" value={t.due_on ?? ''} onChange={e => actions.updateTask(t.id, { dueOn: e.target.value || null })} aria-label="Due date" className="h-[20px] w-[112px] rounded-[4px] border bg-white px-1 text-[11.5px] cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" style={{ borderColor: RULE, color: MUTED }} />
          </label>
          <select value={t.primary_assignee ?? ''} onChange={e => actions.updateTask(t.id, { primaryAssignee: e.target.value || null })} aria-label="Person" className="h-[20px] max-w-[130px] rounded-[4px] border bg-white px-1 text-[11.5px] cursor-pointer" style={{ borderColor: RULE, color: MUTED }}>
            <option value="">No one</option>
            {staffList.map(s => <option key={s.email} value={s.email}>{s.name.split(/\s+/)[0]}</option>)}
          </select>
          {t.primary_assignee && <PersonTag email={t.primary_assignee} staff={staff} />}
        </div>
      </div>
      <button type="button" onClick={() => actions.deleteTask(t.id)} aria-label={`Remove: ${t.title}`} className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={13} /></button>
    </li>
  )
}
