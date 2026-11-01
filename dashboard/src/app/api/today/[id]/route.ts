/**
 * GET  /api/today/:id → one item for review: drafts, threads, timeline, documents, contacts.
 * POST /api/today/:id { action: 'seen' } → marks a read-only update as read.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { loadItem, markSeen } from '@/lib/today/data'
import { currentStaff } from '@/lib/casework/queue'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const [item, staff] = await Promise.all([loadItem(id), currentStaff()])
    if (!item) return NextResponse.json({ error: 'This item no longer exists.' }, { status: 404 })
    return NextResponse.json({ item, staff })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const actor = await currentUserEmail()
  if (!actor) return NextResponse.json({ error: 'Sign in to act on work items.' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null) as { action?: string } | null
  if (body?.action !== 'seen') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  try {
    await markSeen(id, actor.toLowerCase())
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
