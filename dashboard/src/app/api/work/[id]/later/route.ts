/**
 * POST /api/work/:id/later { choice } → "Come back later": afternoon, tomorrow, monday,
 * client_reply or insurer_reply. { choice: null } brings the item back now.
 */
import { NextRequest, NextResponse } from 'next/server'
import { setLater } from '@/lib/today/data'
import { LATER_CHOICES, type LaterChoice } from '@/lib/today/rules'
import { withStaffOrCron } from '@/lib/auth/guard'

export const POST = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }, { user }) => {
  const actor = user?.email.toLowerCase() ?? null
  if (!actor) return NextResponse.json({ error: 'Sign in to act on work items.' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null) as { choice?: string | null } | null
  const choice = body?.choice ?? null
  if (choice !== null && !(LATER_CHOICES as string[]).includes(choice)) return NextResponse.json({ error: 'Unknown choice.' }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, ...await setLater(id, choice as LaterChoice | null, actor.toLowerCase()) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
})
