/**
 * GET  /api/claims/:id → one claim: register row, timeline (rebuilt messages marked), documents,
 *                        gaps, drafts and the inbox threads with how each joined.
 * POST /api/claims/:id {action:'outcome', stage, amount_settled?} → records settled, declined or
 *                        withdrawn, closes the work item. {action:'refresh'} queues a re-read.
 * Drafts are approved through /api/work/:id, the same as on /work.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { claimDetail } from '@/lib/admin/b/register'
import { sb, enc } from '@/lib/crm/db'
import { enqueue } from '@/lib/agent-tasks/queue'
import { todaySGT } from '@/lib/sgt-time'

const OUTCOMES = new Set(['settled', 'declined', 'withdrawn'])

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const d = await claimDetail(id, todaySGT())
    return d ? NextResponse.json(d) : NextResponse.json({ error: 'No such claim.' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const actor = (await currentUserEmail())?.toLowerCase()
  if (!actor) return NextResponse.json({ error: 'Sign in to act on claims.' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  try {
    if (b.action === 'refresh') {
      await enqueue({ agent: 'claims', kind: 'case_update', work_item_id: id, idem_key: `claims:case_update:${id}:staff:${Date.now()}`, created_by_agent: 'staff' })
      return NextResponse.json({ ok: true })
    }
    if (b.action !== 'outcome' || !OUTCOMES.has(String(b.stage))) return NextResponse.json({ error: 'Choose settled, declined or withdrawn.' }, { status: 400 })
    const amount = b.amount_settled == null || b.amount_settled === '' ? null : Number(b.amount_settled)
    if (amount !== null && !(Number.isFinite(amount) && amount >= 0)) return NextResponse.json({ error: 'The settled amount must be a number.' }, { status: 400 })
    const now = new Date().toISOString()
    await sb('claims?on_conflict=work_item_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ work_item_id: id, stage: b.stage, ...(amount !== null ? { amount_settled: amount } : {}), waiting_on: null, gaps: [], closed_at: now, updated_at: now }),
    })
    await sb(`work_items?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'done', closed_at: now, closed_by: actor, updated_at: now }) })
    await sb('work_item_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: id, kind: 'closed', actor, detail: { outcome: b.stage, amount_settled: amount } }) })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
