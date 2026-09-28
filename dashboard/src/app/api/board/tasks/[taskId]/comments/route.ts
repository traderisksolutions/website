/**
 * GET  /api/board/tasks/[taskId]/comments → the thread of updates on one item
 * POST /api/board/tasks/[taskId]/comments → { body } adds one; @name mentions are plain text
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { currentUserEmail }          from '@/lib/crm/auth'
import { logActivity }               from '@/lib/log-activity'
import { listComments, addComment, taskCompany } from '@/lib/crm/board'

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { taskId } = await params
  try {
    return NextResponse.json({ comments: await listComments(taskId) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { taskId } = await params
  try {
    const body = await req.json().catch(() => ({})) as { body?: string }
    const author = await currentUserEmail()
    const comment = await addComment(taskId, String(body.body ?? ''), author)
    const info = await taskCompany(taskId)
    if (info) void logActivity({ action: 'board.comment', resource_type: 'board', resource_id: taskId, new_value: { companyId: info.companyId, companyName: info.companyName, title: info.title } })
    return NextResponse.json({ comment })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
