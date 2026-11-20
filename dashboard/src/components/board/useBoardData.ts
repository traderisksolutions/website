'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BoardPayload, BoardTask } from '@/lib/crm/board'
export type SyncState = 'idle' | 'syncing' | 'saved' | 'error'
import { derive, isOpen, staffByEmail, urgencyOf, type Derived } from './model'
import type { BoardActions } from './actions'
import { unwrap } from '@/lib/action-result'
import { addBoardTask, boardData, removeBoardTask, updateBoardTask, updateCompany } from '@/app/companies/actions'

/**
 * The one source of truth for everything company-shaped on screen. Home and Companies both
 * read it, so a task ticked on one is ticked on the other, and both hear the database change
 * feed. Every write is applied locally first and synced behind it.
 */

export type Row = { company: BoardPayload['companies'][number]; d: Derived }

/** `initial`: the board as read on the server. Given, nothing is fetched on mount; null or absent, it is read here. */
export function useBoardData(initial?: BoardPayload | null) {
  const [data, setData] = useState<BoardPayload | null>(initial ?? null)
  const [error, setError] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncState>('idle')
  const reloadTimer = useRef<number | null>(null)
  const savedTimer = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const d = unwrap(await boardData())
      setData(d); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  const hadInitial = useRef(!!initial)
  useEffect(() => { if (!hadInitial.current) void load() }, [load])

  // The board is every client company with its to-dos: one heavy read. It was re-read every 20s
  // in every open tab, which kept the database busy for nothing (20 Nov 2026). Now it reloads when
  // the person comes back to the tab and the copy is over two minutes old; edits here sync at once.
  const loadedAt = useRef(0)
  useEffect(() => { if (data) loadedAt.current = Date.now() }, [data])
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > 120_000) void load() }
    document.addEventListener('visibilitychange', back)
    return () => {
      document.removeEventListener('visibilitychange', back)
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
        const task = unwrap(await addBoardTask({ companyId, ...input })) as BoardTask
        patchLocal(tmpId, () => task)
        flashSaved()
        return task
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
        const task = unwrap(await updateBoardTask(taskId, patch)) as BoardTask
        patchLocal(taskId, () => task)
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
        unwrap(await removeBoardTask(taskId))
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
      const d = unwrap(await updateCompany(companyId, body))
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
