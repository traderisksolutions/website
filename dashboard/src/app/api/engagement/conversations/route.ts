/**
 * GET /api/engagement/conversations: one entry per email thread (not per contact), as the viewer
 * may see it. ?paged=1 is the Inbox: { rows, total, counts, nextOffset, offset, mailboxes }; without
 * it, the array of the newest 200. The reads are in src/lib/mail/inbox-conversations.ts, which the
 * Inbox page also uses for its first screen.
 */
import { NextRequest, NextResponse } from 'next/server'
import { withStaffOrCron } from '@/lib/auth/guard'
import { currentUserEmail } from '@/lib/crm/auth'
import { inboxConversations } from '@/lib/mail/inbox-conversations'

export const GET = withStaffOrCron(async (req: NextRequest) => {
  try {
    const { rows, page } = await inboxConversations(req.nextUrl.searchParams, await currentUserEmail())
    return NextResponse.json(page ? { rows, ...page } : rows)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
})
