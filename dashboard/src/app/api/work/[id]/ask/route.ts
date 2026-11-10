/**
 * POST /api/work/:id/ask { instruction? } → "Ask AI" on a to-do. Rewrites the item's draft as
 * instructed, or writes the first draft from the case's thread when there is none. Returns the
 * draft id; the person sends it through /api/email/send.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { askOnItem } from '@/lib/today/ask'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const actor = await currentUserEmail()
  if (!actor) return NextResponse.json({ error: 'Sign in to ask on a to-do.' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({})) as { instruction?: string }
  const instruction = typeof b.instruction === 'string' ? b.instruction.slice(0, 2000) : null
  try {
    return NextResponse.json(await askOnItem(id, instruction, actor))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
