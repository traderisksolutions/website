/**
 * PATCH  /api/companies/[id]/actions/[actionId]  { status?, title?, detail?, kind?, priority?, due_date?, owner_email? }
 *        Accepting a proposal is status "open"; finishing is "done"; "dismissed" hides it.
 * DELETE /api/companies/[id]/actions/[actionId]
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { sb, enc }                   from '@/lib/crm/db'
import { currentUserEmail }          from '@/lib/crm/auth'
import { ACTION_KINDS }              from '@/lib/crm/types'
import type { CompanyAction }        from '@/lib/crm/types'

const STATUSES = ['proposed', 'open', 'done', 'dismissed']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id, actionId } = await params
  try {
    const b = await req.json() as Partial<CompanyAction>
    const user = await currentUserEmail()
    const patch: Record<string, unknown> = {}
    if (typeof b.title === 'string' && b.title.trim()) patch.title = b.title.trim()
    if (b.detail !== undefined) patch.detail = b.detail ? String(b.detail).trim() : null
    if (b.kind && (ACTION_KINDS as readonly string[]).includes(b.kind)) patch.kind = b.kind
    if (b.priority && ['high', 'medium', 'low'].includes(b.priority)) patch.priority = b.priority
    if (b.due_date !== undefined) patch.due_date = typeof b.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.due_date) ? b.due_date : null
    if (b.owner_email !== undefined) patch.owner_email = b.owner_email ? String(b.owner_email).toLowerCase() : null
    if (b.status && STATUSES.includes(b.status)) {
      patch.status = b.status
      patch.completed_at = b.status === 'done' ? new Date().toISOString() : null
      if (b.status === 'open' && !b.owner_email) patch.owner_email = patch.owner_email ?? user
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    const rows = await sb<CompanyAction[]>(`company_actions?id=eq.${enc(actionId)}&company_id=eq.${enc(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ action: rows[0] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id, actionId } = await params
  try {
    await sb(`company_actions?id=eq.${enc(actionId)}&company_id=eq.${enc(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
