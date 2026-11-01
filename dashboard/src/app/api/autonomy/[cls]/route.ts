/**
 * POST /api/autonomy/:class { action: 'auto' | 'pause' | 'manual', reason? }
 * A signed-in person switches a candidate class on, pauses it, or sets it back to manual.
 * The switch-on is the one step the ladder never takes by itself.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { setClassStatus } from '@/lib/autonomy'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ cls: string }> }) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  const actor = await currentUserEmail()
  if (!actor) return NextResponse.json({ error: 'Sign in to change the ladder.' }, { status: 401 })
  const { cls } = await params
  const body = await req.json().catch(() => null) as { action?: string; reason?: string } | null
  if (!body || !['auto', 'pause', 'manual'].includes(body.action ?? '')) return NextResponse.json({ error: 'action must be auto, pause or manual' }, { status: 400 })
  try {
    const row = await setClassStatus(cls, body.action as 'auto' | 'pause' | 'manual', actor.toLowerCase(), body.reason ?? null)
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
