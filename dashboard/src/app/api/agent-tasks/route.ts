/**
 * GET /api/agent-tasks → { tasks } — the agents' hand-off queue, newest first.
 *   ?status=needs_human (default) | queued | running | failed | done | skipped | all
 *   ?agent=resolver      one agent only
 *   ?limit=100           at most 500
 * needs_human rows are the questions only a person answers; answer them with
 * POST /api/agent-tasks/:id/resolve.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { sb, enc } from '@/lib/crm/db'
import { AGENT_NAMES } from '@/lib/agent-tasks/queue'

const STATUSES = new Set(['queued', 'running', 'done', 'failed', 'needs_human', 'skipped', 'all'])

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const q = req.nextUrl.searchParams
  const status = q.get('status') ?? 'needs_human'
  const agent = q.get('agent')
  const limit = Math.min(500, Math.max(1, Number(q.get('limit') ?? 100) || 100))
  if (!STATUSES.has(status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 })
  if (agent && !(AGENT_NAMES as readonly string[]).includes(agent)) return NextResponse.json({ error: 'Unknown agent.' }, { status: 400 })
  try {
    const filters = [status !== 'all' ? `status=eq.${enc(status)}` : '', agent ? `agent=eq.${enc(agent)}` : ''].filter(Boolean).join('&')
    const tasks = await sb(`agent_tasks?${filters ? `${filters}&` : ''}select=id,agent,kind,status,company_id,policy_id,work_item_id,thread_id,message_id,payload,result,attempts,error,created_by_agent,created_at,finished_at,run_after,companies(company_name),email_threads(subject)&order=created_at.desc&limit=${limit}`)
    return NextResponse.json({ tasks })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
