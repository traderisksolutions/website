/**
 * POST /api/agent-tasks/:id/resolve — a person answers a needs_human task.
 *   { answer: { company_id?: string, note?: string, ... }, requeue: boolean }
 * requeue true sends the task back to its agent with the answer in payload.human (the resolver
 * files the thread and learns the sender); false closes it as done with the answer on record.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { resolveHuman } from '@/lib/agent-tasks/queue'
import { sbTry, enc } from '@/lib/crm/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const actor = await currentUserEmail()
  if (!actor) return NextResponse.json({ error: 'Sign in to answer agent questions.' }, { status: 401 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown task.' }, { status: 400 })
  const body = await req.json().catch(() => null) as { answer?: Record<string, unknown>; requeue?: boolean } | null
  if (!body || typeof body.answer !== 'object' || body.answer === null || Array.isArray(body.answer)) return NextResponse.json({ error: 'answer must be an object.' }, { status: 400 })
  const answer = body.answer
  if (answer.company_id != null && (typeof answer.company_id !== 'string' || !UUID.test(answer.company_id))) return NextResponse.json({ error: 'company_id must be a company id.' }, { status: 400 })
  if (typeof answer.company_id === 'string') {
    const [c] = await sbTry<{ id: string }[]>(`companies?id=eq.${enc(answer.company_id)}&select=id`, [])
    if (!c) return NextResponse.json({ error: 'No such company.' }, { status: 400 })
  }
  const [task] = await sbTry<{ status: string }[]>(`agent_tasks?id=eq.${enc(id)}&select=status`, [])
  if (!task) return NextResponse.json({ error: 'Unknown task.' }, { status: 404 })
  if (task.status !== 'needs_human') return NextResponse.json({ error: `Task is ${task.status}, not waiting on a person.` }, { status: 409 })
  try {
    await resolveHuman(id, actor.toLowerCase(), answer, body.requeue === true)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
