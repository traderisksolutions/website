'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, X, Sparkles, Plus, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, Btn, Chip, Empty, Field, inputCls } from './primitives'
import { fmtDate, todaySGT } from '@/lib/crm/format'
import { ACTION_KINDS, ACTION_KIND_LABEL, type CompanyAction, type ActionKind, type ActionPriority } from '@/lib/crm/types'

/** The to-do list: agent proposals awaiting a decision, then what is open. */
export function ActionsPanel({ companyId, actions, onChange, title = 'To do' }: {
  companyId: string
  actions: CompanyAction[]
  onChange: (next: CompanyAction[]) => void
  title?: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{ title: string; kind: ActionKind; priority: ActionPriority; due_date: string }>({ title: '', kind: 'general', priority: 'medium', due_date: '' })

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
      const created = d.created as CompanyAction[]
      onChange([...created, ...actions])
      if (created.length === 0) setError('Nothing new to propose — everything the agent found is already listed.')
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
      setForm({ title: '', kind: 'general', priority: 'medium', due_date: '' })
      setShowForm(false)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(null) }
  }

  return (
    <SectionCard
      title={title}
      actions={
        <>
          <Btn size="xs" level="tertiary" onClick={() => setShowForm(s => !s)}><Plus size={12} /> Add</Btn>
          <Btn size="xs" level="tertiary" onClick={extract} loading={extracting}><Sparkles size={12} /> Find next actions</Btn>
        </>
      }
    >
      {error && <p className="text-[12px] text-destructive mb-2 m-0">{error}</p>}

      {showForm && (
        <form onSubmit={add} className="mb-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
          <Field label="What needs doing"><input autoFocus className={inputCls} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Chase QBE for the WICA quote" required /></Field>
          <Field label="Type"><select className={inputCls} value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as ActionKind }))}>{ACTION_KINDS.map(k => <option key={k} value={k}>{ACTION_KIND_LABEL[k]}</option>)}</select></Field>
          <Field label="Due"><input type="date" className={inputCls} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></Field>
          <div className="sm:col-span-3 flex justify-end gap-2"><Btn type="button" level="tertiary" size="xs" onClick={() => setShowForm(false)}>Cancel</Btn><Btn type="submit" level="primary" size="xs" loading={busy === 'new'}>Add</Btn></div>
        </form>
      )}

      {actions.length === 0 && !showForm && <Empty compact>Nothing to do. Use “Find next actions” to have the agent read the threads.</Empty>}

      <ul className="m-0 p-0 list-none flex flex-col">
        {[...proposed, ...open].map(a => {
          const isProposed = a.status === 'proposed'
          const overdue = a.due_date && a.due_date < today
          return (
            <li key={a.id} className="flex items-start gap-3 py-2 border-b border-[--border-subtle] last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] m-0 flex items-center gap-1.5 flex-wrap">
                  {isProposed && <Chip tone="blue"><Sparkles size={10} /> Proposed</Chip>}
                  <span className={cn(!isProposed && 'font-medium')}>{a.title}</span>
                  <Chip tone="neutral">{ACTION_KIND_LABEL[a.kind]}</Chip>
                  {a.priority === 'high' && <Chip tone="red">High</Chip>}
                </p>
                {a.detail && <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5">{a.detail}</p>}
                {a.evidence && isProposed && <p className="text-[11px] text-muted-foreground/80 italic m-0 mt-0.5">“{a.evidence}”</p>}
                <p className="text-[11px] text-muted-foreground m-0 mt-0.5 flex items-center gap-3 flex-wrap">
                  {a.due_date && <span className={cn(overdue && 'font-semibold')} style={overdue ? { color: 'var(--error)' } : undefined}>{overdue ? 'Overdue · ' : 'Due '}{fmtDate(a.due_date)}</span>}
                  {a.owner_email && <span>{a.owner_email.split('@')[0]}</span>}
                  {a.thread_id && <Link href={`/engagement?lead=${a.thread_id}`} className="inline-flex items-center gap-1 text-primary no-underline hover:underline"><Mail size={11} /> Open thread</Link>}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {isProposed
                  ? <Btn size="xs" level="primary" onClick={() => patch(a, { status: 'open' })} loading={busy === a.id}><Check size={12} /> Accept</Btn>
                  : <Btn size="xs" level="secondary" onClick={() => patch(a, { status: 'done' })} loading={busy === a.id}><Check size={12} /> Done</Btn>}
                <button onClick={() => patch(a, { status: 'dismissed' })} disabled={busy === a.id} title="Dismiss" aria-label="Dismiss" className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer border-0 bg-transparent"><X size={13} /></button>
              </div>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}
