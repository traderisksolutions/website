'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, X, Sparkles, Plus, Mail, CalendarClock, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, Btn, Chip, Empty, Field, inputCls } from './primitives'
import { fmtDate, todaySGT } from '@/lib/crm/format'
import { ACTION_KINDS, ACTION_KIND_LABEL, type CompanyAction, type ActionKind, type ActionPriority } from '@/lib/crm/types'

const PRIORITY_TONE: Record<ActionPriority, 'red' | 'amber' | 'neutral'> = { high: 'red', medium: 'amber', low: 'neutral' }

export function ActionsPanel({ companyId, actions, onChange, compact }: {
  companyId: string
  actions: CompanyAction[]
  onChange: (next: CompanyAction[]) => void
  compact?: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{ title: string; kind: ActionKind; priority: ActionPriority; due_date: string; detail: string }>({ title: '', kind: 'general', priority: 'medium', due_date: '', detail: '' })

  const proposed = actions.filter(a => a.status === 'proposed')
  const open = actions.filter(a => a.status === 'open')
  const today = todaySGT()

  async function patch(a: CompanyAction, body: Partial<CompanyAction>) {
    setBusy(a.id); setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/actions/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not update.')
      const next = d.action as CompanyAction
      onChange(next.status === 'done' || next.status === 'dismissed' ? actions.filter(x => x.id !== a.id) : actions.map(x => x.id === a.id ? next : x))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(null) }
  }

  async function extract() {
    setExtracting(true); setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/actions/extract`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'No actions were proposed.')
      onChange([...(d.created as CompanyAction[]), ...actions])
      if ((d.created as CompanyAction[]).length === 0) setError('Nothing new to propose — everything the agent found is already listed.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setExtracting(false) }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setBusy('new'); setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, due_date: form.due_date || null }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not add.')
      onChange([d.action as CompanyAction, ...actions])
      setForm({ title: '', kind: 'general', priority: 'medium', due_date: '', detail: '' })
      setShowForm(false)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(null) }
  }

  const header = (
    <>
      <Btn size="xs" level="tertiary" onClick={() => setShowForm(s => !s)}><Plus size={12} /> Add</Btn>
      <Btn size="xs" level={actions.length === 0 ? 'primary' : 'secondary'} onClick={extract} loading={extracting}><Sparkles size={12} /> Find next actions</Btn>
    </>
  )

  return (
    <SectionCard title="Next actions" description={compact ? undefined : 'Requests and follow-ups for this company. Proposals from the agent need your OK.'} actions={header} padded={false}>
      {error && <p className="text-[12px] text-destructive px-4 pt-3 m-0">{error}</p>}

      {showForm && (
        <form onSubmit={add} className="px-4 py-3 border-b border-[--border-subtle] grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
          <Field label="What needs doing"><input autoFocus className={inputCls} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Chase QBE for the WICA quote" required /></Field>
          <Field label="Type"><select className={inputCls} value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as ActionKind }))}>{ACTION_KINDS.map(k => <option key={k} value={k}>{ACTION_KIND_LABEL[k]}</option>)}</select></Field>
          <Field label="Priority"><select className={inputCls} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as ActionPriority }))}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
          <Field label="Due"><input type="date" className={inputCls} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></Field>
          <div className="sm:col-span-4 flex justify-end gap-2"><Btn type="button" level="tertiary" size="xs" onClick={() => setShowForm(false)}>Cancel</Btn><Btn type="submit" level="primary" size="xs" loading={busy === 'new'}>Add action</Btn></div>
        </form>
      )}

      {actions.length === 0 && !showForm && <Empty compact>No open actions. Use “Find next actions” to have the agent read the threads and propose some.</Empty>}

      {proposed.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] m-0" style={{ color: 'var(--primary-hex)' }}>Proposed by the agent · {proposed.length}</p>
          <ul className="m-0 p-0 list-none divide-y divide-[--border-subtle]">
            {proposed.map(a => (
              <ActionRow key={a.id} a={a} today={today} busy={busy === a.id} proposed
                onAccept={() => patch(a, { status: 'open' })} onDismiss={() => patch(a, { status: 'dismissed' })} />
            ))}
          </ul>
        </div>
      )}

      {open.length > 0 && (
        <div>
          {proposed.length > 0 && <p className="px-4 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground m-0">Open · {open.length}</p>}
          <ul className="m-0 p-0 list-none divide-y divide-[--border-subtle]">
            {open.map(a => (
              <ActionRow key={a.id} a={a} today={today} busy={busy === a.id}
                onDone={() => patch(a, { status: 'done' })} onDismiss={() => patch(a, { status: 'dismissed' })} />
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}

function ActionRow({ a, today, busy, proposed, onAccept, onDone, onDismiss }: {
  a: CompanyAction; today: string; busy: boolean; proposed?: boolean
  onAccept?: () => void; onDone?: () => void; onDismiss: () => void
}) {
  const overdue = a.due_date && a.due_date < today
  return (
    <li className={cn('px-4 py-2.5 flex items-start gap-3', proposed && 'bg-[--primary-light-bg]/40')}>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium m-0 flex items-center gap-1.5 flex-wrap">
          {a.title}
          <Chip tone="neutral">{ACTION_KIND_LABEL[a.kind]}</Chip>
          {a.priority === 'high' && <Chip tone={PRIORITY_TONE[a.priority]}>High</Chip>}
        </p>
        {a.detail && <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5">{a.detail}</p>}
        {a.evidence && proposed && <p className="text-[11px] text-muted-foreground/80 italic m-0 mt-0.5">“{a.evidence}”</p>}
        <p className="text-[11px] text-muted-foreground m-0 mt-1 flex items-center gap-3 flex-wrap">
          {a.due_date && <span className={cn('inline-flex items-center gap-1', overdue && 'font-semibold')} style={overdue ? { color: 'var(--error)' } : undefined}><CalendarClock size={11} /> {overdue ? 'Overdue · ' : 'Due '}{fmtDate(a.due_date)}</span>}
          {a.owner_email && <span className="inline-flex items-center gap-1"><User size={11} /> {a.owner_email.split('@')[0]}</span>}
          {a.thread_id && <Link href={`/engagement?lead=${a.thread_id}`} className="inline-flex items-center gap-1 text-primary no-underline hover:underline"><Mail size={11} /> Open thread</Link>}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {proposed
          ? <Btn size="xs" level="primary" onClick={onAccept} loading={busy} title="Accept"><Check size={12} /> Accept</Btn>
          : <Btn size="xs" level="secondary" onClick={onDone} loading={busy} title="Mark done"><Check size={12} /> Done</Btn>}
        <button onClick={onDismiss} disabled={busy} title="Dismiss" aria-label="Dismiss" className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer border-0 bg-transparent"><X size={13} /></button>
      </div>
    </li>
  )
}
