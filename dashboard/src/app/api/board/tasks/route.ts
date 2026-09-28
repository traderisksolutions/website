/** POST /api/board/tasks → { companyId, title, note?, dueOn?, status?, priority?, primaryAssignee?, collaborators? } */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { currentUserEmail }          from '@/lib/crm/auth'
import { logActivity }               from '@/lib/log-activity'
import { addTask, companyNameOf, staffName } from '@/lib/crm/board'
import { listStaff }                 from '@/lib/crm/staff'

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const companyId = String(body.companyId ?? '')
    if (!companyId) return NextResponse.json({ error: 'Which company?' }, { status: 400 })
    const by = await currentUserEmail()
    const task = await addTask(companyId, {
      title: typeof body.title === 'string' ? body.title : '',
      note: typeof body.note === 'string' ? body.note : null,
      dueOn: typeof body.dueOn === 'string' ? body.dueOn : null,
      status: body.status as never,
      priority: body.priority as never,
      primaryAssignee: typeof body.primaryAssignee === 'string' ? body.primaryAssignee : null,
      collaborators: Array.isArray(body.collaborators) ? body.collaborators.map(String) : [],
    }, by)
    const [companyName, staff] = await Promise.all([companyNameOf(companyId), listStaff()])
    void logActivity({ action: 'board.add_task', resource_type: 'board', resource_id: task.id, new_value: { companyId, companyName, title: task.title, assignedName: staffName(task.primary_assignee, staff) } })
    return NextResponse.json({ task })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
