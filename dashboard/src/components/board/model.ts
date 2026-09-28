/**
 * What the board derives from raw rows: urgency, health, "pressing now", and the labels and
 * tones every badge uses. Pure functions, so the table, the cards and the strip never disagree.
 */
import type { BoardCompany, BoardTask, TaskPriority, TaskStatus } from '@/lib/crm/board'
import type { StaffMember } from '@/lib/crm/staff'

export type Tone = 'red' | 'amber' | 'blue' | 'teal' | 'green' | 'neutral'
export type Health = 'good' | 'watch' | 'at_risk'
export type Urgency = 'overdue' | 'today' | 'week' | 'later' | 'none'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'On track', awaiting_reply: 'Awaiting client reply', blocked: 'Blocked', complete: 'Complete',
}
export const STATUS_TONE: Record<TaskStatus, Tone> = { open: 'blue', awaiting_reply: 'amber', blocked: 'red', complete: 'green' }

export const PRIORITY_LABEL: Record<TaskPriority, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
export const PRIORITY_TONE: Record<TaskPriority, Tone> = { critical: 'red', high: 'amber', medium: 'blue', low: 'neutral' }
const PRIORITY_RANK: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export const HEALTH_LABEL: Record<Health, string> = { good: 'Healthy', watch: 'Watch', at_risk: 'At risk' }
export const HEALTH_TONE: Record<Health, Tone> = { good: 'green', watch: 'amber', at_risk: 'red' }

/** Tailwind classes per tone. Text carries the meaning; colour only reinforces it. */
export const TONE_CLASS: Record<Tone, string> = {
  red:     'bg-rose-50 text-rose-700 ring-rose-200',
  amber:   'bg-amber-50 text-amber-800 ring-amber-200',
  blue:    'bg-blue-50 text-blue-700 ring-blue-200',
  teal:    'bg-teal-50 text-teal-700 ring-teal-200',
  green:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
}

/** A stable colour per employee, so the same initials look the same everywhere. */
const PALETTE = ['bg-blue-600', 'bg-teal-600', 'bg-amber-600', 'bg-rose-600', 'bg-indigo-600', 'bg-emerald-600', 'bg-fuchsia-600', 'bg-cyan-700']
export function employeeColour(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
export function initialsOf(name: string): string {
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('') || '?'
}
export function staffByEmail(staff: StaffMember[]): Map<string, StaffMember> {
  return new Map(staff.map(s => [s.email, s]))
}

// ── Dates ───────────────────────────────────────────────────────────────────────────────────
export function daysUntil(iso: string | null | undefined, today: string): number | null {
  if (!iso) return null
  const [y1, m1, d1] = today.split('-').map(Number)
  const [y2, m2, d2] = iso.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}
export function urgencyOf(iso: string | null | undefined, today: string): Urgency {
  const d = daysUntil(iso, today)
  if (d === null) return 'none'
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d <= 7) return 'week'
  return 'later'
}
export function deadlineText(iso: string | null | undefined, today: string): string {
  const d = daysUntil(iso, today)
  if (d === null) return 'No deadline'
  if (d < -1) return `${-d} days overdue`
  if (d === -1) return '1 day overdue'
  if (d === 0) return 'Due today'
  if (d === 1) return 'Due tomorrow'
  if (d <= 7) return `Due in ${d} days`
  return `Due ${fmtShort(iso!)}`
}
export function fmtShort(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  const d = Math.floor(s / 86_400)
  return d === 1 ? 'yesterday' : `${d}d ago`
}
export function fmtMoney(n: number, currency = 'SGD'): string {
  return `${currency} ${n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export function fmtMoneyCompact(n: number, currency = 'SGD'): string {
  if (n >= 1000) return `${currency} ${(n / 1000).toFixed(1)}k`
  return fmtMoney(n, currency)
}

// ── Tasks ───────────────────────────────────────────────────────────────────────────────────
export const isOpen = (t: BoardTask) => t.status !== 'complete'

/** Most urgent first: overdue, then due today, then priority, then nearest deadline. */
export function sortTasks(tasks: BoardTask[], today: string): BoardTask[] {
  const rank = (t: BoardTask) => {
    if (!isOpen(t)) return 1_000_000
    const u = urgencyOf(t.due_on, today)
    const base = u === 'overdue' ? 0 : u === 'today' ? 10_000 : t.priority === 'critical' ? 20_000 : u === 'week' ? 30_000 : u === 'later' ? 40_000 : 50_000
    const d = daysUntil(t.due_on, today)
    return base + PRIORITY_RANK[t.priority] * 100 + (d === null ? 99 : Math.max(-99, Math.min(99, d)) + 50)
  }
  return [...tasks].sort((a, b) => rank(a) - rank(b) || a.position - b.position)
}

// ── Company derivations ─────────────────────────────────────────────────────────────────────
export interface Derived {
  health: Health
  /** One line: what is most pressing right now. */
  pressing: { text: string; tone: Tone; task: BoardTask | null }
  nextDeadline: string | null
  nextDeadlineKind: 'task' | 'payment' | 'renewal' | null
  openCount: number
  overdueTasks: number
  dueToday: number
  dueThisWeek: number
  owners: string[]
  /** Lower is more urgent. */
  rank: number
  renewalSoon: boolean
}

export function derive(c: BoardCompany, today: string): Derived {
  const open = sortTasks(c.tasks.filter(isOpen), today)
  const overdueTasks = open.filter(t => urgencyOf(t.due_on, today) === 'overdue').length
  const dueToday = open.filter(t => urgencyOf(t.due_on, today) === 'today').length
  const dueThisWeek = open.filter(t => { const u = urgencyOf(t.due_on, today); return u === 'today' || u === 'week' }).length
  const blocked = open.some(t => t.status === 'blocked')
  const critical = open.some(t => t.priority === 'critical')
  const renewalDays = daysUntil(c.nextRenewalDate, today)
  const renewalSoon = renewalDays !== null && renewalDays >= 0 && renewalDays <= 60
  // Money is deliberately absent here: debit notes are still being entered and receipts are
  // not yet recorded, so an "overdue" balance says nothing about the client.
  const health: Health = (overdueTasks > 0 || blocked || critical) ? 'at_risk'
    : (c.needsReply > 0 || dueThisWeek > 0 || renewalSoon) ? 'watch' : 'good'

  const owners = Array.from(new Set([
    ...(c.owner_email ? [c.owner_email] : []),
    ...open.flatMap(t => [t.primary_assignee, ...t.collaborators]).filter((e): e is string => !!e),
  ]))

  const top = open[0] ?? null
  let pressing: Derived['pressing']
  if (top) {
    const u = urgencyOf(top.due_on, today)
    pressing = { text: top.title, tone: u === 'overdue' || top.status === 'blocked' ? 'red' : u === 'today' || top.priority === 'critical' ? 'amber' : top.status === 'awaiting_reply' ? 'amber' : 'blue', task: top }
  } else if (c.needsReply > 0) {
    pressing = { text: `${c.needsReply} email${c.needsReply === 1 ? '' : 's'} awaiting our reply`, tone: 'amber', task: null }
  } else if (renewalSoon) {
    pressing = { text: `Renews in ${renewalDays} day${renewalDays === 1 ? '' : 's'}`, tone: 'amber', task: null }
  } else {
    pressing = { text: 'No open items', tone: 'neutral', task: null }
  }

  // Nearest of: task deadline, renewal.
  let nextDeadline: string | null = null
  let nextDeadlineKind: Derived['nextDeadlineKind'] = null
  const firstDated = open.find(t => t.due_on)
  if (firstDated?.due_on) { nextDeadline = firstDated.due_on; nextDeadlineKind = 'task' }
  if (c.nextRenewalDate && renewalSoon && (!nextDeadline || c.nextRenewalDate < nextDeadline)) { nextDeadline = c.nextRenewalDate; nextDeadlineKind = 'renewal' }

  const rank =
    overdueTasks > 0 ? 0
    : dueToday > 0 ? 200
    : blocked ? 300
    : critical ? 400
    : c.needsReply > 0 ? 500
    : dueThisWeek > 0 ? 600
    : renewalSoon ? 700
    : open.length > 0 ? 800
    : 900

  return { health, pressing, nextDeadline, nextDeadlineKind, openCount: open.length, overdueTasks, dueToday, dueThisWeek, owners, rank, renewalSoon }
}

export type UrgencyKey = 'overdue' | 'today' | 'week' | 'renewals' | 'claims' | 'rfqs' | 'awaiting'

export function matchesUrgency(c: BoardCompany, d: Derived, key: UrgencyKey, today: string): boolean {
  switch (key) {
    case 'overdue':  return d.overdueTasks > 0
    case 'today':    return d.dueToday > 0
    case 'week':     return d.dueThisWeek > 0
    case 'renewals': return d.renewalSoon
    case 'claims':   return (c.threadsByCategory.claim ?? 0) > 0
    case 'rfqs':     return (c.threadsByCategory.rfq ?? 0) > 0 || c.openQuotes > 0
    case 'awaiting': return c.needsReply > 0 || c.tasks.some(t => isOpen(t) && t.status === 'awaiting_reply')
  }
  void today
  return false
}
