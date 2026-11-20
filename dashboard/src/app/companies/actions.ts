'use server'
/**
 * Companies across the app (21 Nov 2026): the pickers' search and Add as a new company, one
 * company's record and its edits, the board's to-dos and the portfolio. They replace
 * /api/companies, /api/companies/[id] (GET, PATCH), /api/board, /api/board/tasks[/id] and
 * /api/clients/portfolio.
 */
import { staffAction } from '@/lib/auth/action'
import { db, rows, one } from '@/lib/db/client'
import { createClientCompany } from '@/lib/crm/triage'
import { isStage } from '@/lib/crm/stage'
import { emailDomain } from '@/lib/crm/db'
import { isUuid } from '@/lib/placement/api'
import { loadCompanyDetail, updateCompanyRecord, type CompanyEdit } from '@/lib/crm/company-record'
import { listBoard, addTask, updateTask, removeTask, taskCompany, companyNameOf, staffName } from '@/lib/crm/board'
import { listStaff } from '@/lib/crm/staff'
import { loadPortfolio } from '@/lib/clients/portfolio-load'
import type { Portfolio } from '@/lib/clients/portfolio'
import { logActivity } from '@/lib/log-activity'

export type CompanyHit = { id: string; name: string; address: string | null; type: string | null; domain: string | null }

function companyId(id: string): string {
  if (!isUuid(id)) throw new Error('Company id is not valid')
  return id
}

/** Companies whose name contains the text, A to Z (20); with no text, the first 50. */
export async function searchCompanies(search = '') {
  return staffAction('search companies', async () => {
    const q = search.trim()
    let query = db().from('companies').select('id, name:company_name, address, type, domain').order('company_name')
    // ilike takes the text as a value, so commas and brackets in a name cannot break the filter.
    if (q) query = query.ilike('company_name', `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`)
    return rows<CompanyHit>('Company search', query.limit(q ? 20 : 50))
  })
}

export type NewCompany = { name?: string; domain?: string | null; stage?: string; owner_email?: string | null; industry?: string | null; address?: string | null; type?: string | null }

/** Adds a company, or returns the one already on file under that name or domain (`matchedExisting`). */
export async function createCompany(body: NewCompany) {
  return staffAction('create company', async user => {
    const name = body.name?.trim()
    if (!name) throw new Error('Name the company.')
    const domainRaw = (body.domain ?? '').trim().toLowerCase()
    const domain = domainRaw ? (domainRaw.includes('@') ? emailDomain(domainRaw) : domainRaw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]) : null
    const id = await createClientCompany({
      name, domain, stage: isStage(body.stage) ? body.stage : 'client', source: 'manual',
      ownerEmail: body.owner_email ?? user.email, industry: body.industry ?? null, address: body.address ?? null,
    })
    const row = await one<{ id: string; name: string }>('New company', db().from('companies').select('id, name:company_name').eq('id', id).maybeSingle())
    const matchedExisting = !!row?.name && row.name.toLowerCase() !== name.toLowerCase()
    void logActivity({ action: 'company.created', resource_type: 'company', resource_id: id, new_value: { name: row?.name ?? name, typed_as: name } })
    return { id, name: row?.name ?? name, matchedExisting }
  })
}

/** One company with its contacts, policies, payments and value. */
export async function companyDetail(id: string) {
  return staffAction('company detail', async () => loadCompanyDetail(companyId(id)))
}

/** Edits a company: name, owners, kind, domains, stage, notes; confirm the record; pin to Home. */
export async function updateCompany(id: string, edit: CompanyEdit) {
  return staffAction('update company', async user => updateCompanyRecord(companyId(id), edit, user.email))
}

/** Every client and insurer with its to-dos, and who is asking. */
export async function boardData() {
  return staffAction('board', async user => ({ ...(await listBoard()), me: user.email }))
}

export type TaskInput = { companyId?: string; title?: string; note?: string | null; dueOn?: string | null; status?: string; priority?: string; primaryAssignee?: string | null; collaborators?: string[] }

export async function addBoardTask(input: TaskInput) {
  return staffAction('add task', async user => {
    const companyId = String(input.companyId ?? '')
    if (!companyId) throw new Error('Which company?')
    const task = await addTask(companyId, {
      title: input.title ?? '',
      note: input.note ?? null,
      dueOn: input.dueOn ?? null,
      status: input.status as never,
      priority: input.priority as never,
      primaryAssignee: input.primaryAssignee ?? null,
      collaborators: (input.collaborators ?? []).map(String),
    }, user.email)
    const [companyName, staff] = await Promise.all([companyNameOf(companyId), listStaff()])
    void logActivity({ action: 'board.add_task', resource_type: 'board', resource_id: task.id, new_value: { companyId, companyName, title: task.title, assignedName: staffName(task.primary_assignee, staff) } })
    return task
  })
}

/** Edits a to-do. Only the fields present change; `null` clears note, due date and assignee. */
export async function updateBoardTask(taskId: string, body: TaskInput) {
  return staffAction('update task', async user => {
    const patch: Parameters<typeof updateTask>[1] = {}
    if (typeof body.title === 'string') patch.title = body.title
    if ('note' in body) patch.note = typeof body.note === 'string' ? body.note : null
    if ('dueOn' in body) patch.dueOn = typeof body.dueOn === 'string' ? body.dueOn : null
    if (typeof body.status === 'string') patch.status = body.status as never
    if (typeof body.priority === 'string') patch.priority = body.priority as never
    if ('primaryAssignee' in body) patch.primaryAssignee = typeof body.primaryAssignee === 'string' ? body.primaryAssignee : null
    if (Array.isArray(body.collaborators)) patch.collaborators = body.collaborators.map(String)
    const task = await updateTask(taskId, patch, user.email)
    const [companyName, staff] = await Promise.all([companyNameOf(task.company_id), listStaff()])
    const action = patch.status === 'complete' ? 'board.complete_task'
      : patch.status ? (patch.status === 'open' && 'status' in body && Object.keys(patch).length === 1 ? 'board.reopen_task' : 'board.status_task')
      : ('primaryAssignee' in patch || 'collaborators' in patch) ? 'board.assign_task'
      : 'board.edit_task'
    void logActivity({ action, resource_type: 'board', resource_id: task.id, new_value: { companyId: task.company_id, companyName, title: task.title, status: task.status, assignedName: staffName(task.primary_assignee, staff) } })
    return task
  })
}

export async function removeBoardTask(taskId: string) {
  return staffAction('remove task', async () => {
    const info = await taskCompany(taskId)
    const removed = await removeTask(taskId)
    if (removed && info) void logActivity({ action: 'board.remove_task', resource_type: 'board', resource_id: taskId, new_value: { companyId: info.companyId, companyName: info.companyName, title: info.title } })
    return { ok: true as const }
  })
}

// The portfolio reads every debit note; one instance keeps it for 10 minutes.
const portfolioCache = new Map<string, { at: number; p: Portfolio }>()

/** Businesses ranked by commission over the window; `business` narrows it to that business's group. */
export async function portfolio(window: '12m' | 'all' = '12m', business?: string) {
  return staffAction('portfolio', async () => {
    let hit = portfolioCache.get(window)
    if (!hit || Date.now() - hit.at > 10 * 60_000) { hit = { at: Date.now(), p: await loadPortfolio(window) }; portfolioCache.set(window, hit) }
    if (!business) return hit.p
    const { directory } = await import('@/lib/admin/k/deposit')
    const g = (await directory()).group(business)
    return { ...hit.p, rows: hit.p.rows.filter(r => r.id === g) }
  })
}
