/**
 * GET  /api/engagement/thread/:id/referral → { tag, suggestion }: a person's referral mark on the
 *                                            thread, and what the rules read when there is none.
 * POST /api/engagement/thread/:id/referral { referral: true }   mark the thread as a referral's
 *                                          { referral: false }  mark it as not a referral
 *                                          { referral: null }   clear the mark
 * The mark is on this thread alone: no company's kind changes and the thread stays where it is
 * filed (crm/thread-referral.ts). No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { currentUserEmail } from '@/lib/crm/auth'
import { setReferralTag, threadReferral } from '@/lib/crm/thread-referral'
import { logActivity } from '@/lib/log-activity'
import { threadVisibleTo, PRIVATE_THREAD } from '@/lib/mail/visibility-server'
import { withStaffOrCron } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Thread id is not valid.' }, { status: 400 })
  try {
    if (!(await threadVisibleTo(id, await currentUserEmail()))) return NextResponse.json(PRIVATE_THREAD, { status: 403 })
    return NextResponse.json(await threadReferral(id))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
})

export const POST = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await currentUserEmail()
  if (!actor) return NextResponse.json({ error: 'Sign in to act on this thread.' }, { status: 401 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Thread id is not valid.' }, { status: 400 })
  const b = await req.json().catch(() => null) as { referral?: unknown } | null
  if (b?.referral !== true && b?.referral !== false && b?.referral !== null) return NextResponse.json({ error: 'Say whether the thread is a referral.' }, { status: 400 })
  try {
    if (!(await threadVisibleTo(id, actor))) return NextResponse.json(PRIVATE_THREAD, { status: 403 })
    const was = (await threadReferral(id)).tag
    const now = await setReferralTag(id, b.referral === null ? null : b.referral ? 'yes' : 'no', actor.toLowerCase())
    void logActivity({
      action: 'thread.referral_tagged', resource_type: 'email_thread', resource_id: id,
      old_value: was ? { referral: was.referral, company: was.company } : undefined,
      new_value: now.tag ? { referral: now.tag.referral, company: now.tag.company } : undefined,
      metadata: { by: actor.toLowerCase() },
    })
    return NextResponse.json(now)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
})
