/**
 * PATCH  /api/board/tasks/[taskId] → any of { title, note, dueOn, status, priority, primaryAssignee, collaborators }
 * DELETE /api/board/tasks/[taskId]
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { currentUserEmail }          from '@/lib/crm/auth'
import { logActivity }               from '@/lib/log-activity'
import { updateTask, removeTask, taskCompany, companyNameOf, staffName } from '@/lib/crm/board'
import { listStaff }                 from '@/lib/crm/staff'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { taskId } = await params
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const by = await currentUserEmail()
    const patch: Parameters<typeof updateTask>[1] = {}
    if (typeof body.title === 'string') patch.title = body.title
    if ('note' in body) patch.note = typeof body.note === 'string' ? body.note : null
    if ('dueOn' in body) patch.dueOn = typeof body.dueOn === 'string' ? body.dueOn : null
    if (typeof body.status === 'string') patch.status = body.status as never
    if (typeof body.priority === 'string') patch.priority = body.priority as never
    if ('primaryAssignee' in body) patch.primaryAssignee = typeof body.primaryAssignee === 'string' ? body.primaryAssignee : null
    if (Array.isArray(body.collaborators)) patch.collaborators = body.collaborators.map(String)

    const task = await updateTask(taskId, patch, by)
    const [companyName, staff] = await Promise.all([companyNameOf(task.company_id), listStaff()])
    const action = patch.status === 'complete' ? 'board.complete_task'
      : patch.status ? (patch.status === 'open' && 'status' in body && Object.keys(patch).length === 1 ? 'board.reopen_task' : 'board.status_task')
      : ('primaryAssignee' in patch || 'collaborators' in patch) ? 'board.assign_task'
      : 'board.edit_task'
    void logActivity({ action, resource_type: 'board', resource_id: task.id, new_value: { companyId: task.company_id, companyName, title: task.title, status: task.status, assignedName: staffName(task.primary_assignee, staff) } })
    return NextResponse.json({ task })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { taskId } = await params
  try {
    const info = await taskCompany(taskId)
    const removed = await removeTask(taskId)
    if (removed && info) void logActivity({ action: 'board.remove_task', resource_type: 'board', resource_id: taskId, new_value: { companyId: info.companyId, companyName: info.companyName, title: info.title } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
