'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BoardPayload, BoardTask } from '@/lib/crm/board'
export type SyncState = 'idle' | 'syncing' | 'saved' | 'error'
import { derive, isOpen, staffByEmail, urgencyOf, type Derived } from './model'
import type { BoardActions } from './actions'

/**
 * The one source of truth for everything company-shaped on screen. Home and Companies both
 * read it, so a task ticked on one is ticked on the other, and both hear the database change
 * feed. Every write is applied locally first and synced behind it.
 */

export type Row = { company: BoardPayload['companies'][number]; d: Derived }

export function useBoardData() {
  const [data, setData] = useState<BoardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncState>('idle')
  const reloadTimer = useRef<number | null>(null)
  const savedTimer = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/board', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not load companies.')
      setData(d); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  useEffect(() => { void load() }, [load])

  // Was a realtime subscription plus a 45s safety poll. Cloud SQL cannot push, so the poll is
  // now the only mechanism and runs more often to compensate.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    const poll = window.setInterval(tick, 20_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', tick)
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
    }
  }, [load])

  const today = data?.today ?? new Date().toISOString().slice(0, 10)
  const staffList = useMemo(() => data?.staff ?? [], [data])
  const staff = useMemo(() => staffByEmail(staffList), [staffList])
  const me = data?.me ?? null

  const flashSaved = useCallback(() => {
    setSync('saved')
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setSync('idle'), 2500)
  }, [])
  const patchLocal = useCallback((taskId: string, fn: (t: BoardTask) => BoardTask) => {
    setData(d => d ? { ...d, companies: d.companies.map(c => ({ ...c, tasks: c.tasks.map(t => t.id === taskId ? fn(t) : t) })) } : d)
  }, [])

  const actions: BoardActions = useMemo(() => ({
    async addTask(companyId, input) {
      setSync('syncing')
      const tmpId = `tmp-${Date.now()}`
      const optimistic: BoardTask = {
        id: tmpId, company_id: companyId, title: input.title ?? '', note: input.note ?? null, due_on: input.dueOn ?? null,
        status: input.status ?? 'open', priority: input.priority ?? 'medium', primary_assignee: input.primaryAssignee ?? null,
        collaborators: input.collaborators ?? [], created_by: me, completed_at: null, completed_by: null, position: 9999,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), commentCount: 0,
      }
      setData(d => d ? { ...d, companies: d.companies.map(c => c.id === companyId ? { ...c, tasks: [...c.tasks, optimistic] } : c) } : d)
      try {
        const r = await fetch('/api/board/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...input }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        patchLocal(tmpId, () => d.task)
        flashSaved()
        return d.task
      } catch {
        setData(d => d ? { ...d, companies: d.companies.map(c => ({ ...c, tasks: c.tasks.filter(t => t.id !== tmpId) })) } : d)
        setSync('error')
        return null
      }
    },
    async updateTask(taskId, patch) {
      setSync('syncing')
      const before: { t: BoardTask | null } = { t: null }
      patchLocal(taskId, t => {
        before.t = t
        return {
          ...t,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...('note' in patch ? { note: patch.note ?? null } : {}),
          ...('dueOn' in patch ? { due_on: patch.dueOn ?? null } : {}),
          ...(patch.status ? { status: patch.status, completed_at: patch.status === 'complete' ? new Date().toISOString() : null } : {}),
          ...(patch.priority ? { priority: patch.priority } : {}),
          ...('primaryAssignee' in patch ? { primary_assignee: patch.primaryAssignee ?? null } : {}),
          ...('collaborators' in patch ? { collaborators: patch.collaborators ?? [] } : {}),
        }
      })
      try {
        const r = await fetch(`/api/board/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        patchLocal(taskId, () => d.task)
        flashSaved()
      } catch {
        if (before.t) { const t = before.t; patchLocal(taskId, () => t) }
        setSync('error')
      }
    },
    async deleteTask(taskId) {
      setSync('syncing')
      const removed: { t: BoardTask | null } = { t: null }
      setData(d => d ? { ...d, companies: d.companies.map(c => { const t = c.tasks.find(x => x.id === taskId); if (t) removed.t = t; return { ...c, tasks: c.tasks.filter(x => x.id !== taskId) } }) } : d)
      try {
        const r = await fetch(`/api/board/tasks/${taskId}`, { method: 'DELETE' })
        if (!r.ok) throw new Error('delete failed')
        flashSaved()
      } catch {
        if (removed.t) { const t = removed.t; setData(d => d ? { ...d, companies: d.companies.map(c => c.id === t.company_id ? { ...c, tasks: [...c.tasks, t] } : c) } : d) }
        setSync('error')
      }
    },
  }), [me, patchLocal, flashSaved])

  /** Change a company field (owner, stage, confirmed) and reflect it locally at once. */
  const patchCompany = useCallback(async (companyId: string, body: Record<string, unknown>) => {
    setSync('syncing')
    try {
      const r = await fetch(`/api/companies/${companyId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setData(x => x ? { ...x, companies: x.companies.map(c => c.id === companyId ? { ...c, ...d.company } : c) } : x)
      flashSaved()
    } catch { setSync('error') }
  }, [flashSaved])

  const rows: Row[] = useMemo(() => (data?.companies ?? []).map(company => ({ company, d: derive(company, today) })), [data, today])

  const workloads = useMemo(() => {
    const m = new Map<string, { open: number; overdue: number }>()
    for (const r of rows) for (const t of r.company.tasks) {
      if (!isOpen(t)) continue
      for (const e of [t.primary_assignee, ...t.collaborators]) {
        if (!e) continue
        const cur = m.get(e) ?? { open: 0, overdue: 0 }
        cur.open++; if (urgencyOf(t.due_on, today) === 'overdue') cur.overdue++
        m.set(e, cur)
      }
    }
    return m
  }, [rows, today])

  return { data, rows, error, sync, actions, patchCompany, workloads, staff, staffList, me, today, reload: load }
}
