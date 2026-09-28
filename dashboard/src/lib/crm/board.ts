/**
 * The company board: every client as a row, and the pressing items on each.
 *
 * A task is one thing that needs doing for one client, with a primary owner, collaborators, a
 * deadline, a priority and a status. Anyone can add, assign, complete or comment. Every write
 * is mirrored to the audit log so there is always a record of who did what.
 *
 * The board's rows come from the same roll-up the companies list uses, so what a row says
 * about awaiting replies, past-due money and renewals is exactly what the company page says.
 */
import { sb, sbTry, enc, inChunks } from './db'
import { listCompanySummaries } from './aggregates'
import { listStaff, staffName, type StaffMember } from './staff'
import type { CompanySummaryRow } from './types'

export type TaskStatus = 'open' | 'awaiting_reply' | 'blocked' | 'complete'
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'

export const TASK_STATUSES: TaskStatus[] = ['open', 'awaiting_reply', 'blocked', 'complete']
export const TASK_PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low']

export interface BoardTask {
  id: string
  company_id: string
  title: string
  note: string | null
  due_on: string | null
  status: TaskStatus
  priority: TaskPriority
  primary_assignee: string | null
  collaborators: string[]
  created_by: string | null
  completed_at: string | null
  completed_by: string | null
  position: number
  created_at: string
  updated_at: string
  commentCount: number
}

export interface BoardComment {
  id: string
  task_id: string
  author: string | null
  body: string
  created_at: string
}

export interface BoardCompany extends CompanySummaryRow {
  tasks: BoardTask[]
  /** Active threads by category, so the urgency strip can count claims and RFQs. */
  threadsByCategory: Record<string, number>
}

export interface BoardActivity {
  at: string
  who: string
  what: string
  companyId: string | null
  companyName: string | null
}

export interface BoardPayload {
  companies: BoardCompany[]
  staff: StaffMember[]
  me: string | null
  activity: BoardActivity[]
  today: string
}

type TaskRow = Omit<BoardTask, 'commentCount' | 'collaborators'> & { collaborators: string[] | null }
type CatRow = { company_id: string | null; category: string | null }

export async function listBoard(): Promise<BoardPayload> {
  const [companies, staff, tasks, activity] = await Promise.all([
    listCompanySummaries({ kinds: ['client', 'insurer'] }),
    listStaff(),
    sbTry<TaskRow[]>(`board_tasks?select=*&order=position.asc,created_at.asc&limit=2000`, []),
    recentActivity(),
  ])

  const ids = companies.map(c => c.id)
  const cats = ids.length
    ? await inChunks(ids, 100, c => sbTry<CatRow[]>(`email_threads?company_id=in.(${c.join(',')})&deleted_at=is.null&status=eq.active&select=company_id,category`, []))
    : []
  const catsByCompany = new Map<string, Record<string, number>>()
  for (const r of cats) {
    if (!r.company_id) continue
    const cur = catsByCompany.get(r.company_id) ?? {}
    const k = r.category ?? 'general'
    cur[k] = (cur[k] ?? 0) + 1
    catsByCompany.set(r.company_id, cur)
  }

  const taskIds = tasks.map(t => t.id)
  const counts = new Map<string, number>()
  if (taskIds.length) {
    const rows = await inChunks(taskIds, 100, c => sbTry<{ task_id: string }[]>(`board_comments?task_id=in.(${c.join(',')})&select=task_id`, []))
    for (const r of rows) counts.set(r.task_id, (counts.get(r.task_id) ?? 0) + 1)
  }

  const byCompany = new Map<string, BoardTask[]>()
  for (const t of tasks) {
    const full: BoardTask = { ...t, collaborators: t.collaborators ?? [], commentCount: counts.get(t.id) ?? 0 }
    byCompany.set(t.company_id, [...(byCompany.get(t.company_id) ?? []), full])
  }

  const rows: BoardCompany[] = companies.map(c => ({
    ...c,
    tasks: byCompany.get(c.id) ?? [],
    threadsByCategory: catsByCompany.get(c.id) ?? {},
  }))

  return { companies: rows, staff, me: null, activity, today: new Date().toISOString().slice(0, 10) }
}

type AuditRow = { created_at: string; user_name: string | null; user_email: string | null; action: string; new_value: Record<string, unknown> | null }

async function recentActivity(limit = 30): Promise<BoardActivity[]> {
  const rows = await sbTry<AuditRow[]>(`audit_logs?resource_type=eq.board&select=created_at,user_name,user_email,action,new_value&order=created_at.desc&limit=${limit}`, [])
  return rows.map(r => ({
    at: r.created_at,
    who: r.user_name || (r.user_email ?? '').split('@')[0] || 'Someone',
    what: describe(r.action, r.new_value ?? {}),
    companyId: (r.new_value?.companyId as string | undefined) ?? null,
    companyName: (r.new_value?.companyName as string | undefined) ?? null,
  }))
}

function describe(action: string, v: Record<string, unknown>): string {
  const co = (v.companyName as string | undefined) ?? 'a company'
  const task = v.title ? `“${String(v.title).slice(0, 60)}”` : 'an item'
  switch (action) {
    case 'board.add_task':      return `added ${task} on ${co}${v.assignedName ? ` for ${v.assignedName}` : ''}`
    case 'board.complete_task': return `completed ${task} on ${co}`
    case 'board.reopen_task':   return `reopened ${task} on ${co}`
    case 'board.assign_task':   return `handed ${task} on ${co} to ${v.assignedName ?? 'nobody'}`
    case 'board.status_task':   return `marked ${task} on ${co} ${String(v.status ?? '').replace('_', ' ')}`
    case 'board.edit_task':     return `edited ${task} on ${co}`
    case 'board.remove_task':   return `removed ${task} from ${co}`
    case 'board.comment':       return `commented on ${task} on ${co}`
    default:                    return action
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────────────────────

export interface TaskInput {
  title?: string
  note?: string | null
  dueOn?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  primaryAssignee?: string | null
  collaborators?: string[]
}

const isStatus = (v: unknown): v is TaskStatus => typeof v === 'string' && (TASK_STATUSES as string[]).includes(v)
const isPriority = (v: unknown): v is TaskPriority => typeof v === 'string' && (TASK_PRIORITIES as string[]).includes(v)

function cleanEmails(list: unknown, staff: StaffMember[]): string[] {
  if (!Array.isArray(list)) return []
  const known = new Set(staff.map(s => s.email))
  return Array.from(new Set(list.map(e => String(e).toLowerCase().trim()).filter(e => known.has(e))))
}

export async function addTask(companyId: string, input: TaskInput, by: string | null): Promise<BoardTask> {
  const title = (input.title ?? '').trim()
  if (!title) throw new Error('Write what needs doing.')
  const staff = await listStaff()
  const primary = input.primaryAssignee?.toLowerCase().trim() || null
  const maxRows = await sbTry<{ position: number }[]>(`board_tasks?company_id=eq.${enc(companyId)}&select=position&order=position.desc&limit=1`, [])
  const rows = await sb<TaskRow[]>(`board_tasks`, {
    method: 'POST',
    body: JSON.stringify({
      company_id: companyId, title, note: input.note?.trim() || null, due_on: input.dueOn || null,
      status: isStatus(input.status) ? input.status : 'open',
      priority: isPriority(input.priority) ? input.priority : 'medium',
      primary_assignee: primary,
      collaborators: cleanEmails(input.collaborators, staff).filter(e => e !== primary),
      created_by: by, position: (maxRows[0]?.position ?? -1) + 1,
    }),
  })
  return { ...rows[0], collaborators: rows[0].collaborators ?? [], commentCount: 0 }
}

export async function updateTask(taskId: string, patch: TaskInput, by: string | null): Promise<BoardTask> {
  const body: Record<string, unknown> = {}
  if (typeof patch.title === 'string') {
    const t = patch.title.trim()
    if (!t) throw new Error('An item needs some words.')
    body.title = t
  }
  if ('note' in patch) body.note = patch.note?.trim() || null
  if ('dueOn' in patch) body.due_on = patch.dueOn || null
  if (isPriority(patch.priority)) body.priority = patch.priority
  if (isStatus(patch.status)) {
    body.status = patch.status
    body.completed_at = patch.status === 'complete' ? new Date().toISOString() : null
    body.completed_by = patch.status === 'complete' ? by : null
  }
  if ('primaryAssignee' in patch) body.primary_assignee = patch.primaryAssignee?.toLowerCase().trim() || null
  if ('collaborators' in patch) {
    const staff = await listStaff()
    body.collaborators = cleanEmails(patch.collaborators, staff)
  }
  if (Object.keys(body).length === 0) throw new Error('Nothing to change.')
  const rows = await sb<TaskRow[]>(`board_tasks?id=eq.${enc(taskId)}`, { method: 'PATCH', body: JSON.stringify(body) })
  if (!rows[0]) throw new Error('That item no longer exists.')
  const counts = await sbTry<{ task_id: string }[]>(`board_comments?task_id=eq.${enc(taskId)}&select=task_id`, [])
  return { ...rows[0], collaborators: rows[0].collaborators ?? [], commentCount: counts.length }
}

export async function removeTask(taskId: string): Promise<TaskRow | null> {
  const rows = await sbTry<TaskRow[]>(`board_tasks?id=eq.${enc(taskId)}&select=*&limit=1`, [])
  if (!rows[0]) return null
  await sb(`board_tasks?id=eq.${enc(taskId)}`, { method: 'DELETE' })
  return rows[0]
}

export async function listComments(taskId: string): Promise<BoardComment[]> {
  return sbTry<BoardComment[]>(`board_comments?task_id=eq.${enc(taskId)}&select=*&order=created_at.asc`, [])
}

export async function addComment(taskId: string, body: string, author: string | null): Promise<BoardComment> {
  const text = body.trim()
  if (!text) throw new Error('Write something.')
  const rows = await sb<BoardComment[]>(`board_comments`, { method: 'POST', body: JSON.stringify({ task_id: taskId, body: text.slice(0, 4000), author }) })
  return rows[0]
}

export async function taskCompany(taskId: string): Promise<{ companyId: string; companyName: string; title: string } | null> {
  const rows = await sbTry<{ company_id: string; title: string; companies: { company_name: string | null } | null }[]>(
    `board_tasks?id=eq.${enc(taskId)}&select=company_id,title,companies(company_name)&limit=1`, [])
  const r = rows[0]
  return r ? { companyId: r.company_id, companyName: r.companies?.company_name ?? 'Unnamed company', title: r.title } : null
}

export async function companyNameOf(companyId: string): Promise<string> {
  const co = await sbTry<{ company_name: string }[]>(`companies?id=eq.${enc(companyId)}&select=company_name&limit=1`, [])
  return co[0]?.company_name ?? 'Unnamed company'
}

export { staffName }
