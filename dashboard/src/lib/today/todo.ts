/**
 * The home to-do: the Today items that need a person, in the order to clear them. Four sections,
 * Send (a draft is ready), To act (no draft yet), Decide (a question for a person), Read; within a
 * section the lapsed and overdue first, then the nearest deadline, then the longest wait.
 *
 * Pure. Tested in src/__tests__/todo-sections.test.ts.
 */
import { LEVEL_RANK } from './pending'
import type { TodayItem } from './data'

export type TodoSection = 'send' | 'act' | 'decide' | 'read'
export const TODO_SECTIONS: { key: TodoSection; label: string }[] = [
  { key: 'send', label: 'Send' }, { key: 'act', label: 'To act' }, { key: 'decide', label: 'Decide' }, { key: 'read', label: 'Read' },
]

type Sortable = Pick<TodayItem, 'pending' | 'deadline' | 'waiting_since' | 'last_activity_at'>

/** Lapsed and overdue first; then the nearest deadline; then the longest wait. */
export function todoOrder(a: Sortable, b: Sortable): number {
  const lv = LEVEL_RANK[a.pending.level] - LEVEL_RANK[b.pending.level]
  if (lv) return lv
  const da = a.deadline ?? '9999', db = b.deadline ?? '9999'
  if (da !== db) return da < db ? -1 : 1
  return String(a.waiting_since ?? a.last_activity_at ?? '').localeCompare(String(b.waiting_since ?? b.last_activity_at ?? ''))
}

/** An item is a person's when it is theirs or nobody's. */
export function ownedBy(i: Pick<TodayItem, 'owner_email'>, me: string | null): boolean {
  return !i.owner_email || (!!me && i.owner_email.toLowerCase() === me.toLowerCase())
}

export function todoSections(items: readonly TodayItem[], who: 'mine' | 'all', me: string | null): Record<TodoSection, TodayItem[]> {
  const scoped = items.filter(i => who === 'all' || ownedBy(i, me))
  const pick = (g: TodoSection) => scoped.filter(i => i.group === g).sort(todoOrder)
  return { send: pick('send'), act: pick('act'), decide: pick('decide'), read: pick('read') }
}

export const todoCount = (s: Record<TodoSection, TodayItem[]>) => s.send.length + s.act.length + s.decide.length + s.read.length
