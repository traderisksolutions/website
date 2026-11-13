/**
 * GET  /api/agent-tasks/approvals → { agents: [{ agent, label, does, waiting, oldest }] }: the
 *      AI work held in the queue (src/lib/agent-tasks/approvals.ts).
 * POST /api/agent-tasks/approvals { agent, count } → runs up to `count` (at most 25) of that
 *      agent's held tasks now, as the person who pressed Run; { done, failed, other }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enc, sb, sbTry } from '@/lib/crm/db'
import { AI_AGENTS, MAX_PER_RUN } from '@/lib/agent-tasks/approvals'
import { logActivity } from '@/lib/log-activity'

export const maxDuration = 300

async function staff() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  return user
}

export async function GET() {
  if (!await staff()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const U = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', K = process.env.SUPABASE_SERVICE_KEY ?? ''
  const agents = await Promise.all(AI_AGENTS.map(async a => {
    const f = `agent_tasks?status=eq.queued&agent=eq.${enc(a.agent)}${a.kind ? `&kind=eq.${enc(a.kind)}` : ''}`
    const r = await fetch(`${U}/rest/v1/${f}&select=id&limit=1`, { headers: { apikey: K, Authorization: `Bearer ${K}`, Prefer: 'count=exact' }, cache: 'no-store' })
    const waiting = Number(r.headers.get('content-range')?.split('/')[1] ?? 0) || 0
    const [first] = waiting ? await sbTry<{ created_at: string }[]>(`${f}&select=created_at&order=created_at.asc&limit=1`, []) : []
    return { ...a, waiting, oldest: first?.created_at ?? null }
  }))
  return NextResponse.json({ agents, max: MAX_PER_RUN })
}

export async function POST(req: NextRequest) {
  const user = await staff()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { agent?: string; count?: number }
  const a = AI_AGENTS.find(x => x.agent === b.agent)
  if (!a) return NextResponse.json({ error: 'Not an AI agent.' }, { status: 400 })
  const count = Math.max(1, Math.min(MAX_PER_RUN, Math.floor(Number(b.count) || 10)))
  // The handlers, and the runner; claimed oldest first, then run one by one inside this request.
  await import('@/lib/admin')
  const { runOne } = await import('@/lib/agent-tasks/runner')
  // Held work may carry a later run_after (a read put back in manual mode); an approved run takes it now.
  const filter = `agent_tasks?status=eq.queued&agent=eq.${enc(a.agent)}${a.kind ? `&kind=eq.${enc(a.kind)}` : ''}`
  const rows = await sbTry<{ id: string; attempts: number }[]>(`${filter}&select=id,attempts&order=created_at.asc&limit=${count}`, [])
  const counts = { done: 0, failed: 0, other: 0 }
  const started = Date.now()
  for (const row of rows) {
    if (Date.now() - started > 240_000) break
    // Claimed one at a time, and only while still queued, so two people never run the same task.
    const [t] = await sb<Record<string, unknown>[]>(`agent_tasks?id=eq.${enc(row.id)}&status=eq.queued`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'running', locked_at: new Date().toISOString(), attempts: (row.attempts ?? 0) + 1 }),
    }).catch(() => [] as Record<string, unknown>[])
    if (!t) continue
    const r = await runOne(t as never)
    counts[r === 'done' ? 'done' : r === 'failed' ? 'failed' : 'other']++
  }
  void logActivity({ action: 'ai.approved_run', resource_type: 'agent_tasks', resource_id: a.agent, new_value: { count, ...counts }, metadata: { by: user.email ?? null } })
  return NextResponse.json(counts)
}
